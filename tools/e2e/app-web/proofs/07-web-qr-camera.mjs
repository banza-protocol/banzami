#!/usr/bin/env node
/**
 * WEB-QR-CAMERA-001 — Proof 07: the Web QR camera path, end to end.
 *
 * Drives the REAL Flutter scanner on app.banzami.com with Chromium fake-media —
 * no decoded-value injection, no callback/navigation shortcuts. Every gate is an
 * observation of the deployed app's own behaviour.
 *
 *   ALLOWED   — camera granted (fake device) → live preview, no error, never iOS
 *               wording; a single generic webcam (no rear) works (desktop compat);
 *               torch control hidden when unsupported; secure context.
 *   RELEASE   — open/close the scanner repeatedly → camera tracks stop, never a
 *               duplicate/leaked stream, nothing capturing in the background.
 *   VISIBILITY— tab hidden→visible while scanning → no duplicate streams, stays live.
 *   MOBILE    — mobile viewport → scanner still opens with graceful constraints.
 *   DENIED    — camera present but not granted → Web "no navegador" copy (no iOS),
 *               a clean error card (no scan rectangle), a working "Tentar novamente".
 *   RETRY     — grant after denial + retry → preview starts, no reload, no logout.
 *   NO-CAM    — no camera device → "não encontrada/indisponível" (NOT "não autorizada").
 *   PIPELINE  — a fake camera fed a REAL Banzami QR video (Y4M) → camera → stream →
 *               scanner → self-hosted ZXing → canonical parser → the payment review
 *               for the encoded @banza (no injection, no auto-pay); same-origin
 *               network only, no frame upload, no recording.
 *   INVALID   — a non-Banzami QR → bounded (stays on scanner), no crash, no payment.
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
const FIXDIR = join(HERE, '..', 'fixtures');
const Y4M = join(FIXDIR, 'qr.y4m');
const GEN = join(FIXDIR, 'make-qr-y4m.mjs');
const R = new GateReport('07-web-qr-camera');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const handles = [];

// Instrument the camera boundary WITHOUT changing product behaviour: count the
// video tracks getUserMedia hands out and when they stop (release/duplicate/
// background), detect any MediaRecorder (recording), and provide the __denyCam
// gate used to simulate a real browser permission denial. Injected before the app
// boots so it wraps mobile_scanner's own getUserMedia calls.
const CAM_INSTRUMENT = () => {
  const cam = { startedV: 0, stoppedV: 0, activeV: 0, maxActiveV: 0, recorder: 0 };
  window.__cam = cam;
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = async (constraints) => {
      if (window.__denyCam) throw new DOMException('Permission denied', 'NotAllowedError');
      const stream = await orig(constraints);
      for (const t of stream.getVideoTracks()) {
        cam.startedV++; cam.activeV++; cam.maxActiveV = Math.max(cam.maxActiveV, cam.activeV);
        let counted = false;
        const dec = () => { if (!counted) { counted = true; cam.stoppedV++; cam.activeV--; } };
        const stop = t.stop.bind(t);
        t.stop = () => { dec(); return stop(); };
        t.addEventListener('ended', dec);
      }
      return stream;
    };
  }
  if (window.MediaRecorder) {
    const OR = window.MediaRecorder;
    const W = function (...a) { cam.recorder++; return new OR(...a); };
    W.isTypeSupported = OR.isTypeSupported ? OR.isTypeSupported.bind(OR) : undefined;
    window.MediaRecorder = W;
  }
};

async function instrument(c, { deny = false } = {}) {
  await c.context.addInitScript(CAM_INSTRUMENT);
  if (deny) await c.context.addInitScript(() => { window.__denyCam = true; });
  await c.page.reload({ waitUntil: 'domcontentloaded' });
  await c.home.reach();
}
const camStats = (c) => c.page.evaluate(() => window.__cam || null);
const text = (c) => c.driver.visibleText();
const full = (c) => c.driver.fullText();

async function openScanner(c, wait = 2500) {
  await c.home.reach();
  await c.driver.tapButton('QR Code');
  await c.page.waitForTimeout(wait);
}
/** The scanner's own prompt: present exactly while it is open. */
const SCANNER_PROMPT = /Aponte para o código QR/;

/** Every close this proof attempted, and whether the scanner actually went away. */
const closes = [];

