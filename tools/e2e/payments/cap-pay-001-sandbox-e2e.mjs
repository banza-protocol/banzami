#!/usr/bin/env node
/**
 * CAP-PAY-001 — Payment sessions, deployed-Sandbox E2E.
 *
 * Executes against the canonical public perimeter only:
 *   client → Cloudflare → sandbox-edge → api-gateway → core → PostgreSQL
 *
 * Payment session creation is an INTENT, not a settlement. The contract creates
 * a session and its payment interfaces; it posts nothing to the ledger. This
 * suite therefore asserts that no balance moves, rather than inventing ledger
 * assertions the contract does not make — claiming a ledger effect here would be
 * evidence of the wrong thing.
 *
 * Run: BANZAMI_E2E=RUN node tools/e2e/payments/cap-pay-001-sandbox-e2e.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { assuranceDir } from '../lib/assurance-output.mjs';
import { join } from 'node:path';
import {
  API, PURPOSE, assertExplicitRun, assertNominal, assertSandboxAndBuild,
  provisionMerchant, req, newRunId, idemKey,
} from './harness.mjs';

assertExplicitRun(process.env.BANZAMI_E2E);
const EXPECTED_COMMIT = process.env.BANZAMI_E2E_EXPECTED_COMMIT || '';
const AMOUNT = 150_000; // 1,500 Kz
assertNominal(AMOUNT);

const runId = newRunId();
const results = [];
const rec = (id, ok, note = '') => {
  results.push({ id, ok, note });
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${id}${note ? ' — ' + note : ''}`);
};

const guard = await assertSandboxAndBuild(EXPECTED_COMMIT);
console.log(`CAP-PAY-001 deployed E2E — env=${guard.environment} build=${guard.build} run=${runId.slice(0, 8)}\n`);

// Two INDEPENDENT merchants: cross-tenant isolation cannot be proven with one.
const A = await provisionMerchant(runId, 'a');
const B = await provisionMerchant(runId, 'b');
console.log(`  setup: merchants ${A.handle} / ${B.handle}\n`);

const base = { wallet_account_id: A.walletAccountId, amount_minor: AMOUNT, currency: 'AOA', purpose: PURPOSE };

// ── Happy path ──────────────────────────────────────────────────────────────
const created = await req('POST', '/v1/payment-sessions', {
  token: A.token, body: { ...base, description: 'CAP-PAY-001 happy path' }, idem: idemKey(runId, 'happy'),
});
rec('PAY001.create', created.status === 201, `HTTP ${created.status}`);
const session = created.body || {};
rec('PAY001.amount-exact', session.amount_minor === AMOUNT, `${session.amount_minor} minor`);
rec('PAY001.currency-preserved', session.currency === 'AOA', String(session.currency));
// The contract names this `session_id`, not `id`.
rec('PAY001.identifier-present', typeof session.session_id === 'string' && session.session_id.length > 0,
  session.session_id ? 'session_id present' : `keys: ${Object.keys(session).join(',')}`);
rec('PAY001.interfaces-issued', Array.isArray(session.interfaces) && session.interfaces.length > 0,
  `${session.interfaces?.length || 0} interface(s)`);

// ── Read back through the owning principal ──────────────────────────────────
const readBack = await req('GET', `/v1/payment-sessions/${session.session_id}`, { token: A.token });
rec('PAY001.read-own', readBack.status === 200 && readBack.body?.session_id === session.session_id, `HTTP ${readBack.status}`);

// ── Financial truth: an intent must not move money ──────────────────────────
const accounts = await req('GET', `/v1/wallet-accounts?wallet_id=${A.walletId}`, { token: A.token });
const balance = accounts.body?.data?.[0]?.available_balance_minor;
rec('PAY001.no-ledger-movement', balance === 0,
  `balance ${balance} minor — session creation is an intent, not a settlement`);

// ── Idempotency ─────────────────────────────────────────────────────────────
const replay = await req('POST', '/v1/payment-sessions', {
  token: A.token, body: { ...base, description: 'CAP-PAY-001 happy path' }, idem: idemKey(runId, 'happy'),
});
rec('PAY001.idempotent-replay', replay.status === 201 && replay.body?.session_id === session.session_id,
  `HTTP ${replay.status}, same session_id: ${replay.body?.session_id === session.session_id}`);

const conflict = await req('POST', '/v1/payment-sessions', {
  token: A.token, body: { ...base, amount_minor: AMOUNT + 1 }, idem: idemKey(runId, 'happy'),
});
rec('PAY001.idempotency-conflict-rejected', conflict.status >= 400 && conflict.status < 500,
  `HTTP ${conflict.status} for a reused key with a different payload`);

// ── Negative / security ─────────────────────────────────────────────────────
const noAuth = await req('POST', '/v1/payment-sessions', { body: base, idem: idemKey(runId, 'noauth') });
rec('PAY001.neg.unauthenticated', noAuth.status === 401, `HTTP ${noAuth.status}`);

const badAuth = await req('POST', '/v1/payment-sessions', {
  token: 'not-a-real-token', body: base, idem: idemKey(runId, 'badauth'),
});
rec('PAY001.neg.bogus-credential', badAuth.status === 401, `HTTP ${badAuth.status}`);

// Merchant B naming merchant A's wallet account: must fail closed, and must not
// disclose whether that account exists.
const crossCreate = await req('POST', '/v1/payment-sessions', {
  token: B.token, body: base, idem: idemKey(runId, 'cross'),
});
rec('PAY001.neg.cross-merchant-create', crossCreate.status === 403 || crossCreate.status === 404,
  `HTTP ${crossCreate.status} for B creating against A's wallet account`);

const crossRead = await req('GET', `/v1/payment-sessions/${session.session_id}`, { token: B.token });
rec('PAY001.neg.cross-merchant-read', crossRead.status === 403 || crossRead.status === 404,
  `HTTP ${crossRead.status} for B reading A's session`);

const zero = await req('POST', '/v1/payment-sessions', {
  token: A.token, body: { ...base, amount_minor: 0 }, idem: idemKey(runId, 'zero'),
});
rec('PAY001.neg.zero-amount', zero.status >= 400 && zero.status < 500, `HTTP ${zero.status}`);

const negative = await req('POST', '/v1/payment-sessions', {
  token: A.token, body: { ...base, amount_minor: -1 }, idem: idemKey(runId, 'negative'),
});
rec('PAY001.neg.negative-amount', negative.status >= 400 && negative.status < 500, `HTTP ${negative.status}`);

const badCurrency = await req('POST', '/v1/payment-sessions', {
  token: A.token, body: { ...base, currency: 'XXX' }, idem: idemKey(runId, 'ccy'),
});
rec('PAY001.neg.unsupported-currency', badCurrency.status >= 400 && badCurrency.status < 500, `HTTP ${badCurrency.status}`);

const unknown = await req('GET', '/v1/payment-sessions/00000000-0000-0000-0000-000000000000', { token: A.token });
rec('PAY001.neg.unknown-session', unknown.status === 404, `HTTP ${unknown.status}`);

const malformed = await req('GET', '/v1/payment-sessions/not-a-uuid', { token: A.token });
rec('PAY001.neg.malformed-id', malformed.status >= 400 && malformed.status < 500, `HTTP ${malformed.status}`);

// No internal detail may leak on any rejection.
const leaked = [crossCreate, zero, badCurrency, malformed].filter((r) =>
  /sqlstate|constraint|postgres|pgx|panic|goroutine|select .* from/i.test(r.raw || ''));
rec('PAY001.neg.no-internal-leak', leaked.length === 0, `${leaked.length} response(s) leaked internals`);

// ── Purpose semantics (RA-045) ──────────────────────────────────────────────
// Purpose is optional and core defaults an absent purpose to GENERIC. Omitting it
// used to fail, because the gateway transmitted an empty string.
const omitted = await req('POST', '/v1/payment-sessions', {
  token: A.token,
  body: { wallet_account_id: A.walletAccountId, amount_minor: AMOUNT, currency: 'AOA' },
  idem: idemKey(runId, 'purpose-omitted'),
});
rec('PAY001.purpose-omitted-defaults', omitted.status === 201 && omitted.body?.purpose === 'GENERIC',
  `HTTP ${omitted.status}, purpose=${omitted.body?.purpose}`);

const explicitGeneric = await req('POST', '/v1/payment-sessions', {
  token: A.token, body: { ...base }, idem: idemKey(runId, 'purpose-explicit'),
});
rec('PAY001.purpose-explicit-generic', explicitGeneric.status === 201, `HTTP ${explicitGeneric.status}`);

const badPurpose = await req('POST', '/v1/payment-sessions', {
  token: A.token, body: { ...base, purpose: 'NOT_A_PURPOSE' }, idem: idemKey(runId, 'purpose-bad'),
});
rec('PAY001.neg.unknown-purpose', badPurpose.status >= 400 && badPurpose.status < 500, `HTTP ${badPurpose.status}`);

// ── Idempotency scoping and concurrency (RA-044) ────────────────────────────
// The same RAW key used by a DIFFERENT merchant must be independent: keys are
// scoped per principal, so B's key must not collide with A's.
const sharedKey = idemKey(runId, 'shared-raw-key');
const aKeyed = await req('POST', '/v1/payment-sessions', {
  token: A.token, body: { ...base }, idem: sharedKey,
});
const bKeyed = await req('POST', '/v1/payment-sessions', {
  token: B.token,
  body: { wallet_account_id: B.walletAccountId, amount_minor: AMOUNT, currency: 'AOA', purpose: PURPOSE },
  idem: sharedKey,
});
rec('PAY001.idempotency-actor-scoped',
  aKeyed.status === 201 && bKeyed.status === 201 && aKeyed.body?.session_id !== bKeyed.body?.session_id,
  `A ${aKeyed.status} / B ${bKeyed.status}, distinct sessions: ${aKeyed.body?.session_id !== bKeyed.body?.session_id}`);

// Concurrent identical requests under one key must yield exactly one session.
const concurrentKey = idemKey(runId, 'concurrent');
const concurrent = await Promise.all(
  [0, 1, 2, 3].map(() => req('POST', '/v1/payment-sessions', {
    token: A.token, body: { ...base }, idem: concurrentKey,
  })),
);
const createdIds = new Set(concurrent.filter((r) => r.status === 201).map((r) => r.body?.session_id));
const inFlightRejected = concurrent.filter((r) => r.status === 409).length;
rec('PAY001.idempotency-concurrent-single-resource', createdIds.size <= 1,
  `${createdIds.size} distinct session(s) from 4 concurrent identical requests, ${inFlightRejected} serialized`);

// ── Evidence ────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
const evidence = {
  capability: 'CAP-PAY-001',
  suite: 'cap-pay-001-sandbox-e2e',
  run_id: runId,
  timestamp: new Date().toISOString(),
  environment: guard.environment,
  expected_commit: EXPECTED_COMMIT || null,
  deployed_build: guard.build,
  public_endpoint: API,
  surface: '/v1/payment-sessions',
  merchants: { a: A.handle, b: B.handle }, // handles only — no tokens, no PINs
  session_id: session.session_id || null,
  amount_minor: AMOUNT,
  currency: 'AOA',
  ledger_effect: 'none-expected (session is an intent, not a settlement)',
  results,
  passed: results.length - failed.length,
  failed: failed.length,
  verdict: failed.length === 0 ? 'PASS' : 'FAIL',
};
const EVIDENCE_DIR = assuranceDir('cap-pay-001');
const out = join(EVIDENCE_DIR, `cap-pay-001-${runId.slice(0, 8)}.json`);
writeFileSync(out, JSON.stringify(evidence, null, 2) + '\n');

console.log(`\n  evidence: ${out}`);
console.log(failed.length === 0
  ? `\n\x1b[32m✓ CAP-PAY-001 deployed E2E PASSED\x1b[0m (${results.length} assertions)`
  : `\n\x1b[31m✗ CAP-PAY-001 deployed E2E FAILED (${failed.length}/${results.length})\x1b[0m`);
process.exit(failed.length === 0 ? 0 : 1);
