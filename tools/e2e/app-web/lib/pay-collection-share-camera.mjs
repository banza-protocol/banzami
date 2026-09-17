#!/usr/bin/env node
/**
 * Consumer pays a Collection SHARE by CAMERA-scanning its rendered QR pixels.
 *
 * The share's canonical pay URL (obtained via surface → Payment Link → slug) is
 * rendered to a Y4M with the canonical QR encoder (the SAME pixels the Business Web
 * UI paints), fed to Chromium's fake camera, and decoded live by the Consumer Web
 * scanner (mobile_scanner + self-hosted ZXing) → canonical parser → pay flow. The
 * runner never navigates to the pay URL and never injects the payload: the camera
 * pixels are the only input (QR_BYPASS=0).
 *
 *   node pay-collection-share-camera.mjs '<payUrl>' <amountKz> <label>
 * Prints one JSON line: {"paid":bool,"detail":"...","balanceBeforeAfter":[...]}
 */
import { launchChromium } from './browser.mjs';
import { registerConsumer } from './consumer.mjs';
import { retireConsumer } from './consumer-retire.mjs';
import { writeQrY4m } from '../business-receive-web-e2e.mjs';
import { PaymentRequestPage } from '../pages/payment-request.mjs';
import { ReceiptPage } from '../pages/receipt.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP_WEB_URL ?? 'https://app.banzami.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const payUrl = process.argv[2];
const label = process.argv[4] || 'X';
if (!payUrl) { console.error('usage: pay-collection-share-camera.mjs <payUrl> <amountKz> <label>'); process.exit(2); }

(async () => {
  const media = join(HERE, '..', 'proofs', `x-collection-share-${label}.y4m`);
  writeQrY4m(payUrl, media);   // canonical QR pixels of the share pay URL
  const { browser } = await launchChromium({ args: [
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-video-capture=${media}`,
  ] });
  let cons; const out = { paid: false, detail: '', payUrl };
  try {
    cons = await registerConsumer(browser, { handle: `e2ecolcam${label}${Date.now().toString(36)}`.toLowerCase(), name: `E2E Col Cam ${label}`, pin: '719238', label: `cam${label}` });
    await cons.context.grantPermissions(['camera'], { origin: APP });
    // Fund the payer (test-money provisioning, NOT the payment under test).
    await cons.page.evaluate(async () => {
      const csrf = (document.cookie.match(/bz_app_csrf=([^;]+)/) || [])[1];
      await fetch('/consumer/v1/sandbox/fund', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf || '' }, body: JSON.stringify({ amount_minor: 500000, currency: 'AOA' }) });
    });
    await sleep(1200);
    // Scan: open the full-screen scanner; the fake camera plays the share QR pixels.
    await cons.home.reach();
    await cons.home.tapQrCode();
    const reached = await cons.driver.waitForText('A pagar', { timeout: 60000, every: 1000 }).then(() => true).catch(() => false);
    if (!reached) { out.detail = 'camera scan did not reach the pay flow (A pagar…)'; throw new Error(out.detail); }
    const pr = new PaymentRequestPage(cons.driver);
    const state = await pr.resolve({ timeout: 30000 }).catch(() => 'unresolved');
    if (state !== 'active') { out.detail = `pay review not reached (${state})`; throw new Error(out.detail); }
    await pr.pay();
    const rc = new ReceiptPage(cons.driver);
    const title = await rc.waitForSuccess({ timeout: 25000 }).catch(() => null);
    out.paid = Boolean(title);
    out.detail = out.paid ? `scanned+paid via camera (${title})` : 'pay did not confirm';
  } catch (e) {
    out.detail = out.detail || e.message;
  } finally {
    await browser.close().catch(() => {});
    if (cons) { try { retireConsumer(cons.handle, { runId: 'colcam' }); } catch { /* best effort */ } }
  }
  console.log(JSON.stringify(out));
  process.exitCode = out.paid ? 0 : 1;
})();
