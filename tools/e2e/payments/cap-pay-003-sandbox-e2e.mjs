#!/usr/bin/env node
/**
 * CAP-PAY-003 — QR payments, deployed-Sandbox E2E (PARTIAL).
 *
 * This suite proves the merchant-side QR contract: creation, ownership isolation,
 * validation and the absence of a financial effect before execution.
 *
 * It does NOT prove payment execution, and CAP-PAY-003 cannot be released on it.
 * Execution is blocked upstream: the compliance gate requires the payer to be
 * KYC-approved, and no consumer can reach that state in the Sandbox — evidence
 * upload answers 503 STORAGE_NOT_CONFIGURED, so a case can be opened and never
 * submitted. The gate is behaving correctly; there is simply no authorised route
 * to a payer it will accept, and inventing one would mean weakening the exact
 * control that protects a payer's money.
 *
 * Run: BANZAMI_E2E=RUN node tools/e2e/payments/cap-pay-003-sandbox-e2e.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  API, assertExplicitRun, assertNominal, assertSandboxAndBuild,
  provisionMerchant, req, newRunId, idemKey,
} from './harness.mjs';
import { assessRuntimeFreshness } from './runtime-freshness.mjs';
import { assuranceDir } from '../lib/assurance-output.mjs';
import { join } from 'node:path';

assertExplicitRun(process.env.BANZAMI_E2E);
const AMOUNT = 50_000;
assertNominal(AMOUNT);

const runId = newRunId();
const results = [];
const rec = (id, ok, note = '') => {
  results.push({ id, ok, note });
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${id}${note ? ' — ' + note : ''}`);
};

const guard = await assertSandboxAndBuild('');
const fresh = assessRuntimeFreshness(guard.build);
if (!fresh.current) {
  console.error(`\n✗ runtime ${guard.build} is behind HEAD by runtime-affecting files:\n  ${fresh.runtimeAffecting.join('\n  ')}`);
  process.exit(1);
}
console.log(`CAP-PAY-003 deployed E2E (partial) — env=${guard.environment} runtime=${guard.build} run=${runId.slice(0, 8)}\n`);

const A = await provisionMerchant(runId, 'qa');
const B = await provisionMerchant(runId, 'qb');
const expires = new Date(Date.now() + 3_600_000).toISOString();
const dyn = { owner_id: A.merchantId, owner_type: 'MERCHANT', amount_minor: AMOUNT, currency: 'AOA', expires_at: expires };

// ── Creation ────────────────────────────────────────────────────────────────
const created = await req('POST', '/v1/qr/dynamic', { token: A.token, body: dyn, idem: idemKey(runId, 'dyn') });
rec('PAY003.create-dynamic', created.status === 201, `HTTP ${created.status}`);
const qr = created.body?.qr_code || {};
const payload = created.body?.payload;
rec('PAY003.payload-issued', typeof payload === 'string' && payload.length > 0);
rec('PAY003.owner-is-merchant', qr.owner_id === A.merchantId && qr.owner_type === 'MERCHANT', `${qr.owner_type}`);
rec('PAY003.amount-exact', qr.amount_minor === AMOUNT, `${qr.amount_minor} minor`);
rec('PAY003.currency-preserved', qr.currency === 'AOA', String(qr.currency));
rec('PAY003.expiry-recorded', typeof qr.expires_at === 'string' && qr.expires_at.length > 0);

const stat = await req('POST', '/v1/qr/static', {
  token: A.token, idem: idemKey(runId, 'static'),
  body: { owner_id: A.merchantId, owner_type: 'MERCHANT', currency: 'AOA' },
});
rec('PAY003.create-static-open-amount', stat.status === 201, `HTTP ${stat.status} — a static QR carries no fixed amount`);

// ── Read / decode ───────────────────────────────────────────────────────────
const readOwn = await req('GET', `/v1/qr/${qr.id}`, { token: A.token });
rec('PAY003.read-own', readOwn.status === 200, `HTTP ${readOwn.status}`);
const decoded = await req('POST', '/v1/qr/decode', { token: A.token, body: { payload } });
rec('PAY003.decode-own', decoded.status === 200, `HTTP ${decoded.status}`);

// ── Ownership / BOLA — mandatory after RA-047 ───────────────────────────────
const bReads = await req('GET', `/v1/qr/${qr.id}`, { token: B.token });
rec('PAY003.neg.cross-merchant-read', bReads.status === 404 || bReads.status === 403, `HTTP ${bReads.status}`);

const bMarks = await req('POST', `/v1/qr/${qr.id}/use`, { token: B.token, idem: idemKey(runId, 'bmark') });
rec('PAY003.neg.cross-merchant-mark-used', bMarks.status === 404 || bMarks.status === 403, `HTTP ${bMarks.status}`);

// B creating a QR that pays INTO merchant A — the RA-047 shape on this surface.
const bCreatesForA = await req('POST', '/v1/qr/dynamic', { token: B.token, body: dyn, idem: idemKey(runId, 'bcreate') });
rec('PAY003.neg.cross-merchant-create', bCreatesForA.status === 403 || bCreatesForA.status === 404,
  `HTTP ${bCreatesForA.status} for B naming A as QR owner`);

const afterAttempts = await req('GET', `/v1/qr/${qr.id}`, { token: A.token });
rec('PAY003.neg.victim-qr-unchanged',
  afterAttempts.status === 200 && (afterAttempts.body?.used_at == null && afterAttempts.body?.status !== 'USED'),
  `state ${afterAttempts.body?.status ?? 'n/a'} after B's read/mark-used/create attempts`);

// ── Authentication ──────────────────────────────────────────────────────────
const noAuth = await req('POST', '/v1/qr/dynamic', { body: dyn, idem: idemKey(runId, 'noauth') });
rec('PAY003.neg.unauthenticated', noAuth.status === 401, `HTTP ${noAuth.status}`);
const badAuth = await req('POST', '/v1/qr/dynamic', { token: 'not-a-token', body: dyn, idem: idemKey(runId, 'badauth') });
rec('PAY003.neg.bogus-credential', badAuth.status === 401, `HTTP ${badAuth.status}`);

// ── Validation and integer boundaries ───────────────────────────────────────
const bad = [
  ['zero-amount', { ...dyn, amount_minor: 0 }],
  ['negative-amount', { ...dyn, amount_minor: -1 }],
  ['overflow-amount', { ...dyn, amount_minor: 9223372036854775807 }],
  ['unsupported-currency', { ...dyn, currency: 'XXX' }],
  ['missing-expiry', { owner_id: A.merchantId, owner_type: 'MERCHANT', amount_minor: AMOUNT, currency: 'AOA' }],
  ['past-expiry', { ...dyn, expires_at: '2020-01-01T00:00:00Z' }],
  ['invalid-owner-type', { ...dyn, owner_type: 'NOT_A_TYPE' }],
];
for (const [name, body] of bad) {
  const r = await req('POST', '/v1/qr/dynamic', { token: A.token, body, idem: idemKey(runId, `v-${name}`) });
  rec(`PAY003.neg.${name}`, r.status >= 400 && r.status < 500,
    `HTTP ${r.status}${r.status === 502 ? ' — 502 would be an RA-043 regression' : ''}`);
}

// ── Invalid / unknown QR ────────────────────────────────────────────────────
const unknown = await req('GET', '/v1/qr/00000000-0000-0000-0000-000000000000', { token: A.token });
rec('PAY003.neg.unknown-qr', unknown.status === 404, `HTTP ${unknown.status}`);
const badDecode = await req('POST', '/v1/qr/decode', { token: A.token, body: { payload: 'not-a-valid-payload' } });
rec('PAY003.neg.malformed-payload', badDecode.status >= 400 && badDecode.status < 500, `HTTP ${badDecode.status}`);

// ── No internal leakage ─────────────────────────────────────────────────────
const leaked = [bReads, bMarks, bCreatesForA, badDecode].filter((r) =>
  /sqlstate|constraint|postgres|pgx|panic|goroutine|select .* from/i.test(r.raw || ''));
rec('PAY003.neg.no-internal-leak', leaked.length === 0, `${leaked.length} response(s) leaked internals`);

// ── Financial truth: creation alone moves nothing ───────────────────────────
const accounts = await req('GET', `/v1/business/wallet-accounts?wallet_id=${A.walletId}`, { token: A.token });
const balance = accounts.body?.data?.[0]?.available_balance_minor;
rec('PAY003.no-ledger-movement-on-create', balance === 0,
  `payee balance ${balance} minor — issuing a QR is not a settlement`);

// ── Evidence ────────────────────────────────────────────────────────────────
const fp = (v) => 'sha256:' + createHash('sha256').update(String(v)).digest('hex').slice(0, 32);
const failed = results.filter((r) => !r.ok);
const evidence = {
  capability: 'CAP-PAY-003',
  suite: 'cap-pay-003-sandbox-e2e',
  scope: 'PARTIAL — merchant-side QR contract only; payment execution NOT covered',
  execution_blocker:
    'Payment execution requires a KYC-approved payer. No consumer can reach that state in the Sandbox: ' +
    'evidence upload returns 503 STORAGE_NOT_CONFIGURED, so a KYC case can be opened but never submitted. ' +
    'The compliance gate is behaving correctly; there is no authorised route to a payer it will accept.',
  run_id: runId,
  timestamp: new Date().toISOString(),
  environment: guard.environment,
  runtime_source_commit: guard.build,
  assurance_repository_revision: fresh.headCommit,
  public_endpoint: API,
  surface: '/v1/qr',
  merchants: { a: A.handle, b: B.handle },
  qr_id: qr.id || null,
  qr_payload_fingerprint: payload ? fp(payload) : null, // bearer capability — never published raw
  amount_minor: AMOUNT,
  currency: 'AOA',
  ledger_effect: 'none-expected (QR issuance is not a settlement); execution unproven',
  results,
  passed: results.length - failed.length,
  failed: failed.length,
  verdict: failed.length === 0 ? 'PASS (partial scope)' : 'FAIL',
  promotable: false,
};
const EVIDENCE_DIR = assuranceDir('cap-pay-003');
const out = join(EVIDENCE_DIR, `cap-pay-003-partial-${runId.slice(0, 8)}.json`);
writeFileSync(out, JSON.stringify(evidence, null, 2) + '\n');
console.log(`\n  evidence: ${out}`);
console.log(failed.length === 0
  ? `\n\x1b[33m◐ CAP-PAY-003 partial suite PASSED\x1b[0m (${results.length} assertions) — NOT promotable: execution unproven`
  : `\n\x1b[31m✗ CAP-PAY-003 partial suite FAILED (${failed.length}/${results.length})\x1b[0m`);
process.exit(failed.length === 0 ? 0 : 1);
