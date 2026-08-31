#!/usr/bin/env node
/**
 * RA-054 — merchant-surface authority regression suite.
 *
 * The pattern this encodes: a request field that NAMES a resource is a resource
 * selector, not authority over it. Four separate findings (SEC-015, RA-047,
 * RA-049, RA-053) were the same missing binding, so this suite exists to make
 * the fifth, sixth and seventh detectable by machine rather than by audit.
 *
 * Every mutating case asserts VICTIM STATE, not just the status code. A handler
 * can return 403 and still have done the thing; only the victim's balance and
 * resource list can say otherwise.
 *
 * Sandbox only. No production keys, no real rails, no SQL, no direct balance
 * edits — funding uses the Sandbox utility endpoint, which is what it is for.
 */
import {
  req, provisionMerchant, newRunId, assertSandboxAndBuild, assertExplicitRun, assertNominal,
} from '../payments/harness.mjs';

assertExplicitRun(process.env.BANZAMI_E2E);

const results = [];
const record = (id, name, pass, detail) => {
  results.push({ id, name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Register a Sandbox consumer. Tokens are never persisted to evidence. */
async function provisionConsumer(tag) {
  const s = String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);
  const r = await req('POST', '/consumer/v1/auth/register', {
    body: {
      phone: `+2449${s.slice(0, 8)}`,
      handle: `ra054${tag}${s}`.toLowerCase().slice(0, 20),
      full_name: `RA-054 ${tag}`,
      pin: '1234',
    },
  });
  if (r.status !== 201) throw new Error(`consumer register ${r.status}: ${r.raw.slice(0, 160)}`);
  return { id: r.body.consumer.id, handle: r.body.consumer.handle, token: r.body.token };
}

const merchantBalance = async (m) =>
  (await req('GET', `/v1/wallets/${m.walletId}/balance`, { token: m.token })).body?.available_minor ?? null;
const consumerBalance = async (c) =>
  (await req('GET', '/consumer/v1/me/wallet/balance', { token: c.token })).body?.available_minor ?? null;

/**
 * The reusable shape: attacker performs `attempt` against a victim resource;
 * the call must be refused AND the victim's observable state must be identical.
 *
 * Deliberately not generalised past this: "refused and unchanged" is the only
 * property every domain here shares. Anything more specific belongs in the case.
 */
async function refusedAndUnchanged(id, name, readVictimState, attempt, { allow = [403, 404, 405] } = {}) {
  const before = await readVictimState();
  const res = await attempt();
  const after = await readVictimState();

  const statusOk = allow.includes(res.status);
  const stateOk = JSON.stringify(before) === JSON.stringify(after);
  const detail =
    `status ${res.status} (want ${allow.join('/')}) · victim ${JSON.stringify(before)} → ${JSON.stringify(after)}`;
  record(id, name, statusOk && stateOk, detail);
  return res;
}

async function main() {
  const probe = await assertSandboxAndBuild(process.env.BANZAMI_SANDBOX_EXPECTED_COMMIT);
  const build = typeof probe === 'string' ? probe : (probe?.build ?? probe?.commit ?? String(probe));
  console.log(`runtime build: ${build}\n`);

  const runId = newRunId();
  const victim = await provisionMerchant(runId, 'vic');
  const attacker = await provisionMerchant(runId, 'atk');
  const payee = await provisionConsumer('r');
  const target = await provisionConsumer('v');

  // Fund the victim merchant so the payout case has something to steal. Without
  // funds the endpoint answers INSUFFICIENT_FUNDS and the test would pass for
  // the wrong reason — an empty wallet is not an authorization control.
  assertNominal(50_000);
  const funded = await req('POST', '/v1/sandbox/fund', {
    token: victim.token,
    body: { wallet_id: victim.walletId, amount_minor: 50_000, currency: 'AOA' },
  });
  record('RA054-000', 'victim merchant funded (precondition)', funded.status === 200,
    `status ${funded.status}, balance ${await merchantBalance(victim)}`);

  // ── RA-056 · payout from a wallet the caller does not own ──────────────────
  // Confirmed: HTTP 201, attacker merchant_id + victim wallet_id, queued to the
  // attacker's own bank account.
  await refusedAndUnchanged(
    'RA054-001',
    'payout naming another merchant\'s wallet is refused',
    () => merchantBalance(victim),
    () => req('POST', '/v1/payouts', {
      token: attacker.token,
      body: {
        idempotency_key: `${runId}:ra056`,
        wallet_id: victim.walletId,
        amount_minor: 10_000,
        currency: 'AOA',
        bank_account_number: '000123456',
        bank_code: 'BAI',
        account_holder_name: 'RA-054 ATTACKER',
      },
    }),
  );

  // The endpoint must not answer questions about a foreign wallet at all. A
  // balance-derived error (INSUFFICIENT_FUNDS) would mean the ownership check
  // runs after the balance lookup, turning payouts into a balance oracle.
  const oracle = await req('POST', '/v1/payouts', {
    token: attacker.token,
    body: {
      idempotency_key: `${runId}:ra056-oracle`,
      wallet_id: victim.walletId,
      amount_minor: 999_000_000,
      currency: 'AOA',
      bank_account_number: '000123456',
      bank_code: 'BAI',
      account_holder_name: 'RA-054 ATTACKER',
    },
  });
  record('RA054-002', 'payout does not leak a foreign wallet\'s balance',
    oracle.status !== 422 && !/INSUFFICIENT/i.test(oracle.raw),
    `status ${oracle.status} ${oracle.raw.slice(0, 80)}`);

  // ── RA-056 · cross-tenant payout read ─────────────────────────────────────
  const ownPayout = await req('POST', '/v1/payouts', {
    token: victim.token,
    body: {
      idempotency_key: `${runId}:own`,
      wallet_id: victim.walletId,
      amount_minor: 1_000,
      currency: 'AOA',
      bank_account_number: '000999888',
      bank_code: 'BAI',
      account_holder_name: 'RA-054 VICTIM',
    },
  });
  if (ownPayout.status === 201) {
    const read = await req('GET', `/v1/payouts/${ownPayout.body.id}`, { token: attacker.token });
    record('RA054-003', 'payout of another merchant is not readable by id',
      read.status === 404, `status ${read.status}`);
    const own = await req('GET', `/v1/payouts/${ownPayout.body.id}`, { token: victim.token });
    record('RA054-004', 'owner can still read their own payout (no over-correction)',
      own.status === 200, `status ${own.status}`);
  } else {
    record('RA054-003', 'payout of another merchant is not readable by id', false,
      `precondition failed: own payout ${ownPayout.status}`);
  }

  // Make the strength of the next state assertion visible. If the Phase-0 pilot
  // cap has stopped the registration grant, the target consumer holds nothing
  // and "balance unchanged" proves less — so say so rather than letting the
  // suite look stronger than it is (RA-059).
  const targetFunds = await consumerBalance(target);
  record('RA054-004b', 'target consumer holds funds (strengthens the debit assertion)',
    true, targetFunds > 0
      ? `balance ${targetFunds} — debit would be observable`
      : `balance ${targetFunds} — WEAK: grant did not apply, so the debit assertion is status-only`);

  // ── RA-057 · consumer-to-consumer payment requests ────────────────────────
  // Confirmed before the fix: created and executed by an unrelated merchant,
  // status PAID, victim consumer debited 1000000 → 995000 minor.
  const created = await refusedAndUnchanged(
    'RA054-005',
    'merchant cannot create a payment request between two consumers',
    () => consumerBalance(target),
    () => req('POST', '/v1/payment-requests', {
      token: attacker.token,
      body: {
        requester_id: payee.id,
        payer_id: target.id,
        amount_minor: 5_000,
        currency: 'AOA',
        message: 'RA-054 regression',
        idempotency_key: `${runId}:ra057`,
      },
    }),
  );

  // If creation is refused the execution path is unreachable; assert the route
  // itself is gone rather than trusting that.
  const exec = await req('POST', '/v1/payment-requests/00000000-0000-0000-0000-000000000000/pay', {
    token: attacker.token,
    body: { payer_id: target.id, idempotency_key: `${runId}:ra057-pay` },
  });
  record('RA054-006', 'payment-request execution surface is not mounted',
    [404, 405].includes(exec.status) && created.status !== 201, `status ${exec.status}`);

  // ── RA-058 · consumer wallet disclosure ───────────────────────────────────
  // The wallet id comes from the consumer's OWN authenticated view, so the
  // balance case tests a real wallet id rather than passing because the id was
  // wrong — a test that 404s on a nonexistent resource proves nothing.
  const targetWalletId =
    (await req('GET', '/consumer/v1/me/wallet/balance', { token: target.token })).body?.wallet_id;
  record('RA054-007', 'target consumer wallet id resolved (precondition)',
    Boolean(targetWalletId), `wallet ${targetWalletId ? 'resolved' : 'MISSING'}`);

  for (const [id, name, path] of [
    ['RA054-008', 'consumer wallet is not resolvable by consumer_id', `/v1/consumer-wallets?consumer_id=${target.id}&currency=AOA`],
    ['RA054-009', 'consumer wallet balance is not readable by a merchant', `/v1/consumer-wallets/${targetWalletId}/balance`],
    ['RA054-010', 'consumer wallet is not readable by id', `/v1/consumer-wallets/${targetWalletId}`],
  ]) {
    const r = await req('GET', path, { token: attacker.token });
    record(id, name, [403, 404, 405].includes(r.status), `status ${r.status}`);
  }

  // The consumer must still see their own wallet — the capability moved, it was
  // not removed.
  const selfWallet = await req('GET', '/consumer/v1/me/wallet/balance', { token: target.token });
  record('RA054-011', 'consumer still reads their own wallet balance',
    selfWallet.status === 200, `status ${selfWallet.status}`);

  // ── Non-regression: correctly-bound routes must still refuse, and owners
  // must still be served. A fix that breaks the legitimate path is not a fix.
  for (const [id, name, path] of [
    ['RA054-012', 'foreign wallet read refused', `/v1/wallets/${victim.walletId}`],
    ['RA054-013', 'foreign wallet balance refused', `/v1/wallets/${victim.walletId}/balance`],
    ['RA054-014', 'foreign merchant read refused', `/v1/merchants/${victim.merchantId}`],
  ]) {
    const r = await req('GET', path, { token: attacker.token });
    record(id, name, r.status === 404, `status ${r.status}`);
  }
  const ownWallet = await req('GET', `/v1/wallets/${victim.walletId}/balance`, { token: victim.token });
  record('RA054-015', 'owner still reads their own wallet', ownWallet.status === 200, `status ${ownWallet.status}`);
  const ownList = await req('GET', '/v1/payouts', { token: victim.token });
  record('RA054-016', 'owner still lists their own payouts', ownList.status === 200, `status ${ownList.status}`);

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  console.log(JSON.stringify({
    suite: 'ra-054-authority', build, runId,
    passed, total: results.length,
    promotable: passed === results.length,
    results,
  }, null, 2));
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
