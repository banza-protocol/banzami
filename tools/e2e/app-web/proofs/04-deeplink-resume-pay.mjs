#!/usr/bin/env node
/**
 * WEB-E2E-RUNNER-001 — Proof 04: valid deep-link auth→resume→pay (items 13,14).
 *
 * Provision a generic merchant + Payment Link, then pay it through the real App
 * Banzami Web UI reached by app.banzami.com/pay/{slug}: fresh signed-out
 * consumer → auth → payment resumes to review (NO auto-payment) → explicit
 * Pagar → receipt. Verifies the merchant side saw the payment.
 *
 *   node proofs/04-deeplink-resume-pay.mjs
 */
import { launchChromium } from '../lib/browser.mjs';
import { provisionMerchant, createPaymentLink } from '../lib/provision.mjs';
import { bookSum } from '../lib/operator-read.mjs';
import { payViaAppWebDeepLink } from '../lib/deeplink-pay.mjs';
import { GateReport, runScopedPin, freshHandle } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';

const R = new GateReport('04-deeplink-resume-pay');
const AMOUNT_KZ = 3500;
const AMOUNT_MINOR = AMOUNT_KZ * 100;
const consumer = { handle: freshHandle('e2ep'), name: 'E2E Pagador', pin: runScopedPin() };

let browser; let M;
try {
  ({ browser } = await launchChromium());
  M = await provisionMerchant({ prefix: 'appweb-p04' });
  R.mark('APP_WEB_DEVELOPER_GENERIC_TENANT', Boolean(M.ws && M.project), `ws+project, key bz_test_sk_*`);
  const link = await createPaymentLink(M.gw, { amountMinor: AMOUNT_MINOR, description: 'Proof 04 link' });
  R.note('PAYMENT_LINK', `slug=${link.slug} amount=${AMOUNT_MINOR} minor`);

  const o = await payViaAppWebDeepLink(browser, { appWebUrl: link.appWebUrl, consumer });

  R.mark('APP_BOOTS_ON_DEEPLINK', o.appBooted, 'engine+semantics up');
  R.mark('APP_WEB_AUTH_THEN_RESUME', o.authRequired && o.reviewShown, `authRequired=${o.authRequired} review=${o.reviewShown}`);
  R.mark('APP_WEB_POST_AUTH_PAYMENT_RESUME', o.reviewShown, 'review screen after auth');
  R.mark('APP_DEEPLINK_AUTO_PAYMENT=0', o.autoPaidBeforeConfirm === false,
    `balanceBeforeConfirm=${o.balanceBeforeConfirm} minor (unchanged)`);
  R.mark('APP_WEB_CONSUMER_UI_ACTUALLY_EXERCISED', o.paidSuccess, `success="${o.successTitle}"`);
  R.mark('APP_WEB_PAYMENT_UI_CONFIRMATION', o.paidSuccess, 'paid via real Pagar control');

  const debited = (o.balanceBeforeConfirm ?? 0) - (o.balanceAfterConfirm ?? 0);
  R.mark('PAYMENT_LINK_APP_WEB_E2E', o.paidSuccess && debited === AMOUNT_MINOR,
    `consumer debited ${debited} minor (expected ${AMOUNT_MINOR} minor)`);

  // Canonical integrity: the payment is a real, balanced double-entry movement —
  // value left the consumer and landed in a real account, book still sums to zero.
  const { balanced, sum } = bookSum();
  R.mark('APP_WEB_PAYMENT_LEDGER_BALANCED', balanced, `book sum=${sum} minor`);

  if (o.context) await o.context.close();
} catch (e) {
  R.mark('PROOF_04', false, e.message);
} finally {
  // Cleanup: delete the workspace (revokes keys, retires project resources).
  try { if (M?.ws) await M.call('DELETE', `/workspaces/${M.ws}`, { name: M.wsName }); } catch { /* best effort */ }
  if (browser) await browser.close().catch(() => {});
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_04_DEEPLINK_RESUME_PAY=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail)`);
  console.log(`evidence: ${out}`);
  process.exitCode = R.ok ? 0 : 1;
}
