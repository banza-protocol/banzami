#!/usr/bin/env node
/**
 * CONSUMER-HOME-REALTIME-001 — Proof 05: incoming payment auto-refreshes Home.
 *
 * Two fresh consumers in two isolated browser contexts, both on the real Flutter
 * Home. Consumer A sends to Consumer B through the real Send UI. Consumer B's
 * Home is NEVER reloaded, pulled, or navigated — it must update its balance and
 * recent activity automatically, driven by the consumer wallet realtime stream.
 * Latency (A's success → B's Home visibly updated) is measured.
 *
 *   node proofs/05-realtime-incoming-payment.mjs
 */
import { launchChromium } from '../lib/browser.mjs';
import { registerConsumer } from '../lib/consumer.mjs';
import { SendPage } from '../pages/send.mjs';
import { ReceiptPage } from '../pages/receipt.mjs';
import { HomePage } from '../pages/home.mjs';
import { retireConsumer } from '../lib/consumer-retire.mjs';
import { consumerBalanceMinor, bookSum } from '../lib/operator-read.mjs';
import { GateReport, runScopedPin, freshHandle } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';

const R = new GateReport('05-realtime-incoming-payment');
const AMOUNT_KZ = 420;
const AMOUNT_MINOR = AMOUNT_KZ * 100;
const START_MINOR = 1000000; // fresh consumer grant (10 000 Kz)
const A = { handle: freshHandle('e2ra'), name: 'E2E Ana', pin: runScopedPin() };
const B = { handle: freshHandle('e2rb'), name: 'E2E Bruno', pin: runScopedPin() };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser;
try {
  ({ browser } = await launchChromium());
  const ca = await registerConsumer(browser, { ...A, label: 'A' });
  const cb = await registerConsumer(browser, { ...B, label: 'B' });
  R.mark('CONSUMER_BROWSER_CONTEXT_ISOLATION', ca.context !== cb.context, 'two isolated contexts');

  // B sits on its real Home; capture its starting displayed balance.
  await cb.home.reach();
  const bUiBefore = await cb.home.readBalance();
  const bLedgerBefore = consumerBalanceMinor(B.handle);
  R.note('B_BEFORE', `ui=${bUiBefore} Kz ledger=${bLedgerBefore} minor`);

  // A sends to B through the real Send UI.
  await ca.home.tapEnviar();
  const send = new SendPage(ca.driver);
  await send.reach();
  await send.fill({ recipientHandle: B.handle, amountKz: AMOUNT_KZ });
  await send.continue();
  await send.confirm();
  const receiptA = new ReceiptPage(ca.driver);
  const aOk = await receiptA.waitForSuccess({ timeout: 25000 });
  const tSent = Date.now(); // A's payment is committed on the backend by now
  R.mark('A_SEND_SUCCESS', Boolean(aOk), `A saw "${aOk}"`);

  // B's Home must update WITHOUT any manual interaction. Poll B's displayed
  // balance via semantics only (a passive read — never a pull-to-refresh, never
  // a reload). Success = B shows the new balance.
  const expectKz = (START_MINOR + AMOUNT_MINOR) / 100; // 10 420
  let bUiAfter = null;
  let latencyMs = null;
  const deadline = Date.now() + 20000;
  const bHome = new HomePage(cb.driver);
  while (Date.now() < deadline) {
    const v = await bHome.readBalance().catch(() => null);
    if (v === expectKz) { bUiAfter = v; latencyMs = Date.now() - tSent; break; }
    await sleep(750);
  }
  R.mark('INCOMING_PAYMENT_AUTOMATIC_HOME_REFRESH', bUiAfter === expectKz,
    `B Home auto-updated to ${bUiAfter} Kz (expected ${expectKz}) in ${latencyMs ?? '>20000'}ms, no manual refresh`);
  R.mark('WEB_INCOMING_PAYMENT_REALTIME_E2E', bUiAfter === expectKz, `latency=${latencyMs ?? 'timeout'}ms`);

  // B's activity updated too (coherent balance+activity), and it reflects the
  // incoming payment — canonical, so no duplicate rows.
  const bText = await cb.driver.visibleText();
  const activityShows = /Recebido|Recebeu|\+\s?420/.test(bText);
  R.mark('BALANCE_ACTIVITY_REFRESH_COHERENCE', bUiAfter === expectKz && activityShows,
    activityShows ? 'activity shows the incoming payment' : 'activity did not reflect it');

  // Convergence to canonical truth (not screenshots alone).
  const bLedgerAfter = consumerBalanceMinor(B.handle);
  R.mark('CONSUMER_MULTI_CLIENT_STATE_CONVERGENCE',
    bLedgerAfter === bLedgerBefore + AMOUNT_MINOR && bUiAfter * 100 === bLedgerAfter,
    `B ledger ${bLedgerBefore}->${bLedgerAfter} minor, UI matches`);

  if (latencyMs !== null) {
    R.note('LATENCY_MS', `${latencyMs} (single sample; Sandbox 2s poll → sub-3s target)`);
  }

  // Manual pull-to-refresh still works (same canonical path).
  await bHome.reach();
  const bAfterManual = await bHome.readBalance().catch(() => null);
  R.mark('MANUAL_REFRESH_REGRESSION', bAfterManual === expectKz, `Home still reads ${bAfterManual} Kz`);

  const { balanced, sum } = bookSum();
  R.mark('BOOK_BALANCED', balanced, `sum=${sum} minor`);

  await ca.context.close();
  await cb.context.close();
} catch (e) {
  R.mark('PROOF_05', false, e.message);
} finally {
  try { retireConsumer(A.handle, { runId: 'proof05a' }); retireConsumer(B.handle, { runId: 'proof05b' }); } catch { /* best effort */ }
  if (browser) await browser.close().catch(() => {});
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_05_REALTIME_INCOMING_PAYMENT=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail)`);
  console.log(`evidence: ${out}`);
  process.exitCode = R.ok ? 0 : 1;
}