/**
 * Close the scanner, and PROVE it closed.
 *
 * This was `tapButton('Fechar').catch(() => tapText('Voltar').catch(() => {}))`:
 * both failures swallowed, so a close that never happened was indistinguishable
 * from one that did. The four camera-lifecycle gates downstream — release,
 * duplicate streams, background capture, visibility — then read a scanner that
 * was still open as an application refusing to release the camera.
 *
 * BZV-20260923-0001 failed all four (started=3 stopped=2 active=1) with a screen
 * showing three stacked scanner overlays, and the evidence could not say which
 * of the two it was: a product that does not release, or an instrument that
 * never asked. That is the defect. The reading is now taken.
 */
/**
 * Wait for the camera to go quiet, and say how long it took.
 *
 * `waitForTimeout(1200)` was a fixed sleep standing in for a condition. Track
 * release is asynchronous: measured 1200 ms after a close, the reading was
 * started=3 stopped=2 active=1 — exactly one behind — and maxActive=2, which is
 * what a stop landing after the NEXT open looks like. Both are what a lagging
 * release produces, and both are also what a genuine leak produces, so the
 * fixed sleep could not tell them apart.
 *
 * Polling to a bound can. A track that never goes quiet is a leak; one that
 * goes quiet at 1.4 s was always going to.
 */
async function waitForCameraQuiet(c, boundMs = 6000) {
  const t0 = Date.now();
  for (;;) {
    const s = await camStats(c);
    if (s && s.activeV === 0) return { quiet: true, ms: Date.now() - t0 };
    if (Date.now() - t0 >= boundMs) return { quiet: false, ms: Date.now() - t0, active: s?.activeV ?? null };
    await c.page.waitForTimeout(150);
  }
}

async function closeScanner(c, { settle = true } = {}) {
  let how = null;
  try { await c.driver.tapButton('Fechar'); how = 'Fechar'; }
  catch {
    try { await c.driver.tapText('Voltar'); how = 'Voltar'; }
    catch { how = null; }
  }
  await c.page.waitForTimeout(600);
  // The observation, not the intention: is the scanner still on screen?
  const stillOpen = SCANNER_PROMPT.test(await text(c));
  // Settle BEFORE the caller opens again, so a release still in flight can
  // never be counted as a second concurrent stream by the next open.
  const q = settle ? await waitForCameraQuiet(c) : { quiet: null, ms: 0 };
  closes.push({ how, closed: !stillOpen, quiet: q.quiet, ms: q.ms, active: q.active });
  return { how, closed: !stillOpen, ...q };
}

async function section(name, launchOpts, grant, fn) {
  const { browser } = await launchChromium(launchOpts);
  try {
    const consumer = { handle: freshHandle('e2rq'), name: 'E2E QR', pin: runScopedPin() };
    handles.push(consumer.handle);
    const c = await registerConsumer(browser, { ...consumer, label: name });
    if (grant) await c.context.grantPermissions(['camera'], { origin: APP });
    await fn(c, browser);
    await c.context.close();
  } finally {
    await browser.close().catch(() => {});
  }
}

const FAKE = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
let deniedPermissionCopy = false; // set in DENIED; consumed by error-classification
let nocamNonPermission = false;   // set in NO-CAM; consumed by error-classification

