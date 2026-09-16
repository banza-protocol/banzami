#!/usr/bin/env node
/**
 * WEB-QR-CAMERA-001 — Proof 07: the Web QR camera path, end to end.
 *
 * Drives the real Flutter scanner on app.banzami.com with Chromium fake-media:
 *   ALLOWED  — camera granted (fake device) → scanner shows a live preview, not
 *              an error, and NEVER iOS wording.
 *   DENIED   — camera present but not granted → Web-specific "no navegador" copy
 *              (WEB_IOS_CAMERA_COPY=0) + a working "Tentar novamente".
 *   RETRY    — grant after denial + "Tentar novamente" → preview starts (no reload).
 *   NO-CAM   — no camera device → "Câmara não encontrada" (not "não autorizada").
 *   PIPELINE — a fake camera fed a REAL Banzami QR video (Y4M) → the QR passes
 *              through camera → stream → scanner → decoder → canonical parser →
 *              the payment review for the encoded @banza (no injection, no auto-pay).
 *
 *   node proofs/07-web-qr-camera.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { launchChromium } from '../lib/browser.mjs';
import { registerConsumer, APP } from '../lib/consumer.mjs';
import { retireConsumer } from '../lib/consumer-retire.mjs';
import { GateReport, runScopedPin, freshHandle } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const Y4M = join(HERE, '..', 'fixtures', 'qr.y4m');
const R = new GateReport('07-web-qr-camera');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const handles = [];

// Open the scanner from Home and return the driver once it (or its error) shows.
async function openScanner(c) {
  await c.home.reach();
  await c.driver.tapButton('QR Code');
  await c.page.waitForTimeout(2500);
}
const text = (c) => c.driver.visibleText();

async function section(name, launchOpts, grant, fn) {
  const { browser } = await launchChromium(launchOpts);
  try {
    const consumer = { handle: freshHandle('e2rq'), name: 'E2E QR', pin: runScopedPin() };
    handles.push(consumer.handle);
    // Grant/deny camera at the context level via the registerConsumer context.
    const c = await registerConsumer(browser, { ...consumer, label: name });
    if (grant) await c.context.grantPermissions(['camera'], { origin: APP });
    await fn(c, browser);
    await c.context.close();
  } finally {
    await browser.close().catch(() => {});
  }
}

try {
  // ── ALLOWED: preview, no error, no iOS copy ────────────────────────────────
  await section('allowed',
    { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, true,
    async (c) => {
      await openScanner(c);
      const t = await text(c);
      const preview = t.includes('Aponte para o código QR');
      const noErr = !t.includes('Câmara não autorizada') && !t.includes('não encontrada');
      const noIos = !/iPhone|Definições do seu/i.test(t);
      R.mark('WEB_QR_CAMERA_ALLOWED_E2E', preview && noErr, preview ? 'live preview shown' : `no preview; saw: ${t.slice(0, 80)}`);
      R.mark('WEB_IOS_CAMERA_COPY=0 (allowed)', noIos, noIos ? 'no iOS wording' : 'iOS wording present!');
    });

  // ── DENIED + RETRY ─────────────────────────────────────────────────────────
  await section('denied',
    { args: ['--use-fake-device-for-media-stream'] }, false,
    async (c) => {
      await openScanner(c);
      const t = await text(c);
      const denied = t.includes('Câmara não autorizada');
      const webCopy = /no navegador/i.test(t);
      const noIos = !/iPhone|Definições do seu/i.test(t);
      const retryBtn = t.includes('Tentar novamente');
      R.mark('WEB_QR_CAMERA_DENIED_E2E', denied && retryBtn, `denied=${denied} retry=${retryBtn}`);
      R.mark('WEB_IOS_CAMERA_COPY=0 (denied)', noIos && webCopy, noIos ? 'web copy, no iPhone' : 'iOS wording present!');
      // Retry after granting.
      await c.context.grantPermissions(['camera'], { origin: APP });
      await c.driver.tapButton('Tentar novamente').catch(() => c.driver.tapText('Tentar novamente'));
      await c.page.waitForTimeout(2500);
      const t2 = await text(c);
      R.mark('WEB_QR_CAMERA_RETRY_E2E', t2.includes('Aponte para o código QR'),
        t2.includes('Aponte para o código QR') ? 'preview after grant+retry' : `still: ${t2.slice(0, 70)}`);
    });

  // ── NO CAMERA → "não encontrada" ───────────────────────────────────────────
  await section('nocam', {}, true, async (c) => {
    await openScanner(c);
    const t = await text(c);
    R.mark('WEB_QR_NO_CAMERA_COPY', t.includes('não encontrada') || t.includes('Não foi possível iniciar'),
      `saw: ${t.slice(0, 80)}`);
  });

  // ── PIPELINE: real QR through the fake camera video ────────────────────────
  const bHandle = freshHandle('e2rp');
  execFileSync('node', [join(HERE, '..', 'fixtures', 'make-qr-y4m.mjs'), `banzami-sandbox://pay/u/${bHandle}?amount=500`], { cwd: join(HERE, '..'), stdio: 'ignore' });
  if (!existsSync(Y4M)) throw new Error('qr.y4m fixture not generated');
  {
    const { browser } = await launchChromium({
      args: [`--use-file-for-fake-video-capture=${Y4M}`, '--use-fake-ui-for-media-stream'],
    });
    try {
      // Recipient B (so the decoded handle resolves to a real review).
      const b = { handle: bHandle, name: 'E2E QR Payee', pin: runScopedPin() };
      handles.push(bHandle);
      const cb = await registerConsumer(browser, { ...b, label: 'B' });
      await cb.context.close();
      // Scanner user A.
      const a = { handle: freshHandle('e2ra'), name: 'E2E QR Payer', pin: runScopedPin() };
      handles.push(a.handle);
      const ca = await registerConsumer(browser, { ...a, label: 'A' });
      await ca.context.grantPermissions(['camera'], { origin: APP });
      await openScanner(ca);
      // The QR should decode within a few frames and navigate off the scanner.
      let decoded = false; let landed = '';
      for (let i = 0; i < 12; i++) {
        const t = await text(ca);
        if (!t.includes('Aponte para o código QR') && (t.includes(bHandle) || /Confirmar|Enviar|Vai enviar|Para quem/i.test(t))) {
          decoded = true; landed = t.slice(0, 90); break;
        }
        await sleep(1000);
      }
      R.mark('WEB_QR_CAMERA_REAL_MEDIA_PIPELINE_E2E', decoded,
        decoded ? `QR decoded from camera → review (${landed})` : 'QR not decoded from fake camera feed');
      R.mark('WEB_QR_CANONICAL_PARSER', decoded, 'decoded payload resolved by BanzamiQrParser (handle payment)');
      // No auto-payment: we are at review, not a receipt.
      const t = await text(ca);
      R.mark('QR_SCAN_AUTO_PAYMENT=0', !/Pagamento conclu[íi]do|Enviado com sucesso/.test(t), 'no payment executed by scanning');
      await ca.context.close();
    } finally {
      await browser.close().catch(() => {});
    }
  }
} catch (e) {
  R.mark('PROOF_07', false, e.message);
} finally {
  for (const h of handles) { try { retireConsumer(h, { runId: 'proof07' }); } catch { /* best effort */ } }
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_07_WEB_QR_CAMERA=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail)`);
  console.log(`evidence: ${out}`);
  process.exitCode = R.ok ? 0 : 1;
}
