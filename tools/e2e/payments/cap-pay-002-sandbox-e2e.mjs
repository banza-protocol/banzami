#!/usr/bin/env node
/**
 * CAP-PAY-002 — Payment links, deployed-Sandbox E2E.
 *
 * A payment link is an INDEPENDENT resource, not a wrapper around a payment
 * session: it is created from a wallet_id (sessions take a wallet_account_id),
 * carries its own lifecycle (ACTIVE → CANCELLED / used) and its own public slug.
 * The suite therefore proves the link's own contract rather than re-proving
 * CAP-PAY-001 through it.
 *
 * Creation and resolution are non-financial. The suite asserts the ABSENCE of a
 * ledger effect rather than executing a payment to look more complete — actual
 * settlement belongs to the capability whose authority covers it.
 *
 * Run: BANZAMI_E2E=RUN node tools/e2e/payments/cap-pay-002-sandbox-e2e.mjs
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
const AMOUNT = 120_000;
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
  console.error(`\n✗ deployed runtime ${guard.build} is behind HEAD by runtime-affecting files:\n  ${fresh.runtimeAffecting.join('\n  ')}`);
  process.exit(1);
}
console.log(`CAP-PAY-002 deployed E2E — env=${guard.environment} runtime=${guard.build} head=${fresh.headCommit.slice(0, 12)}${fresh.exact ? '' : ` (+${fresh.nonRuntime.length} non-runtime files)`} run=${runId.slice(0, 8)}\n`);

const A = await provisionMerchant(runId, 'pa');
const B = await provisionMerchant(runId, 'pb');
// Setup, not evidence: prove the credential works before testing the capability.
const meA = await req('GET', '/v1/integration', { token: A.token });
rec('PAY002.setup.merchant-auth', meA.status === 200, `HTTP ${meA.status}`);

const linkBody = { wallet_id: A.walletId, amount_minor: AMOUNT, currency: 'AOA', description: 'CAP-PAY-002 happy path' };

// ── Happy path ──────────────────────────────────────────────────────────────
const created = await req('POST', '/v1/payment-links', { token: A.token, body: linkBody, idem: idemKey(runId, 'create') });
rec('PAY002.create', created.status === 201, `HTTP ${created.status}`);
const link = created.body || {};
rec('PAY002.owner-is-caller', link.merchant_id === A.merchantId, 'payee bound to the authenticated merchant');
rec('PAY002.amount-exact', link.amount_minor === AMOUNT, `${link.amount_minor} minor`);
rec('PAY002.currency-preserved', link.currency === 'AOA', String(link.currency));
rec('PAY002.slug-issued', typeof link.slug === 'string' && link.slug.length > 0);
rec('PAY002.initial-state-active', link.status === 'ACTIVE', String(link.status));

const readOwn = await req('GET', `/v1/payment-links/${link.id}`, { token: A.token });
rec('PAY002.read-own', readOwn.status === 200 && readOwn.body?.id === link.id, `HTTP ${readOwn.status}`);

const listOwn = await req('GET', '/v1/payment-links', { token: A.token });
rec('PAY002.list-own', listOwn.status === 200 && Array.isArray(listOwn.body?.data), `HTTP ${listOwn.status}`);

// ── Public surface ──────────────────────────────────────────────────────────
const pub = await req('GET', `/public/pay/${link.slug}`);
rec('PAY002.public-resolves', pub.status === 200, `HTTP ${pub.status}`);
rec('PAY002.public-amount-matches', pub.body?.amount_minor === AMOUNT, `${pub.body?.amount_minor}`);
const PUBLIC_ALLOWED = ['slug', 'amount_minor', 'currency', 'description', 'status', 'expires_at', 'paid_at', 'merchant_name'];
const extra = Object.keys(pub.body || {}).filter((k) => !PUBLIC_ALLOWED.includes(k));
rec('PAY002.public-no-internal-fields', extra.length === 0, extra.length ? `leaked: ${extra.join(',')}` : 'only payer-facing fields');
const pubRaw = pub.raw || '';
rec('PAY002.public-no-internal-ids',
  !pubRaw.includes(link.id) && !pubRaw.includes(A.merchantId) && !pubRaw.includes(A.walletId),
  'no link/merchant/wallet UUID in the payer view');

const status = await req('GET', `/public/pay/${link.slug}/status`);
rec('PAY002.public-status', status.status === 200 && status.body?.paid === false, `HTTP ${status.status}, paid=${status.body?.paid}`);

const unknownSlug = await req('GET', '/public/pay/000000000000');
rec('PAY002.neg.public-unknown-slug', unknownSlug.status === 404, `HTTP ${unknownSlug.status}`);
const malformedSlug = await req('GET', '/public/pay/not-a-slug!!');
rec('PAY002.neg.public-malformed-slug', malformedSlug.status >= 400 && malformedSlug.status < 500, `HTTP ${malformedSlug.status}`);

// ── Ownership / BOLA (RA-047) ───────────────────────────────────────────────
const bCreatesForA = await req('POST', '/v1/payment-links', {
  token: B.token, body: { ...linkBody, merchant_id: A.merchantId }, idem: idemKey(runId, 'bola-create'),
});
rec('PAY002.neg.cross-merchant-create', bCreatesForA.status === 403, `HTTP ${bCreatesForA.status} for B naming A as payee`);

const bReads = await req('GET', `/v1/payment-links/${link.id}`, { token: B.token });
rec('PAY002.neg.cross-merchant-read', bReads.status === 404, `HTTP ${bReads.status} (404 — not 403, which would confirm the id)`);

const bLists = await req('GET', `/v1/payment-links?merchant_id=${A.merchantId}`, { token: B.token });
rec('PAY002.neg.cross-merchant-list', bLists.status === 403, `HTTP ${bLists.status}`);

const bMarksUsed = await req('POST', `/v1/payment-links/${link.id}/mark-used`, { token: B.token, idem: idemKey(runId, 'bola-mu') });
rec('PAY002.neg.cross-merchant-mark-used', bMarksUsed.status === 404, `HTTP ${bMarksUsed.status}`);

const bCancels = await req('DELETE', `/v1/payment-links/${link.id}`, { token: B.token });
rec('PAY002.neg.cross-merchant-cancel', bCancels.status === 404, `HTTP ${bCancels.status}`);

// The assertion that matters: the victim's link must be untouched.
const afterAttack = await req('GET', `/v1/payment-links/${link.id}`, { token: A.token });
rec('PAY002.neg.victim-link-unchanged', afterAttack.body?.status === 'ACTIVE',
  `status still ${afterAttack.body?.status} after B's create/read/list/cancel/mark-used attempts`);

// ── Authentication ──────────────────────────────────────────────────────────
const noAuth = await req('POST', '/v1/payment-links', { body: linkBody, idem: idemKey(runId, 'noauth') });
rec('PAY002.neg.unauthenticated', noAuth.status === 401, `HTTP ${noAuth.status}`);
const badAuth = await req('POST', '/v1/payment-links', { token: 'not-a-token', body: linkBody, idem: idemKey(runId, 'badauth') });
rec('PAY002.neg.bogus-credential', badAuth.status === 401, `HTTP ${badAuth.status}`);

// ── Validation / error contract (RA-043 must not regress) ───────────────────
const cases = [
  ['zero-amount', { ...linkBody, amount_minor: 0 }],
  ['negative-amount', { ...linkBody, amount_minor: -1 }],
  ['missing-wallet', { amount_minor: AMOUNT, currency: 'AOA' }],
  ['missing-currency', { wallet_id: A.walletId, amount_minor: AMOUNT }],
  ['past-expiry', { ...linkBody, expires_at: '2020-01-01T00:00:00Z' }],
];
for (const [name, body] of cases) {
  const r = await req('POST', '/v1/payment-links', { token: A.token, body, idem: idemKey(runId, `v-${name}`) });
  rec(`PAY002.neg.${name}`, r.status >= 400 && r.status < 500, `HTTP ${r.status}${r.status === 502 ? ' — 502 would be an RA-043 regression' : ''}`);
}

// ── Idempotency (ADR-022, same semantics as CAP-PAY-001) ────────────────────
const ik = idemKey(runId, 'idem');
const first = await req('POST', '/v1/payment-links', { token: A.token, body: linkBody, idem: ik });
const replay = await req('POST', '/v1/payment-links', { token: A.token, body: linkBody, idem: ik });
rec('PAY002.idempotent-replay', replay.status === 201 && replay.body?.id === first.body?.id,
  `same id: ${replay.body?.id === first.body?.id}`);
const conflict = await req('POST', '/v1/payment-links', { token: A.token, body: { ...linkBody, amount_minor: AMOUNT + 1 }, idem: ik });
rec('PAY002.idempotency-conflict-rejected', conflict.status === 409, `HTTP ${conflict.status}`);
const reordered = await req('POST', '/v1/payment-links', {
  token: A.token, idem: ik,
  body: { currency: 'AOA', description: 'CAP-PAY-002 happy path', amount_minor: AMOUNT, wallet_id: A.walletId },
});
rec('PAY002.idempotency-structural-canonical', reordered.status === 201 && reordered.body?.id === first.body?.id,
  'reordered keys replay, not conflict');
const bSameKey = await req('POST', '/v1/payment-links', {
  token: B.token, body: { wallet_id: B.walletId, amount_minor: AMOUNT, currency: 'AOA', description: 'CAP-PAY-002 happy path' }, idem: ik,
});
rec('PAY002.idempotency-actor-scoped', bSameKey.status === 201 && bSameKey.body?.id !== first.body?.id,
  'same raw key, different merchant → independent link');

// ── Concurrency ─────────────────────────────────────────────────────────────
const ck = idemKey(runId, 'concurrent');
const conc = await Promise.all([0, 1, 2, 3].map(() =>
  req('POST', '/v1/payment-links', { token: A.token, body: linkBody, idem: ck })));
const ids = new Set(conc.filter((r) => r.status === 201).map((r) => r.body?.id));
rec('PAY002.concurrent-single-resource', ids.size <= 1, `${ids.size} distinct link(s) from 4 concurrent identical requests`);

// ── Lifecycle ───────────────────────────────────────────────────────────────
const cancelled = await req('DELETE', `/v1/payment-links/${link.id}`, { token: A.token });
rec('PAY002.owner-cancel', cancelled.status === 200 && cancelled.body?.status === 'CANCELLED', `status ${cancelled.body?.status}`);
const cancelAgain = await req('DELETE', `/v1/payment-links/${link.id}`, { token: A.token });
rec('PAY002.neg.cancel-twice', cancelAgain.status >= 400 && cancelAgain.status < 500, `HTTP ${cancelAgain.status} on an already-cancelled link`);
const pubAfterCancel = await req('GET', `/public/pay/${link.slug}`);
rec('PAY002.public-reflects-cancellation', pubAfterCancel.status === 404 || pubAfterCancel.body?.status === 'CANCELLED',
  `HTTP ${pubAfterCancel.status}, status ${pubAfterCancel.body?.status}`);

// ── Financial truth ─────────────────────────────────────────────────────────
const accounts = await req('GET', `/v1/wallet-accounts?wallet_id=${A.walletId}`, { token: A.token });
const balance = accounts.body?.data?.[0]?.available_balance_minor;
rec('PAY002.no-ledger-movement', balance === 0,
  `balance ${balance} minor — creating and resolving a link is non-financial`);

// ── Evidence ────────────────────────────────────────────────────────────────
const fp = (v) => 'sha256:' + createHash('sha256').update(String(v)).digest('hex').slice(0, 32);
const failed = results.filter((r) => !r.ok);
const evidence = {
  capability: 'CAP-PAY-002',
  suite: 'cap-pay-002-sandbox-e2e',
  run_id: runId,
  timestamp: new Date().toISOString(),
  environment: guard.environment,
  runtime_source_commit: guard.build,
  assurance_repository_revision: fresh.headCommit,
  runtime_matches_head_exactly: fresh.exact,
  non_runtime_files_ahead_of_runtime: fresh.nonRuntime,
  public_endpoint: API,
  surfaces: ['/v1/payment-links', '/public/pay/{slug}'],
  merchants: { a: A.handle, b: B.handle },
  link_id: link.id || null,
  // The slug is a bearer capability for the payer surface — fingerprinted, never published.
  link_slug_fingerprint: link.slug ? fp(link.slug) : null,
  amount_minor: AMOUNT,
  currency: 'AOA',
  ledger_effect: 'none-expected (link creation and resolution are non-financial)',
  results,
  passed: results.length - failed.length,
  failed: failed.length,
  verdict: failed.length === 0 ? 'PASS' : 'FAIL',
};
const EVIDENCE_DIR = assuranceDir('cap-pay-002');
const out = join(EVIDENCE_DIR, `cap-pay-002-${runId.slice(0, 8)}.json`);
writeFileSync(out, JSON.stringify(evidence, null, 2) + '\n');
console.log(`\n  evidence: ${out}`);
console.log(failed.length === 0
  ? `\n\x1b[32m✓ CAP-PAY-002 deployed E2E PASSED\x1b[0m (${results.length} assertions)`
  : `\n\x1b[31m✗ CAP-PAY-002 deployed E2E FAILED (${failed.length}/${results.length})\x1b[0m`);
process.exit(failed.length === 0 ? 0 : 1);
