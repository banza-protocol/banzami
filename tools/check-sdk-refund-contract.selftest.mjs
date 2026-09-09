#!/usr/bin/env node
// Self-test for the refund-contract drift guard (WS2 item 5): prove the guard
// FAILS on each of the five violation classes individually, and PASSES on a good
// dist. Runs the guard as a child process against crafted fixtures.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, 'check-sdk-refund-contract.mjs');

const GOOD_CLIENT = `
    createRefund(params) {
        if (typeof params.idempotency_key !== 'string' || params.idempotency_key.trim() === '') {
            throw new BanzamiConfigError('createRefund requires an explicit idempotency_key');
        }
        return this.request('/refunds', { method: 'POST', body: JSON.stringify({
            source_type: params.source_type, source_id: params.source_id,
            amount_minor: params.amount_minor, currency: params.currency,
            reason: params.reason ?? null, idempotency_key: params.idempotency_key,
        }) });
    }
    getRefund(id) {
        return this.request('/refunds/' + id, { method: 'GET' });
    }
    listRefunds(params = {}) {
        return this.request('/refunds' + this.qs(params), { method: 'GET' });
    }
`;
const GOOD_TYPES = `
export type RefundSourceType = 'ACQUIRING_PAYMENT' | 'WALLET_PAYMENT';
export interface Refund { id: string; source_type: RefundSourceType; source_id: string; merchant_id: string; }
export interface CreateRefundParams { source_type: RefundSourceType; source_id: string; amount_minor: number; currency: string; reason?: string; idempotency_key: string; }
`;

function runGuard(client, types, version, expectVersion) {
  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
  try {
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'dist', 'client.js'), client);
    writeFileSync(join(dir, 'dist', 'types.d.ts'), types);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version }));
    const args = [GUARD, join(dir, 'dist'), join(dir, 'package.json')];
    if (expectVersion) args.push(expectVersion);
    execFileSync('node', args, { stdio: 'pipe' });
    return { pass: true };
  } catch (e) {
    return { pass: false, out: (e.stderr || e.stdout || '').toString() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

let failed = 0;
const check = (name, cond) => { console.log(`${cond ? '✓' : '✗'} ${name}`); if (!cond) failed++; };

// 0. Good dist passes.
check('good dist passes', runGuard(GOOD_CLIENT, GOOD_TYPES, '0.3.0').pass);

// 1. Version mismatch fails.
{ const r = runGuard(GOOD_CLIENT, GOOD_TYPES, '0.2.0', '0.3.0');
  check('version mismatch → fail', !r.pass && /version mismatch/.test(r.out)); }

// 2. Typed-source mismatch (missing source_id forwarding) fails.
{ const bad = GOOD_CLIENT.replace('source_id: params.source_id,', '');
  const r = runGuard(bad, GOOD_TYPES, '0.3.0');
  check('typed-source mismatch → fail', !r.pass && /source_id/.test(r.out)); }

// 3. Missing required idempotency key (no throw) fails.
{ const bad = GOOD_CLIENT.replace(/if \(typeof[\s\S]*?}\n/, '');
  const r = runGuard(bad, GOOD_TYPES, '0.3.0');
  check('missing required idempotency key → fail', !r.pass && /idempotency/.test(r.out)); }

// 4. transaction_id input present fails.
{ const bad = GOOD_CLIENT.replace('source_id: params.source_id,', 'transaction_id: params.transaction_id,');
  const r = runGuard(bad, GOOD_TYPES, '0.3.0');
  check('transaction_id input → fail', !r.pass && /transaction_id/.test(r.out)); }

// 5. Public TRANSACTION token present fails.
{ const badTypes = GOOD_TYPES + `\nexport type Legacy = 'TRANSACTION';\n`;
  const r = runGuard(GOOD_CLIENT, badTypes, '0.3.0');
  check("public TRANSACTION token → fail", !r.pass && /TRANSACTION/.test(r.out)); }

// 6. Auto-minted key (randomUUID) fails.
{ const bad = GOOD_CLIENT.replace('idempotency_key: params.idempotency_key,', 'idempotency_key: params.idempotency_key ?? crypto.randomUUID(),');
  const r = runGuard(bad, GOOD_TYPES, '0.3.0');
  check('auto-minted key (randomUUID) → fail', !r.pass && /auto-generate|randomUUID/i.test(r.out)); }

// 7. The write path regressed to the retired mount.
//    This is the mutation that a docs-only migration leaves behind: everything
//    else about the method is still correct, and every refund 404s.
{ const bad = GOOD_CLIENT.replace("this.request('/refunds'", "this.request('/refunds'");
  const r = runGuard(bad, GOOD_TYPES, '0.3.0');
  check('createRefund on the retired /refunds → fail', !r.pass && /business\/refunds|canonical path/.test(r.out)); }

// 8. Only the READ side regressed. Half-migrated is the harder case to notice by
//    hand — creating works, so the first refund looks fine, and reading it back
//    is what breaks.
{ const bad = GOOD_CLIENT.replace('/refunds/', '/refunds/');
  const r = runGuard(bad, GOOD_TYPES, '0.3.0');
  check('getRefund on the retired path → fail', !r.pass && /business\/refunds/.test(r.out)); }

// 9. The list side alone.
{ const bad = GOOD_CLIENT.replace("'/refunds' + this.qs", "'/refunds' + this.qs");
  const r = runGuard(bad, GOOD_TYPES, '0.3.0');
  check('listRefunds on the retired path → fail', !r.pass && /business\/refunds/.test(r.out)); }

// 10. A COMMENT naming the old path is history, not a call site, and must not
//     fail the guard — otherwise staying green means deleting the record of why
//     the path moved.
{ const ok = '\n    // Was /refunds until the route moved.\n' + GOOD_CLIENT;
  check('a comment naming the retired path still passes', runGuard(ok, GOOD_TYPES, '0.3.0').pass); }

// 11. …and the exemption must not become the hole: a real call site keeps
//     failing even when the same line carries a comment.
{ const bad = GOOD_CLIENT.replace("this.request('/refunds',", "this.request('/refunds', // legacy\n           ");
  const r = runGuard(bad, GOOD_TYPES, '0.3.0');
  check('a call site with a trailing comment still fails', !r.pass && /business\/refunds|canonical path/.test(r.out)); }

if (failed) { console.error(`\n✗ guard self-test: ${failed} case(s) failed`); process.exit(1); }
console.log('\n✓ guard self-test: all violation classes are caught, good dist passes');
