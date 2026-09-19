#!/usr/bin/env node
/**
 * COLLECTIONS-PROTOCOL-AND-PRODUCT-001 — Proof 20: PUBLIC authenticated Collections
 * idempotency (INV-COLLECTION-008 through the real edge, post-0159).
 *
 * Proves 0159 idempotency on the PUBLIC path — Business authority → gateway
 * (sandbox-api.banzami.com) → Core — NOT the Core internal endpoint. A generic
 * synthetic Sandbox Business signs in with @handle+PIN and drives POST /v1/collections
 * with a Bearer merchant JWT. No internal endpoint, no manual authority override.
 *
 *   §3 public create works                       COLLECTION_PUBLIC_CREATE_IDEMPOTENCY
 *   §4 authority is server-derived (not body)    COLLECTION_PUBLIC_AUTHORITY_SERVER_DERIVED
 *      cross-body / cross-tenant spoof rejected  COLLECTION_PUBLIC_AUTHORITY_SPOOFING=0
 *   §5 idempotency key transported end-to-end    COLLECTION_IDEMPOTENCY_KEY_END_TO_END
 *   §6 same business+key+body → same Collection  COLLECTION_PUBLIC_IDEMPOTENT_REPLAY
 *   §7 same key, different valid body → 409       COLLECTION_PUBLIC_IDEMPOTENCY_CONFLICT
 *   §8 8 concurrent identical → one, zero 500s    COLLECTION_PUBLIC_CREATE_CONCURRENCY
 *
 *   BANZAMI_E2E=RUN node proofs/20-collections-public-idempotency.mjs
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { GateReport } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';
import { provisionBusiness, retireBusiness } from '../lib/business-provision.mjs';
import { e2eBegin, e2eOwn, e2eCleanup } from '../lib/e2e-own.mjs';

const API = (process.env.BZ_PROVISION_API ?? 'https://sandbox-api.banzami.com').replace(/\/+$/, '');
const VM = process.env.BZ_SANDBOX_HOST ?? 'root@217.160.9.248';
const TITLE = '0159 public proof';
const R = new GateReport('20-collections-public-idempotency');
if (process.env.BANZAMI_E2E !== 'RUN') { console.error('set BANZAMI_E2E=RUN'); process.exit(2); }

// READ-ONLY operator read (bl_app_runtime, read-only txn) — corroborates that the
// client's idempotency_key was persisted verbatim by Core. Never a mutation.
function persistedKey(collectionId) {
  const sql = `SELECT idempotency_key || '|' || COALESCE(request_fingerprint,'') FROM collections WHERE id='${collectionId.replace(/[^0-9a-f-]/g, '')}'`;
  const remote =
    `PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1); ` +
    `PW=$(cat /root/.banzami/operator_db_url | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#'); ` +
    `docker exec -e PGPASSWORD=$PW -e PGOPTIONS='-c default_transaction_read_only=on' ` +
    `$PG psql -U bl_app_runtime -d banzami_staging -At -c "${sql}"`;
  return execFileSync('ssh', ['-o', 'BatchMode=yes', VM, remote], { encoding: 'utf8', timeout: 60000 }).trim();
}

// This proof provisioned a Business on every run and retired none of them. It
// is create-only and non-economic, which is why it went unnoticed — but an
// unretired Business is residue whether or not it ever held money, and the
// early `return` below meant even a considered cleanup would have been skipped.
const own = e2eBegin('proof-20');

(async () => {
  const biz = await provisionBusiness({ handlePrefix: 'e2ecolidem' });
  e2eOwn(own, 'business', biz.merchantId ?? biz.handle, { created_by: 'provisionBusiness' });
  const tok = (await (await fetch(`${API}/v1/merchant/auth/token`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ handle: biz.handle, pin: biz.pin }),
  })).json()).token;
  if (!tok) { R.mark("MERCHANT_AUTH", false, "no JWT from /v1/merchant/auth/token"); const o=R.write(assuranceDir("app-web")); console.log(`\nPROOF_20_COLLECTIONS_PUBLIC_IDEMPOTENCY=FAIL → ${o}`); process.exitCode=1; return; }
  const H = { authorization: `Bearer ${tok}`, 'content-type': 'application/json' };
  const mget = async (p) => (await fetch(`${API}${p}`, { headers: H })).json();
  // NOTE: no `Idempotency-Key` HEADER is sent — we exercise Core's DB-enforced body
  // idempotency_key (what 0159 fixed), not the gateway's separate Redis edge layer.
  const mpost = async (p, b) => { const r = await fetch(`${API}${p}`, { method: 'POST', headers: H, body: JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };

  const wallet = await mget('/v1/wallets?currency=AOA');
  R.mark('GENERIC_SYNTHETIC_BUSINESS_PROVISIONED', !!biz.handle && !!wallet?.id, `@${biz.handle} wallet=${wallet?.id || 'none'}${biz.reused ? ' (reused)' : ''}`);
  if (!wallet?.id) { const o = R.write(assuranceDir('app-web')); console.log(`\nPROOF_20_COLLECTIONS_PUBLIC_IDEMPOTENCY=FAIL → ${o}`); process.exitCode = 1; return; }

  const base = (key) => ({
    wallet_id: wallet.id, currency: 'AOA', total_amount_minor: 45200, title: TITLE,
    rule: { type: 'FIXED_AMOUNTS', shares: [{ amount_minor: 22600 }, { amount_minor: 22600 }] },
    idempotency_key: key,
  });

  // ── §3/§6: public create + replay (same business + same key + same body → same id) ──
  const K1 = `pub-${randomUUID()}`;
  const c1 = await mpost('/v1/collections', base(K1));
  const id1 = c1.json?.collection?.id;
  const realMerchant = c1.json?.collection?.merchant_id;
  R.mark('COLLECTION_PUBLIC_CREATE_IDEMPOTENCY', c1.status === 201 && !!id1, `HTTP ${c1.status} id=${id1 || 'none'}`);

  const c1replay = await mpost('/v1/collections', base(K1));
  const id1r = c1replay.json?.collection?.id;
  R.mark('COLLECTION_PUBLIC_IDEMPOTENT_REPLAY', (c1replay.status === 201 || c1replay.status === 200) && !!id1r && id1r === id1, `HTTP ${c1replay.status} id=${id1r} (== ${id1})`);

  // ── §5: idempotency key transported to Core & persisted verbatim ──
  let keyOk = false, persisted = '';
  if (id1) { try { persisted = persistedKey(id1); keyOk = persisted.split('|')[0] === K1; } catch (e) { persisted = `read error: ${e.message}`; } }
  R.mark('COLLECTION_IDEMPOTENCY_KEY_END_TO_END', keyOk, `persisted idempotency_key=${persisted.split('|')[0] || 'none'} (sent ${K1}); fingerprint ${persisted.split('|')[1] ? 'present' : 'absent'}`);

  // ── §7: same key, DIFFERENT valid body → 409 IDEMPOTENCY_CONFLICT ──
  const conflictBody = { ...base(K1), rule: { type: 'FIXED_AMOUNTS', shares: [{ amount_minor: 20000 }, { amount_minor: 25200 }] } };
  const cConf = await mpost('/v1/collections', conflictBody);
  const conflictCode = cConf.json?.error?.code || cConf.json?.code;
  R.mark('COLLECTION_PUBLIC_IDEMPOTENCY_CONFLICT', cConf.status === 409 && conflictCode === 'IDEMPOTENCY_CONFLICT', `HTTP ${cConf.status} code=${conflictCode}`);

  // ── §4: authority is SERVER-DERIVED. Spoof merchant_id/creator/owner/environment
  //        in the body; the gateway must overwrite them with the JWT principal. ──
  const spoofKey = `pub-${randomUUID()}`;
  const spoofBody = { ...base(spoofKey), merchant_id: randomUUID(), creator: '@attacker', owner: '@attacker', environment: 'LIVE' };
  const cSpoof = await mpost('/v1/collections', spoofBody);
  const sc = cSpoof.json?.collection;
  const authorityHeld = cSpoof.status === 201 && !!sc &&
    sc.merchant_id === realMerchant && sc.environment !== 'LIVE' &&
    sc.creator !== '@attacker' && sc.owner !== '@attacker';
  R.mark('COLLECTION_PUBLIC_AUTHORITY_SERVER_DERIVED', authorityHeld,
    `merchant_id=${sc?.merchant_id} (== principal ${realMerchant}); env=${sc?.environment}; creator=${sc?.creator}; owner=${sc?.owner}`);

  // Cross-tenant wallet substitution must be refused (ownsWallet → 404).
  const cWallet = await mpost('/v1/collections', { ...base(`pub-${randomUUID()}`), wallet_id: randomUUID() });
  const walletSpoofRejected = cWallet.status === 404;
  R.mark('COLLECTION_PUBLIC_AUTHORITY_SPOOFING', authorityHeld && walletSpoofRejected ? true : false,
    `body-authority ignored=${authorityHeld}; foreign wallet_id → HTTP ${cWallet.status} (expect 404); spoofing_effects=0`);

  // ── §8: 8 concurrent identical creates (new key) → exactly one Collection, zero 500s ──
  const K2 = `pub-${randomUUID()}`;
  const results = await Promise.all(Array.from({ length: 8 }, () => mpost('/v1/collections', base(K2))));
  const ids = results.map((r) => r.json?.collection?.id).filter(Boolean);
  const distinct = [...new Set(ids)];
  const http500 = results.filter((r) => r.status >= 500).length;
  const statuses = results.map((r) => r.status).join(',');
  R.mark('COLLECTION_PUBLIC_CREATE_CONCURRENCY', distinct.length === 1 && ids.length === 8 && http500 === 0,
    `distinct_ids=${distinct.length} responses_with_id=${ids.length}/8 http500=${http500} statuses=[${statuses}]`);
  R.mark('COLLECTION_PUBLIC_CREATE_CONCURRENT_500', http500 === 0, `500s=${http500}`);

  // Fixture provenance: every row created here is create-only, non-economic, and
  // titled for the §2 boundary-guarded cleanup tool. Emit the fixture for reuse.
  console.log(`\nFIXTURE handle=@${biz.handle} merchant_id=${realMerchant || biz.merchantId || ''}`);
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_20_COLLECTIONS_PUBLIC_IDEMPOTENCY=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail) → ${out}`);
  process.exitCode = R.ok ? 0 : 1;
})()
  .catch((e) => { R.mark('PROOF_20', false, e.message); console.error(e); process.exitCode = 1; })
  // However it ended — success, early return, or throw — the Business goes back.
  .finally(async () => {
    const cleanup = await e2eCleanup(own, { retireBusiness });
    console.log(`FIXTURE_CLEANUP=${cleanup.result} ${cleanup.detail}`);
  });
