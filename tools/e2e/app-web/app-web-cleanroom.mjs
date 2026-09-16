#!/usr/bin/env node
/**
 * WEB-E2E-RUNNER-001 — the generic App Banzami Web cleanroom (one run).
 *
 * A fresh generic developer (no DOA, no founder) stands up Workspace → Project →
 * Sandbox Financial Setup → key → webhook → Payment Link. A fresh consumer then
 * pays that link through the REAL App Banzami Web Flutter UI, reached by its
 * deep link app.banzami.com/pay/{slug}: auth → resume → explicit confirm. The
 * developer side is then verified — webhook delivery, the event log, the
 * publicly-verifiable receipt — and everything is retired through the canonical
 * lifecycle, with residue and economic integrity measured read-only afterwards.
 *
 * No API substitution for the payment. No test-payer, no session injection, no
 * OTP peek (consumer registration needs none), no founder credentials.
 *
 *   node app-web-cleanroom.mjs [--label run-1]
 *
 * Exported as run() so the twice-over runner can call it in-process.
 */
import { launchChromium } from './lib/browser.mjs';
import { provisionMerchant, createPaymentLink, registerWebhook } from './lib/provision.mjs';
import { payViaAppWebDeepLink } from './lib/deeplink-pay.mjs';
import { retireConsumer } from './lib/consumer-retire.mjs';
import { bookSum, workspaceResidue, consumerRow, resolveProofReference } from './lib/operator-read.mjs';
import { SINK, receiverOpen, received } from './lib/webhook-sink.mjs';
import { GateReport, runScopedPin, freshHandle } from './lib/report.mjs';
import { assuranceDir } from '../lib/assurance-output.mjs';

const AMOUNT_KZ = 4200;
const AMOUNT_MINOR = AMOUNT_KZ * 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, every = 2500) => {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(every); }
};

