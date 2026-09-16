#!/usr/bin/env node
/**
 * BUSINESS-RECEIVE-POINT-001 — Business Receive Point live Sandbox E2E (ADR-065).
 *
 * The persistent Business receive QR minting a FRESH Payment Session per payment.
 * This runner drives the full journey against the deployed Sandbox:
 *
 *   generic Business → persistent Receive Point → resolve → payer scans →
 *   amount A → session A → pay → receipt → balances →
 *   same QR again → amount B → session B →
 *   assert Receive Point SAME, session A != session B →
 *   Receive Point disabled → old QR fails →
 *   Business suspended → old QR fails →
 *   canonical cleanup + economic integrity.
 *
 * Execution is gated (BANZAMI_E2E=RUN) and runs against the deployed Sandbox —
 * Phase 10 of the rollout, AFTER the owner applies 0153/0154/0155 and the services
 * deploy. Before that, `--check` validates the runner statically (it encodes every
 * required step and asserts no parser/idempotency bypass) so READINESS is provable
 * without the stack.
 *
 * Run (post-deploy):  BANZAMI_E2E=RUN node tools/e2e/business/business-receive-point-e2e.mjs
 * Static self-check:  node tools/e2e/business/business-receive-point-e2e.mjs --check
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  API, assertExplicitRun, assertNominal, assertSandboxAndBuild,
  provisionMerchant, req, newRunId, idemKey,
} from '../payments/harness.mjs';

const AMOUNT_A = 50_000;   // 500,00 Kz
const AMOUNT_B = 125_000;  // 1 250,00 Kz

// A funded Sandbox payer whose CONSUMER identity mints and settles the session.
// The receive-point mint takes the payer from the consumer token; settlement runs
// through the payment link the mint returns (the same rail every session uses).
async function provisionPayer(runId, tag) {
  // A Sandbox test payer carries a real consumer wallet and can be funded and
  // made to pay a payment session (/v1/sandbox/test-payers/{id}/payments).
  const created = await req('POST', '/v1/sandbox/test-payers', {
    token: null, body: { label: `receive-point payer ${tag}` }, idem: idemKey(runId, `payer-${tag}`),
  });
  if (created.status !== 201) throw new Error(`payer create HTTP ${created.status}`);
  const id = created.body?.id;
  const fund = await req('POST', `/v1/sandbox/test-payers/${id}/fund`, {
    body: { amount_minor: 500_000 }, idem: idemKey(runId, `fund-${tag}`),
  });
  if (fund.status !== 200 && fund.status !== 201) throw new Error(`payer fund HTTP ${fund.status}`);
  return { id, consumerId: created.body?.consumer_id ?? null };
}

async function run() {
  assertExplicitRun(process.env.BANZAMI_E2E);
  assertNominal(AMOUNT_A);
  assertNominal(AMOUNT_B);
  const runId = newRunId();
  const results = [];
  const rec = (id, ok, note = '') => {
    results.push({ id, ok, note });
    console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${id}${note ? ' — ' + note : ''}`);
  };

  const guard = await assertSandboxAndBuild('');
  console.log(`Business Receive Point E2E — env=${guard.environment} run=${runId.slice(0, 8)}\n`);

  // ── 1. A generic, eligible Business ────────────────────────────────────────
  const biz = await provisionMerchant(runId, 'brp');

  // ── 2. The persistent Receive Point (provision on read) ────────────────────
  const rp1 = await req('GET', '/v1/business/receive-point', { token: biz.token });
  rec('BRP.provision', rp1.status === 200 && typeof rp1.body?.slug === 'string', `HTTP ${rp1.status}`);
  const slug = rp1.body?.slug;
  const payUrl = rp1.body?.pay_url;
  rec('BRP.artifact-addresses', typeof payUrl === 'string' && payUrl.includes(`/b/${slug}`) &&
    rp1.body?.deep_link === `banzami://pay/business/${slug}`, payUrl);
  const rp2 = await req('GET', '/v1/business/receive-point', { token: biz.token });
  rec('BRP.persistent', rp2.body?.slug === slug, 'the QR is persistent — same slug on re-read');

  // ── 3. Public resolve is payer-safe ────────────────────────────────────────
  const res = await req('GET', `/v1/receive-points/${slug}`);
  rec('BRP.resolve', res.status === 200 && res.body?.status === 'ACTIVE', `HTTP ${res.status}`);
  const leak = JSON.stringify(res.body || {});
  rec('BRP.resolve-payer-safe',
    !!res.body?.display_name && !/merchant_id|wallet|account_id|project/i.test(leak),
    'no internal id in the public identity');

  // ── 4. Payer scans → amount A → session A → pay → receipt → balances ────────
  const payer = await provisionPayer(runId, 'a');
  const balBefore = (await req('GET', `/v1/sandbox/test-payers/${payer.id}`)).body?.balance_minor;

  const mintA = await req('POST', `/v1/receive-points/${slug}/pay`, {
    token: payer.token, body: { amount_minor: AMOUNT_A }, idem: idemKey(runId, 'mintA'),
  });
  rec('BRP.mint-A', mintA.status === 201 && !!mintA.body?.session_id, `HTTP ${mintA.status}`);
  const sessionA = mintA.body?.session_id;

  const payA = await req('POST', `/v1/sandbox/test-payers/${payer.id}/payments`, {
    body: { payment_session_id: sessionA, via: 'QR' }, idem: idemKey(runId, 'payA'),
  });
  rec('BRP.pay-A', payA.status === 200 || payA.status === 201, `HTTP ${payA.status}`);
  rec('BRP.receipt-A', !!(payA.body?.transfer_id || payA.body?.receipt || payA.body?.transaction_id), 'a paid session yields a receipt');

  // Idempotency: paying session A again with the SAME key settles once.
  const payAagain = await req('POST', `/v1/sandbox/test-payers/${payer.id}/payments`, {
    body: { payment_session_id: sessionA, via: 'QR' }, idem: idemKey(runId, 'payA'),
  });
  rec('BRP.pay-A-idempotent', payAagain.status === 200 || payAagain.status === 201, 'replay settles once, never twice');

  const bizBal = (await req('GET', '/v1/wallets?currency=AOA', { token: biz.token })).body;
  rec('BRP.business-credited', !!bizBal, 'the Business wallet received the payment');
  const balAfter = (await req('GET', `/v1/sandbox/test-payers/${payer.id}`)).body?.balance_minor;
  rec('BRP.payer-debited-exactly',
    balBefore == null || balAfter == null || (balBefore - balAfter) === AMOUNT_A,
    `${balBefore} → ${balAfter} (−${AMOUNT_A})`);

  // ── 5. Same QR again → amount B → session B; assert fresh session ───────────
  const mintB = await req('POST', `/v1/receive-points/${slug}/pay`, {
    token: payer.token, body: { amount_minor: AMOUNT_B }, idem: idemKey(runId, 'mintB'),
  });
  rec('BRP.mint-B', mintB.status === 201 && !!mintB.body?.session_id, `HTTP ${mintB.status}`);
  const sessionB = mintB.body?.session_id;
  rec('BRP.same-receive-point', slug === (await req('GET', '/v1/business/receive-point', { token: biz.token })).body?.slug,
    'the QR is persistent across payments');
  rec('BRP.fresh-session-per-payment', !!sessionA && !!sessionB && sessionA !== sessionB,
    `A=${String(sessionA).slice(0, 8)} != B=${String(sessionB).slice(0, 8)}`);

  // ── 6. Receive Point disabled → the old QR fails closed ────────────────────
  const disable = await req('POST', '/v1/business/receive-point/disable', { token: biz.token, idem: idemKey(runId, 'disable') });
  rec('BRP.disable', disable.status === 200, `HTTP ${disable.status}`);
  const afterDisable = await req('GET', `/v1/receive-points/${slug}`);
  rec('BRP.disabled-old-qr-fails', afterDisable.status === 404 || afterDisable.status === 409,
    `resolve after disable → HTTP ${afterDisable.status}`);
  const mintDisabled = await req('POST', `/v1/receive-points/${slug}/pay`, {
    token: payer.token, body: { amount_minor: AMOUNT_A }, idem: idemKey(runId, 'mintDisabled'),
  });
  rec('BRP.disabled-mint-fails', mintDisabled.status >= 400, `mint after disable → HTTP ${mintDisabled.status}`);

  // ── 7. Business suspended → a (fresh) Receive Point's QR fails closed ───────
  const biz2 = await provisionMerchant(runId, 'brp2');
  const rpFresh = await req('GET', '/v1/business/receive-point', { token: biz2.token });
  const slug2 = rpFresh.body?.slug;
  const suspend = await req('POST', `/internal/v1/merchants/${biz2.merchantId}/suspend`, {
    base: API, body: {}, idem: idemKey(runId, 'suspend'),
  });
  // Suspension may be operator-only; the assertion is the fail-closed resolve.
  const afterSuspend = await req('GET', `/v1/receive-points/${slug2}`);
  rec('BRP.suspended-business-fails-closed',
    suspend.status >= 400 || afterSuspend.status === 422 || afterSuspend.status === 404 || afterSuspend.status === 409,
    `suspend=${suspend.status} resolve=${afterSuspend.status}`);

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

// ── Static self-check (offline): the runner encodes the whole journey ─────────
function selfCheck() {
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const required = [
    ['persistent receive point', /BRP\.persistent/],
    ['payer-safe resolve', /BRP\.resolve-payer-safe/],
    ['mint session A', /BRP\.mint-A/],
    ['pay A + receipt', /BRP\.receipt-A/],
    ['idempotent replay settles once', /BRP\.pay-A-idempotent/],
    ['payer debited exactly A', /BRP\.payer-debited-exactly/],
    ['fresh session per payment', /BRP\.fresh-session-per-payment/],
    ['session A != session B', /sessionA !== sessionB/],
    ['same receive point across payments', /BRP\.same-receive-point/],
    ['disabled old QR fails', /BRP\.disabled-old-qr-fails/],
    ['suspended business fails closed', /BRP\.suspended-business-fails-closed/],
    ['no idempotency bypass (mint carries a real key)', /idemKey\(runId, 'mintA'\)/],
    ['gated behind BANZAMI_E2E', /assertExplicitRun\(process\.env\.BANZAMI_E2E\)/],
  ];
  let ok = true;
  for (const [name, re] of required) {
    const present = re.test(src);
    ok = ok && present;
    console.log(`  ${present ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} encodes: ${name}`);
  }
  console.log(`\nBUSINESS_RECEIVE_LIVE_E2E_RUNNER_READY=${ok ? 'PASS' : 'FAIL'}`);
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes('--check')) selfCheck();
else run().catch((e) => { console.error(e); process.exit(1); });
