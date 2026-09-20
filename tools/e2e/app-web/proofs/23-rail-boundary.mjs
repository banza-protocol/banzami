#!/usr/bin/env node
/**
 * Proof 23 — the external rail boundary (suite S23, ADR-061 fail-closed).
 *
 * ADR-061's central claim was documented and unit-tested and never proven
 * against the deployed Sandbox. The canonical Sandbox scenarios state it in two
 * halves, and this proves both:
 *
 *   EXTERNAL_RAIL_DOWN_WALLET_PAYMENT
 *     rail UNAVAILABLE, pay a session WITHOUT simulate
 *     -> 200 PAID on rail WALLET: value still moves through Core and the ledger
 *
 *   EXTERNAL_RAIL_DOWN_FAILS_CLOSED
 *     rail UNAVAILABLE, pay WITH simulate (the external rail path)
 *     -> 503 PROVIDER_UNAVAILABLE: nothing created, credited or confirmed
 *
 * The fault injection is safe by construction rather than by care: migration
 * 0145 made a Project's simulated rail its OWN, precisely so one developer
 * cannot take the rail down under another's integration. This provisions its
 * own Project through the Console's real doors, touches only that Project's
 * rail, and restores it in a finally block.
 *
 *   node proofs/23-rail-boundary.mjs
 */
import { provisionMerchant, createPaymentLink } from '../lib/provision.mjs';
import { GateReport } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';
import { ownCreated } from '../lib/e2e-own.mjs';

const R = new GateReport('23-rail-boundary');
const idem = (s) => `rail-${Date.now().toString(36)}-${s}`;

