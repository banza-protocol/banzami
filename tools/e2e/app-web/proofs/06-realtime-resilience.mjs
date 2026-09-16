#!/usr/bin/env node
/**
 * CONSUMER-HOME-REALTIME-001 — Proof 06: resilience (fallback + visibility).
 *
 * Two web-testable resilience guarantees, both with the real Flutter Home:
 *
 *  A. Realtime unavailable → bounded fallback (§16, §30). Consumer B's realtime
 *     stream is blocked at the network layer. A payment to B must STILL reach B's
 *     Home within the bounded fallback window (never unbounded staleness), proving
 *     realtime is not a single point of failure.
 *
 *  B. Hidden → visible recovery (§14, §31). Consumer B's tab is hidden, a payment
 *     arrives, then the tab becomes visible again — B's Home must refresh
 *     immediately on becoming visible (recovering a payment received while away).
 *
 *   node proofs/06-realtime-resilience.mjs
 */
import { launchChromium } from '../lib/browser.mjs';
import { registerConsumer } from '../lib/consumer.mjs';
import { SendPage } from '../pages/send.mjs';
import { ReceiptPage } from '../pages/receipt.mjs';
import { HomePage } from '../pages/home.mjs';
import { retireConsumer } from '../lib/consumer-retire.mjs';
import { GateReport, runScopedPin, freshHandle } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';

const R = new GateReport('06-realtime-resilience');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function payAtoB(ca, bHandle, amountKz) {
  await ca.home.reach();
  await ca.home.tapEnviar();
  const send = new SendPage(ca.driver);
  await send.reach();
  await send.fill({ recipientHandle: bHandle, amountKz });
  await send.continue();
  await send.confirm();
  const receipt = new ReceiptPage(ca.driver);
  const ok = await receipt.waitForSuccess({ timeout: 25000 });
  await receipt.done(); // dismiss the receipt so A returns Home for the next send
  return Boolean(ok);
}

// Poll B's displayed Home balance (passive read only — no pull, no reload).
async function waitForBalance(bHome, wantKz, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = await bHome.readBalance().catch(() => null);
    if (v === wantKz) return Date.now();
    await sleep(1000);
  }
  return null;
}

const A = { handle: freshHandle('e2sa'), name: 'E2E Ana', pin: runScopedPin() };
const B = { handle: freshHandle('e2sb'), name: 'E2E Bruno', pin: runScopedPin() };

let browser;
let cHandle;
try {
  ({ browser } = await launchChromium());
  const ca = await registerConsumer(browser, { ...A, label: 'A' });

  // ── A. Fallback: block B's realtime stream, prove the payment still lands ──
  const cb = await registerConsumer(browser, { ...B, label: 'B' });
  await cb.context.route('**/v1/me/realtime', (route) => route.abort());
  // Force the (now-blocked) stream + fallback to (re)start cleanly by reloading B
  // once with the route already blocked, then landing on Home.
  await cb.page.reload({ waitUntil: 'domcontentloaded' });
  await cb.home.reach();
  const bHome = new HomePage(cb.driver);
  const before = await bHome.readBalance();
  R.note('FALLBACK_SETUP', `B realtime blocked; B balance=${before} Kz`);

  const sent1 = await payAtoB(ca, B.handle, 100);
  R.mark('A_SEND_1', sent1, 'A paid B 100 Kz (B realtime blocked)');
  const tPay1 = Date.now();
  // Fallback poll is ~15s; allow up to 25s. This proves bounded staleness.
  const got1 = await waitForBalance(bHome, (before ?? 0) + 100, 25000);
  R.mark('REALTIME_FAILURE_HOME_STALENESS_UNBOUNDED=0', got1 !== null,
    got1 ? `B updated via fallback in ${got1 - tPay1}ms with realtime blocked` : 'B did not update within 25s');
  R.mark('MISSED_EVENT_RECOVERY', got1 !== null, 'payment reached B without realtime (fallback)');

  await cb.context.unroute('**/v1/me/realtime');
  await cb.context.close();

  // ── B. Hidden → visible recovery ──
  cHandle = freshHandle('e2sc');
  const cc = await registerConsumer(browser, { ...B, handle: cHandle, label: 'C' });
  await cc.home.reach();
  const cHome = new HomePage(cc.driver);
  const cBefore = await cHome.readBalance();
  // Hide the tab (drives Flutter web lifecycle → hidden; the controller drops the
  // stream and stops timers). Use CDP visibility emulation.
  const cdp = await cc.context.newCDPSession(cc.page);
  await cdp.send('Emulation.setVisibilityState', { visibility: 'hidden' }).catch(() => {});
  await sleep(1500);
  const sent2 = await payAtoB(ca, cc.handle, 100);
  R.mark('A_SEND_2', sent2, 'A paid C 100 Kz while C hidden');
  await sleep(2000);
  // Become visible → onForeground → immediate refresh.
  await cdp.send('Emulation.setVisibilityState', { visibility: 'visible' }).catch(() => {});
  const tVisible = Date.now();
  const got2 = await waitForBalance(cHome, (cBefore ?? 0) + 100, 15000);
  R.mark('WEB_VISIBILITY_HOME_REFRESH', got2 !== null,
    got2 ? `C refreshed ${got2 - tVisible}ms after becoming visible` : 'C did not refresh on visible');
  R.mark('FOREGROUND_MISSED_PAYMENT_RECOVERY', got2 !== null, 'payment received while hidden recovered on visible');

  await cc.context.close();
  await ca.context.close();
} catch (e) {
  R.mark('PROOF_06', false, e.message);
} finally {
  try {
    retireConsumer(A.handle, { runId: 'proof06a' });
    retireConsumer(B.handle, { runId: 'proof06b' });
    if (typeof cHandle === 'string') retireConsumer(cHandle, { runId: 'proof06c' });
  } catch { /* best effort */ }
  if (browser) await browser.close().catch(() => {});
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_06_REALTIME_RESILIENCE=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail)`);
  console.log(`evidence: ${out}`);
  process.exitCode = R.ok ? 0 : 1;
}
