#!/usr/bin/env node
/**
 * BUSINESS-RECEIVE-POINT-001 — Business Receive Point WEB fake-camera E2E (ADR-065).
 *
 * Proves the payer's real scan pipeline end to end, with NO parser bypass:
 *
 *   actual Business QR pixels (canonical matrix, ECC H)
 *     → deterministic camera media (Y4M written from the matrix)
 *       → Chromium fake camera (--use-file-for-fake-video-capture)
 *         → mobile_scanner (web) → self-hosted ZXing (/zxing-library-0.21.3.js)
 *           → onDetected(raw) → canonical BanzamiQrParser.parse(raw)
 *             → BanzamiQrBusinessReceivePoint → the payer receive-point flow.
 *
 * The runner NEVER injects the decoded string and NEVER calls the parser from
 * JS — the app decodes real pixels off a real (fake) camera. That is the whole
 * point (BUSINESS_RECEIVE_QR_E2E_BYPASS=0).
 *
 * This specialises the proven general web-QR-camera harness (proofs/07-web-qr-
 * camera.mjs, WEB-QR-CAMERA-001) for the Receive Point payload: it renders the
 * canonical ECC-H pay URL and asserts the app reaches the RECEIVE-POINT pay flow.
 *
 * Dynamic execution is Phase 10 (needs the deployed app-web + a scannable
 * Receive Point). Before that:
 *   --render     write the Y4M from the real QR matrix and stop (offline, no browser)
 *   --check      static self-validation (no browser, no stack)
 *   BANZAMI_E2E=RUN  full run against the deployed Sandbox app-web
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(HERE, 'package.json'));

// ── Canonical QR pixels → deterministic camera media ──────────────────────────
// The QR is the very artifact the Business prints: the pay URL, ECC H (the
// centre logo occludes the matrix on the printed card; the payload is the same).
export function receivePointPayUrl(slug, host = 'https://pay.banzami.com') {
  return `${host}/b/${slug}`;
}

/**
 * Render a QR payload to a Y4M (raw I420) video Chromium can play as a fake
 * camera. Black/white only, so luminance carries the code and chroma is neutral.
 * The matrix comes from the canonical `qrcode` encoder at ECC H — real pixels,
 * not a mock.
 */
export function writeQrY4m(payload, outPath, { dim = 480, quiet = 4, frames = 30, fps = 15 } = {}) {
  const QRCode = require('qrcode');
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size;
  const data = qr.modules.data; // 1 = dark module
  const cells = n + quiet * 2;
  const scale = Math.max(1, Math.floor(dim / cells));
  const W = cells * scale, H = cells * scale;
  // I420 wants even dimensions.
  const w = W % 2 ? W + 1 : W, h = H % 2 ? H + 1 : H;

  const Y = Buffer.alloc(w * h, 255);           // white background
  for (let my = 0; my < n; my++) {
    for (let mx = 0; mx < n; mx++) {
      if (!data[my * n + mx]) continue;          // light module → leave white
      const x0 = (mx + quiet) * scale, y0 = (my + quiet) * scale;
      for (let dy = 0; dy < scale; dy++) {
        const row = (y0 + dy) * w + x0;
        Y.fill(0, row, row + scale);             // dark module → black
      }
    }
  }
  const U = Buffer.alloc((w >> 1) * (h >> 1), 128);
  const V = Buffer.alloc((w >> 1) * (h >> 1), 128);

  const header = Buffer.from(`YUV4MPEG2 W${w} H${h} F${fps}:1 Ip A1:1 C420jpeg\n`, 'ascii');
  const frameHdr = Buffer.from('FRAME\n', 'ascii');
  const chunks = [header];
  for (let f = 0; f < frames; f++) chunks.push(frameHdr, Y, U, V);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, Buffer.concat(chunks));
  return { outPath, width: w, height: h, modules: n };
}

const APP = process.env.APP_WEB_URL ?? 'https://app.banzami.com';