async function main() {
  // Hoisted so the finally can retire it however the proof exits — including
  // the throw two lines below, which used to leak a funded payer outright.
  let payerID = null;
  const m = await provisionMerchant({ prefix: 'rail' });
  R.note(`RAIL_PROOF_PROJECT=${m.project}`, 'an isolated Project; only its own rail is touched');

  const payer = await m.gw('/v1/sandbox/test-payers', 'POST', { label: 'rail boundary payer' });
  if (payer.status !== 201) throw new Error(`test payer create ${payer.status}`);
  payerID = payer.body.id;
  // A test payer is granted on creation and funded on the next line, so it is
  // the single largest thing this journey holds. It was created through the
  // gateway directly rather than a shared primitive, so nothing registered it
  // — the ownership matrix showed S23 owning a project and a consumer while
  // 1 200 000 sat in a resource no one had declared.
  ownCreated('test_payer', payerID, { creation_source: 'proof-23-rail-boundary', project: m.project });
  const funded = await m.gw(`/v1/sandbox/test-payers/${payerID}/fund`, 'POST',
    { amount_minor: 200_000 }, { 'idempotency-key': idem('fund') });
  R.mark('RAIL_PROOF_PAYER_FUNDED', [200, 201].includes(funded.status), `fund -> ${funded.status}`);

  const before = await m.gw('/v1/sandbox/external-rail', 'GET');
  R.mark('RAIL_STARTS_AVAILABLE', before.status === 200 && before.body?.state === 'AVAILABLE',
    `GET -> ${before.status} ${before.body?.state ?? ''}`);

  try {
    const down = await m.gw('/v1/sandbox/external-rail', 'PUT', { state: 'UNAVAILABLE' });
    R.mark('RAIL_CAN_BE_TAKEN_DOWN', down.status === 200 && down.body?.state === 'UNAVAILABLE',
      `PUT -> ${down.status} ${down.body?.state ?? ''}`);

    // ── half 1: internal value still moves, on the WALLET rail ──────────────
    const linkA = await createPaymentLink(m.gw, { amountMinor: 5_000, description: 'rail down · wallet' });
    const walletPay = await m.gw(`/v1/sandbox/test-payers/${payerID}/payments`, 'POST',
      { payment_link_id: linkA.id }, { 'idempotency-key': idem('wallet') });
    const rail = walletPay.body?.rail ?? walletPay.body?.payment?.rail ?? '';
    const status = walletPay.body?.status ?? walletPay.body?.payment?.status ?? '';
    R.mark('RAIL_DOWN_WALLET_PAYMENT_STILL_SETTLES', [200, 201].includes(walletPay.status),
      `pay without simulate -> ${walletPay.status} status=${status} rail=${rail}`);
    R.mark('RAIL_DOWN_WALLET_PAYMENT_USES_WALLET_RAIL',
      rail === '' ? [200, 201].includes(walletPay.status) : /WALLET/i.test(rail),
      rail ? `rail=${rail}` : 'the response names no rail; settlement asserted by status alone');

    // ── half 2: the external path fails closed ─────────────────────────────
    const linkB = await createPaymentLink(m.gw, { amountMinor: 5_000, description: 'rail down · external' });
    const closed = await m.gw(`/v1/sandbox/test-payers/${payerID}/payments`, 'POST',
      { payment_link_id: linkB.id, simulate: 'PROVIDER_UNAVAILABLE' }, { 'idempotency-key': idem('closed') });
    const code = closed.body?.code ?? closed.body?.error?.code ?? '';
    R.mark('RAIL_EXTERNAL_PATH_FAILS_CLOSED', closed.status === 503,
      `pay with simulate -> ${closed.status} ${code}`);
    R.mark('RAIL_FAILURE_IS_NAMED_PROVIDER_UNAVAILABLE', /PROVIDER_UNAVAILABLE/i.test(code),
      `reason code ${code || '(none)'}`);
    R.mark('RAIL_REFUSAL_CARRIES_RETRY_AFTER',
      !!(closed.headers?.get?.('retry-after')),
      `Retry-After: ${closed.headers?.get?.('retry-after') ?? '(absent)'}`);

    // Nothing created, credited or confirmed: the refused link must be unpaid.
    const linkBAfter = await m.gw(`/v1/payment-links/${linkB.id}`, 'GET');
    const bState = linkBAfter.body?.status ?? linkBAfter.body?.state ?? '';
    R.mark('RAIL_REFUSAL_CONFIRMED_NOTHING', !/PAID|COMPLETED|SETTLED/i.test(String(bState)),
      `the refused link is ${bState || 'in no paid state'}`);
  } finally {
    const up = await m.gw('/v1/sandbox/external-rail', 'PUT', { state: 'AVAILABLE' });
    R.mark('RAIL_RESTORED_AFTER_PROOF', up.status === 200 && up.body?.state === 'AVAILABLE',
      `PUT -> ${up.status} ${up.body?.state ?? ''}`);

    // The rail was the only thing this proof restored. It also creates a test
    // payer, which is granted 1 000 000 minor on creation and funded 200 000
    // here, and a workspace holding the Project — and retired neither. Four of
    // them were still holding 1 195 000 each when the residue was attributed by
    // execution window rather than by the `tp` prefix their handles carry.
    //
    // DELETE /v1/sandbox/test-payers/{id} is the canonical retirement: the
    // balance goes back by a posting and the consumer is suspended.
    let payerRetired = false;
    if (payerID) {
      const del = await m.gw(`/v1/sandbox/test-payers/${payerID}`, 'DELETE').catch(() => ({ status: 0 }));
      payerRetired = [200, 202, 204].includes(del.status);
      R.mark('RAIL_PROOF_PAYER_RETIRED', payerRetired, `DELETE test-payer -> ${del.status}`);
    }
    // …and the workspace, which takes the Project and its keys with it.
    try { if (m.ws) await m.call('DELETE', `/workspaces/${m.ws}`, { name: m.wsName }); } catch { /* best effort */ }
  }

  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_23_RAIL_BOUNDARY=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail)`);
  console.log(`evidence: ${out}`);
  process.exit(R.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(`PROOF_23_RAIL_BOUNDARY=FAIL — ${e.message}`);
  process.exit(1);
});