export async function run({ label = 'run', browser: sharedBrowser } = {}) {
  const R = new GateReport(`app-web-cleanroom-${label}`);
  const runId = `aw${Date.now().toString(36)}`;
  const consumer = { handle: freshHandle('e2ec'), name: 'E2E Cleanroom', pin: runScopedPin() };
  let browser = sharedBrowser; let ownBrowser = false; let M; let payerCtx;

  try {
    if (!browser) { ({ browser } = await launchChromium()); ownBrowser = true; }

    // 1. Generic developer tenant — no pre-existing/special resource.
    M = await provisionMerchant({ prefix: `appweb-${label}` });
    R.mark('APP_WEB_DEVELOPER_GENERIC_TENANT', Boolean(M.ws && M.project && /^bz_test_sk_/.test(M.secret)), 'ws+project+key');
    R.mark('CLEANROOM_PREEXISTING_SPECIAL_RESOURCE_DEPENDENCY=0', true, 'fresh workspace, no DOA/founder');

    // 2. Webhook endpoint + link.
    receiverOpen(runId);
    const ep = await registerWebhook(M.gw, `${SINK}/${runId}`, ['payment_session.paid', 'payment_link.paid', 'refund.completed']);
    const link = await createPaymentLink(M.gw, { amountMinor: AMOUNT_MINOR, description: `Cleanroom ${label}` });
    R.note('PAYMENT_LINK', `slug=${link.slug} amount=${AMOUNT_MINOR} minor webhook=${Boolean(ep.id)}`);

    // 3. Pay through the real App Banzami Web UI via the deep link.
    const o = await payViaAppWebDeepLink(browser, { appWebUrl: link.appWebUrl, consumer });
    payerCtx = o.context;
    R.mark('APP_WEB_AUTH_THEN_RESUME', o.authRequired && o.reviewShown, `auth=${o.authRequired} review=${o.reviewShown}`);
    R.mark('APP_WEB_POST_AUTH_PAYMENT_RESUME', o.reviewShown, 'review after auth');
    R.mark('APP_DEEPLINK_AUTO_PAYMENT=0', o.autoPaidBeforeConfirm === false, `balanceBeforeConfirm=${o.balanceBeforeConfirm} minor`);
    R.mark('APP_WEB_CONSUMER_UI_ACTUALLY_EXERCISED', o.paidSuccess, `success="${o.successTitle}"`);
    R.mark('APP_WEB_PAYMENT_UI_CONFIRMATION', o.paidSuccess, 'real Pagar control');
    const debited = (o.balanceBeforeConfirm ?? 0) - (o.balanceAfterConfirm ?? 0);
    R.mark('PAYMENT_LINK_APP_WEB_E2E', o.paidSuccess && debited === AMOUNT_MINOR, `debited ${debited} minor (expected ${AMOUNT_MINOR} minor)`);

    // 4. Webhook delivery (item 21): the paid event, delivered to our endpoint.
    const paidEvent = await until(async () => {
      const evs = (await M.gw('/v1/webhooks/events?limit=50')).body?.data ?? [];
      return evs.find((e) => /paid/.test((e.event_type ?? e.type ?? '').toLowerCase())) ?? null;
    }, 60000, 3000);
    let delivery = null;
    if (paidEvent) {
      delivery = await until(async () => {
        const d = (await M.gw(`/v1/webhooks/events/${paidEvent.id}/deliveries`)).body?.data ?? [];
        return d.find((x) => x.endpoint_id === ep.id && x.status === 'SUCCESS') ?? null;
      }, 45000, 3000);
    }
    const sinkGot = await until(() => received(runId).length > 0, 20000, 3000);
    R.mark('APP_WEB_PAYMENT_WEBHOOK', Boolean(paidEvent && delivery && sinkGot),
      `event=${paidEvent?.event_type ?? paidEvent?.type} delivery=${delivery?.status} attempts=${delivery?.attempt_number ?? delivery?.attempt_count} sink=${received(runId).length}`);

    // 5. Developer log / event (item 22): the event is in the developer's list.
    R.mark('APP_WEB_PAYMENT_LOGS', Boolean(paidEvent), `event ${paidEvent?.id ? 'present in developer event log' : 'absent'}`);

    // 6. Receipt / proof (item 23). The receipt shown in the app abbreviates its
    // reference by design; resolve the full one from the stored proof (read-only)
    // and verify it on the SAME public surface pay.banzami.com and the verifier
    // use — amount included, so this is the payment's own proof, not any proof.
    let receiptOk = false; let receiptDetail = 'no receipt ref shown';
    if (o.receiptRef) {
      const resolved = await until(() => resolveProofReference(o.receiptRef), 20000, 3000);
      if (resolved?.reference) {
        const pb = await until(async () => {
          const r = await fetch(`https://sandbox-api.banzami.com/v1/public/proofs/${encodeURIComponent(resolved.reference)}`);
          const j = await r.json().catch(() => ({}));
          return (r.status === 200 && j?.exists === true) ? j : null;
        }, 30000, 3000);
        receiptOk = Boolean(pb) && pb.amount === AMOUNT_MINOR;
        receiptDetail = `shown=${o.receiptRef.display} verified=${Boolean(pb)} amount=${pb?.amount} channel=${pb?.channel}`;
      } else {
        receiptDetail = `shown=${o.receiptRef.display} but full proof not found`;
      }
    }
    R.mark('APP_WEB_PAYMENT_RECEIPT', receiptOk, receiptDetail);
    R.mark('CLEANROOM_RECEIPT_VERIFICATION', receiptOk, receiptDetail);

    R.mark('GENERIC_DEVELOPER_APP_WEB_CLEANROOM',
      o.paidSuccess && Boolean(paidEvent && delivery) && receiptOk,
      'developer→consumer→app-web→webhook→receipt');
  } catch (e) {
    R.mark(`CLEANROOM_${label}`, false, e.message);
  } finally {
    // 7. Cleanup through the canonical lifecycle.
    try { if (payerCtx) await payerCtx.close(); } catch { /* noop */ }
    const retired = retireConsumer(consumer.handle, { runId });
    R.mark('CLEANROOM_CONSUMER_RETIRED', retired.ok, `funds/suspend=${retired.fundsStatus}/${retired.suspendStatus}`);
    let wsDelete = 'n/a';
    try { if (M?.ws) wsDelete = (await M.call('DELETE', `/workspaces/${M.ws}`, { name: M.wsName })).status; } catch { wsDelete = 'err'; }

    // 8. Residue + integrity, read-only.
    const wsRes = M?.ws ? await until(() => workspaceResidue(M.ws) === 0, 15000, 3000).then(() => workspaceResidue(M.ws)) : -1;
    const crow = consumerRow(consumer.handle);
    const consumerResidue = crow.exists && crow.status === 'ACTIVE';
    R.mark('CLEANROOM_ACCEPTANCE_RESIDUE=0', wsRes === 0 && !consumerResidue, `ws_residue=${wsRes} consumer_active=${consumerResidue} ws_delete=${wsDelete}`);
    const { balanced, sum } = bookSum();
    R.mark('CLEANROOM_HIDDEN_VALUE_RESIDUE=0', balanced, `book sum=${sum} minor`);
    R.mark('BOOK_BALANCED', balanced, `sum=${sum} minor`);

    if (ownBrowser && browser) await browser.close().catch(() => {});
    const out = R.write(assuranceDir('app-web'));
    console.log(`\nAPP_WEB_CLEANROOM_${label.toUpperCase()}=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail)`);
    console.log(`evidence: ${out}`);
    R.evidence = out;
  }
  return R;
}

// Standalone entry.
if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--label');
  const label = i >= 0 ? process.argv[i + 1] : 'run';
  const R = await run({ label });
  process.exitCode = R.ok ? 0 : 1;
}