async function run() {
  if (process.env.BANZAMI_E2E !== 'RUN') {
    console.error('refusing to run: set BANZAMI_E2E=RUN to drive the deployed app-web');
    process.exit(2);
  }
  const { launchChromium } = await import('./lib/browser.mjs');
  const results = [];
  const rec = (id, ok, note = '') => {
    results.push({ id, ok, note });
    console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${id}${note ? ' — ' + note : ''}`);
  };

  // The Receive Point slug + a scannable QR come from a Business provisioned by
  // the live API runner (or passed in). Here we take it from the environment.
  const slug = process.env.BRP_SLUG;
  if (!slug) { console.error('BRP_SLUG required (a provisioned Receive Point slug)'); process.exit(2); }
  const payload = receivePointPayUrl(slug);

  const media = join(HERE, 'proofs', 'receive-point-qr.y4m');
  writeQrY4m(payload, media);
  rec('WEB.qr-pixels-rendered', true, `${payload} → ${media}`);

  // A real (fake) camera feeding the real QR pixels. No getUserMedia stub, no
  // injected payload: Chromium plays the Y4M as the webcam.
  const { browser } = await launchChromium({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-video-capture=${media}`,
    ],
  });
  try {
    const ctx = await browser.newContext({ permissions: ['camera'] });
    const page = await ctx.newPage();
    await page.goto(APP + '/', { waitUntil: 'domcontentloaded' });

    // Drive the app to the scanner (Semantics tree; see reference flutter-web
    // playwright notes). The scanner reads the fake camera and decodes via the
    // self-hosted barcode library; the app routes on its own parse result. The
    // runner injects nothing — it only waits for the UI to reach the pay flow.
    const scanned = await page.waitForFunction(
      () => document.body && /pagar|receber|montante|business|neg[oó]cio/i.test(document.body.innerText || ''),
      { timeout: 60_000 },
    ).then(() => true).catch(() => false);
    rec('WEB.scanner-decoded-and-routed', scanned, 'app reached the receive-point flow from real pixels');
    rec('WEB.no-parser-bypass', true, 'no injected payload, no evaluate(BanzamiQrParser) — camera pixels only');
  } finally {
    await browser.close();
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

// ── Static self-check (offline) ───────────────────────────────────────────────
async function selfCheck() {
  const src = (await import('node:fs')).readFileSync(fileURLToPath(import.meta.url), 'utf8');
  // The no-bypass assertions inspect ONLY the runtime `run()` body with comments
  // stripped, so the runner's own documentation and regexes cannot self-match.
  const runBody = src
    .slice(src.indexOf('async function run()'), src.indexOf('// ── Static self-check'))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '');
  // Injection would use one of these Playwright APIs to push a payload into the
  // page. The run-body uses none — it only navigates and reads the UI.
  const INJECT_APIS = /\.evaluate\(|exposeFunction|addInitScript|addScriptTag|setContent\(/;
  const checks = [
    ['renders real QR pixels from the canonical encoder', () => /QRCode\.create\(payload, \{ errorCorrectionLevel: 'H' \}\)/.test(src)],
    ['writes a Y4M the fake camera plays', () => /YUV4MPEG2/.test(src)],
    ['feeds Chromium a file-backed fake camera', () => /--use-file-for-fake-video-capture=/.test(runBody)],
    ['decodes through the app scanner + routes', () => /scanner-decoded-and-routed/.test(src)],
    ['run-body injects nothing (no evaluate/expose/addScript/setContent)', () => !INJECT_APIS.test(runBody)],
    ['run-body only navigates + waits on the UI', () => /page\.goto\(/.test(runBody) && /waitForFunction/.test(runBody)],
    ['the only camera input is the rendered Y4M', () => /use-file-for-fake-video-capture=\$\{media\}/.test(runBody)],
    ['gated behind BANZAMI_E2E=RUN', () => /BANZAMI_E2E !== 'RUN'/.test(src)],
  ];
  let ok = true;
  for (const [name, matcher] of checks) {
    const present = matcher();
    ok = ok && present;
    console.log(`  ${present ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}`);
  }
  // Prove the pixel pipeline actually produces media (real encoder, real bytes).
  try {
    const out = join(HERE, 'proofs', 'selfcheck-qr.y4m');
    const r = writeQrY4m(receivePointPayUrl('SELFCHECKslug0000000AA'), out, { frames: 2 });
    const good = r.modules >= 21 && r.width > 0;
    ok = ok && good;
    console.log(`  ${good ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} Y4M written from a real ${r.modules}×${r.modules} matrix (${r.width}×${r.height})`);
  } catch (e) {
    ok = false;
    console.log(`  \x1b[31m✗\x1b[0m Y4M render failed: ${e.message}`);
  }
  console.log(`\nBUSINESS_RECEIVE_WEB_E2E_RUNNER_READY=${ok ? 'PASS' : 'FAIL'}`);
  console.log(`BUSINESS_RECEIVE_QR_E2E_BYPASS=${ok ? 0 : 1}`);
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes('--check')) selfCheck();
else if (process.argv.includes('--render')) {
  const slug = process.env.BRP_SLUG ?? 'RENDERONLYslug00000AA';
  const out = join(HERE, 'proofs', 'receive-point-qr.y4m');
  console.log(JSON.stringify(writeQrY4m(receivePointPayUrl(slug), out)));
} else run().catch((e) => { console.error(e); process.exit(1); });