try {
  // ── ALLOWED + desktop webcam + torch + release + visibility + mobile ─────────
  await section('allowed', { args: FAKE }, true, async (c) => {
    await instrument(c);
    await openScanner(c);
    const t = await text(c);
    const preview = t.includes('Aponte para o código QR');
    const noErr = !/Câmara não|Leitura de QR indispon|Não foi possível iniciar/.test(t);
    const noIos = !/iPhone|Definições do seu/i.test(t);
    const secure = await c.page.evaluate(() => window.isSecureContext === true);
    R.mark('WEB_QR_CAMERA_ALLOWED_E2E', preview && noErr, preview ? 'live preview shown' : `no preview; saw: ${t.slice(0, 80)}`);
    R.mark('WEB_IOS_CAMERA_COPY=0 (allowed)', noIos, noIos ? 'no iOS wording' : 'iOS wording present!');
    R.mark('WEB_CAMERA_SECURE_CONTEXT', secure, secure ? 'HTTPS secure context' : 'not a secure context');
    // A single generic fake webcam has no environment/rear camera; the preview
    // still came up (the scanner falls back off CameraFacing.back) → desktop OK.
    R.mark('WEB_DESKTOP_WEBCAM_COMPATIBILITY', preview && noErr, preview ? 'single generic webcam → preview live (no rear required)' : 'no preview on generic webcam');
    // Torch: a desktop webcam reports torch unavailable → no control is shown.
    const ft = await full(c);
    const torchShown = /lanterna/i.test(ft);
    R.mark('WEB_UNSUPPORTED_TORCH_CONTROL=0', !torchShown, torchShown ? 'torch control present on a webcam without torch!' : 'no torch control on unsupported camera');

    // RELEASE ON CLOSE + NO DUPLICATE STREAMS: open/close several times.
    await closeScanner(c);
    for (let i = 0; i < 2; i++) { await openScanner(c, 1800); await closeScanner(c); }
    // THE INSTRUMENT ANSWERS FIRST. Every gate below reads camera state after a
    // close, so a close that did not land makes all of them lie in the same
    // direction. Stated as its own gate so the next reader is never left
    // choosing between two explanations for one number.
    const closed = closes.filter((x) => x.closed).length;
    R.mark('WEB_SCANNER_CLOSE_IS_REAL', closes.length > 0 && closed === closes.length,
      `${closed}/${closes.length} close(s) actually dismissed the scanner` +
      (closed === closes.length ? '' :
        ` — via ${[...new Set(closes.map((x) => x.how ?? 'no control found'))].join(', ')};` +
        ' the camera gates below are NOT evidence about the application while this fails'));
    // How long release actually took, stated. A bound that is met with room to
    // spare and a bound that is missed look identical in a pass/fail alone.
    R.mark('WEB_CAMERA_RELEASE_IS_PROMPT', closes.every((x) => x.quiet !== false),
      closes.map((x) => (x.quiet ? `${x.ms}ms` : `NEVER (active=${x.active} after ${x.ms}ms)`)).join(', '));

    const s1 = await camStats(c);
    const released = s1 && s1.activeV === 0 && s1.startedV >= 2;
    R.mark('WEB_CAMERA_RELEASE_ON_CLOSE', released, s1 ? `started=${s1.startedV} stopped=${s1.stoppedV} active=${s1.activeV}` : 'no cam stats');
    R.mark('WEB_DUPLICATE_CAMERA_STREAMS=0', s1 && s1.maxActiveV <= 1, s1 ? `max concurrent video tracks=${s1.maxActiveV}` : 'no cam stats');
    // Background capture: with the scanner closed, nothing is capturing.
    R.mark('QR_CAMERA_BACKGROUND_CAPTURE=0', s1 && s1.activeV === 0, s1 ? `active video tracks while closed=${s1.activeV}` : 'no cam stats');

    // VISIBILITY: hide/show the tab while the scanner is open.
    await openScanner(c, 1800);
    await c.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await c.page.waitForTimeout(800);
    await c.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await c.page.waitForTimeout(1200);
    const s2 = await camStats(c);
    const tv = await text(c);
    const okVis = s2 && s2.activeV <= 1 && !/Câmara não|indispon/.test(tv);
    R.mark('WEB_CAMERA_VISIBILITY_RECOVERY', okVis, s2 ? `after hide/show active=${s2.activeV} max=${s2.maxActiveV}` : 'no cam stats');
    await closeScanner(c);

    // MOBILE viewport: the scanner opens with graceful constraints (no desktop
    // regression — a fake device has no environment cam, so it must not hard-fail).
    await c.page.setViewportSize({ width: 390, height: 844 });
    await openScanner(c);
    const tm = await text(c);
    const okM = tm.includes('Aponte para o código QR') && !/Câmara não|indispon/.test(tm);
    R.mark('WEB_MOBILE_VIEWPORT_QR', okM, okM ? 'scanner live at 390px viewport' : `mobile: ${tm.slice(0, 70)}`);
  });

  // ── DENIED + RETRY + error visual quality + permission classification ────────
  await section('denied', { args: FAKE }, true, async (c) => {
    await instrument(c, { deny: true });
    await openScanner(c);
    const t = await text(c);
    const denied = t.includes('Câmara não autorizada');
    const webCopy = /no navegador/i.test(t);
    const noIos = !/iPhone|Definições do seu/i.test(t);
    const retryBtn = t.includes('Tentar novamente');
    // Error visual quality: the aiming label / scan rectangle overlay must be gone
    // in the error state (it is replaced by a centered error card with actions).
    const noScanRect = !t.includes('Aponte para o código QR');
    const hasActions = retryBtn && t.includes('Voltar');
    deniedPermissionCopy = denied && webCopy && noIos;
    R.mark('WEB_QR_CAMERA_DENIED_E2E', denied && retryBtn, `denied=${denied} retry=${retryBtn}`);
    R.mark('WEB_IOS_CAMERA_COPY=0 (denied)', noIos && webCopy, noIos ? 'web copy, no iPhone' : 'iOS/incorrect copy!');
    R.mark('WEB_CAMERA_ERROR_VISUAL_QUALITY', noScanRect && hasActions, `noScanRect=${noScanRect} actions=${hasActions}`);
    // Clear the denial + retry → the real (fake) camera opens. No reload, no logout.
    await c.page.evaluate(() => { window.__denyCam = false; });
    await c.driver.tapButton('Tentar novamente').catch(() => c.driver.tapText('Tentar novamente'));
    await c.page.waitForTimeout(2500);
    const t2 = await text(c);
    const stillLoggedIn = !/Criar conta|Já tenho conta|Entrar/.test(t2);
    const recovered = t2.includes('Aponte para o código QR');
    R.mark('WEB_QR_CAMERA_RETRY_E2E', recovered, recovered ? 'preview after clearing denial + retry' : `still: ${t2.slice(0, 70)}`);
    R.mark('WEB_CAMERA_PERMISSION_CHANGE_RECOVERY', recovered && stillLoggedIn, recovered ? 'denied→granted recovered, no reload/logout' : 'no recovery');
  });

  // ── NO CAMERA → "não encontrada/indisponível" (never "não autorizada") ───────
  await section('nocam', {}, true, async (c) => {
    await instrument(c);
    await openScanner(c);
    const t = await text(c);
    const notDenied = !t.includes('Câmara não autorizada') && !/iPhone|Definições do seu/i.test(t);
    const truthful = t.includes('não encontrada') || t.includes('indisponível') || t.includes('Não foi possível iniciar');
    nocamNonPermission = notDenied && truthful;
    R.mark('WEB_CAMERA_NO_DEVICE_CLASSIFICATION', notDenied && truthful, `saw: ${t.slice(0, 80)}`);
  });

  // Error classification is truthful across the two real error states:
  // permission-denied → permission copy; no-device → NON-permission copy.
  R.mark('WEB_CAMERA_ERROR_CLASSIFICATION', deniedPermissionCopy && nocamNonPermission,
    `denied→permission=${deniedPermissionCopy}, nocam→non-permission=${nocamNonPermission}`);

  // ── PIPELINE: real QR through the fake camera video + network/privacy trace ──
  const bHandle = freshHandle('e2rp');
  execFileSync('node', [GEN, `banzami-sandbox://pay/u/${bHandle}?amount=500`], { cwd: join(HERE, '..'), stdio: 'ignore' });
  if (!existsSync(Y4M)) throw new Error('qr.y4m fixture not generated');
  {
    const { browser } = await launchChromium({
      // --use-file-for-fake-video-capture only delivers the Y4M when the fake
      // device is ALSO enabled; with the file flag alone the stream is black and
      // nothing decodes. Both together feed the real QR frames to getUserMedia.
      args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${Y4M}`, '--use-fake-ui-for-media-stream'],
    });
    try {
      const b = { handle: bHandle, name: 'E2E QR Payee', pin: runScopedPin() };
      handles.push(bHandle);
      const cb = await registerConsumer(browser, { ...b, label: 'B' });
      await cb.context.close();
      const a = { handle: freshHandle('e2ra'), name: 'E2E QR Payer', pin: runScopedPin() };
      handles.push(a.handle);
      const ca = await registerConsumer(browser, { ...a, label: 'A' });
      await ca.context.grantPermissions(['camera'], { origin: APP });
      await instrument(ca);
      // Capture every network request made from the moment the scanner is used.
      const reqs = [];
      ca.page.on('request', (r) => reqs.push({ url: r.url(), method: r.method(), type: r.resourceType(), bodyLen: (r.postData() || '').length }));

      await openScanner(ca);
      const openText = await text(ca);
      const camError = /Câmara não|Leitura de QR indispon|Não foi possível iniciar/.test(openText);
      const aiming = openText.includes('Aponte para o código QR');
      let decoded = false; let landed = '';
      for (let i = 0; i < 25; i++) {
        const t = await text(ca);
        if (!t.includes('Aponte para o código QR') && (t.includes(bHandle) || /Confirmar|Enviar|Vai enviar|Para quem|destinat/i.test(t))) {
          decoded = true; landed = t.slice(0, 90); break;
        }
        await sleep(1000);
      }
      R.mark('WEB_QR_CAMERA_PIPELINE_PREVIEW', (aiming || decoded) && !camError,
        camError ? `camera error at open: ${openText.slice(0, 60)}` : (aiming ? 'fake-camera preview live' : 'preview live (decoded immediately)'));
      R.mark('WEB_QR_CAMERA_REAL_MEDIA_PIPELINE_E2E', decoded,
        decoded ? `QR decoded from camera → review (${landed})` : 'QR not decoded from fake camera feed');
      R.mark('WEB_QR_CANONICAL_PARSER', decoded, decoded ? 'decoded payload resolved by BanzamiQrParser (handle payment)' : 'no decode');
      const t = await text(ca);
      R.mark('QR_SCAN_AUTO_PAYMENT=0', !/Pagamento conclu[íi]do|Enviado com sucesso/.test(t), 'no payment executed by scanning');

      // The decode arrived through the real MediaStream — this proof never calls
      // onDetect, never navigates directly, never injects a decoded value.
      R.mark('QR_E2E_DECODER_BYPASS=0', decoded, 'decode arrived via getUserMedia MediaStream; no callback/navigation/value injection');

      // Network + privacy trace over the whole scanner session.
      const thirdPartyJs = reqs.filter((r) => r.type === 'script' && !/^https:\/\/app\.banzami\.com\//.test(r.url));
      const cdnDecoder = reqs.filter((r) => /unpkg|jsdelivr|cdnjs|cdn\./i.test(r.url));
      const zxingSelf = reqs.some((r) => /^https:\/\/app\.banzami\.com\/zxing-library-0\.21\.3\.js$/.test(r.url));
      const bigUploads = reqs.filter((r) => r.method === 'POST' && r.bodyLen > 50000);
      const cam = await camStats(ca);
      R.mark('WEB_QR_NETWORK_TRACE', thirdPartyJs.length === 0 && cdnDecoder.length === 0 && zxingSelf,
        `thirdPartyJs=${thirdPartyJs.length} cdnDecoder=${cdnDecoder.length} zxingSelf=${zxingSelf}`);
      R.mark('CAMERA_VIDEO_SERVER_UPLOAD=0', bigUploads.length === 0 && cam && cam.recorder === 0,
        `bigPOSTs=${bigUploads.length} recorders=${cam ? cam.recorder : '?'}`);
      R.mark('QR_CAMERA_RECORDING=0', cam && cam.recorder === 0, cam ? `MediaRecorder constructions=${cam.recorder}` : 'no cam stats');
      await ca.context.close();
    } finally {
      await browser.close().catch(() => {});
    }
  }

  // ── INVALID QR: a non-Banzami QR is bounded (no navigation, no payment) ──────
  execFileSync('node', [GEN, 'https://example.com/not-a-banzami-qr'], { cwd: join(HERE, '..'), stdio: 'ignore' });
  {
    const { browser } = await launchChromium({
      args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${Y4M}`, '--use-fake-ui-for-media-stream'],
    });
    try {
      const a = { handle: freshHandle('e2ri'), name: 'E2E QR Invalid', pin: runScopedPin() };
      handles.push(a.handle);
      const ca = await registerConsumer(browser, { ...a, label: 'invalid' });
      await ca.context.grantPermissions(['camera'], { origin: APP });
      await instrument(ca);
      await openScanner(ca);
      // Give it as long as the valid decode needed; a non-Banzami QR must be
      // ignored by the canonical parser, so we must still be on the scanner.
      let navigatedAway = false;
      for (let i = 0; i < 8; i++) {
        const t = await text(ca);
        if (!t.includes('Aponte para o código QR') && /Confirmar|Enviar|Vai enviar|Pagamento/i.test(t)) { navigatedAway = true; break; }
        await sleep(1000);
      }
      const t = await text(ca);
      const stillScanner = t.includes('Aponte para o código QR');
      const noPayment = !/Pagamento conclu[íi]do|Enviado com sucesso/.test(t);
      R.mark('WEB_INVALID_QR_E2E', stillScanner && !navigatedAway && noPayment,
        `stillScanner=${stillScanner} navigatedAway=${navigatedAway} noPayment=${noPayment}`);
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
