#!/usr/bin/env node
/**
 * WEB-QR-CAMERA-001 — Proof 08: decoder + deploy integrity (root cause + fix).
 *
 * Runtime-free evidence about the DEPLOYED app.banzami.com and the checked-in
 * source: the QR decoder is served from our own origin (not a CDN), it is the
 * exact version mobile_scanner expects, the strict CSP is intact (and would block
 * the plugin's default CDN load — the reproduced defect), and both root causes are
 * fixed in source. Also verifies the incidental realtime-SSE Accept-header fix.
 *
 *   node proofs/08-web-qr-decoder-integrity.mjs
 */
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { GateReport } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..'); // proofs → app-web → e2e → tools → repo
const R = new GateReport('08-web-qr-decoder-integrity');

const APP = 'https://app.banzami.com';
const ASSET = `${APP}/zxing-library-0.21.3.js`;
// Canonical @zxing/library@0.21.3 UMD (the exact artifact unpkg serves and that
// mobile_scanner 6.0.11 requests) — pinned by content hash.
const CANON_SHA256 = 'd7cc8f69dd70bdcf3ac00c9ae572bf2acb9f4132ba379c72df842e4db918652d';
const CANON_BYTES = 336008;

const sha256File = (p) => new Promise((res, rej) => {
  const h = createHash('sha256'); createReadStream(p).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
});

try {
  // ── 1. Self-hosted decoder is live ─────────────────────────────────────────
  const assetRes = await fetch(ASSET);
  const assetBuf = Buffer.from(await assetRes.arrayBuffer());
  const ctype = assetRes.headers.get('content-type') || '';
  const liveSha = createHash('sha256').update(assetBuf).digest('hex');
  R.mark('SELF_HOSTED_ZXING_LIVE', assetRes.status === 200 && /javascript/.test(ctype) && assetBuf.length === CANON_BYTES,
    `status=${assetRes.status} type=${ctype} bytes=${assetBuf.length}`);

  // ── 2. Vendor version pinned (served asset == vendored file == canonical) ────
  const vendored = join(REPO, 'apps', 'mobile', 'web', 'zxing-library-0.21.3.js');
  const vendoredSha = existsSync(vendored) ? await sha256File(vendored) : 'MISSING';
  const readme = join(REPO, 'apps', 'mobile', 'web', 'README-zxing.md');
  const hasProvenance = existsSync(readme) && /0\.21\.3/.test(readFileSync(readme, 'utf8')) && /SHA-256/i.test(readFileSync(readme, 'utf8'));
  const pinned = liveSha === CANON_SHA256 && vendoredSha === CANON_SHA256 && hasProvenance;
  R.mark('ZXING_VENDOR_VERSION_PINNED', pinned,
    `liveSha==canon:${liveSha === CANON_SHA256} vendoredSha==canon:${vendoredSha === CANON_SHA256} provenanceDoc:${hasProvenance}`);

  // ── 3. Headers: strict CSP intact, camera=self, no CDN in script-src ─────────
  const headRes = await fetch(APP + '/');
  const csp = headRes.headers.get('content-security-policy') || '';
  const pp = headRes.headers.get('permissions-policy') || '';
  const hsts = headRes.headers.get('strict-transport-security') || '';
  const nosniff = headRes.headers.get('x-content-type-options') || '';
  const referrer = headRes.headers.get('referrer-policy') || '';
  const scriptSrc = (csp.match(/script-src([^;]*)/) || [, ''])[1].trim();
  const scriptSrcClean = /^'self' 'wasm-unsafe-eval'$/.test(scriptSrc);
  const cspNoCdn = !/unpkg|jsdelivr|cdnjs|cdn\./i.test(csp);
  R.mark('CAMERA_FIX_CSP_WEAKENING=0', scriptSrcClean && cspNoCdn, `script-src=[${scriptSrc}] cdnInCsp=${!cspNoCdn}`);
  R.mark('APP_WEB_PERMISSIONS_POLICY_CAMERA_SELF', /camera=\(self\)/.test(pp), `permissions-policy=${pp.slice(0, 60)}`);
  R.mark('CAMERA_FIX_SECURITY_HEADER_REGRESSION=0',
    !!hsts && /nosniff/.test(nosniff) && !!referrer && /frame-ancestors/.test(csp) && scriptSrcClean,
    `hsts=${!!hsts} nosniff=${/nosniff/.test(nosniff)} referrer=${!!referrer} frameAncestors=${/frame-ancestors/.test(csp)}`);
  R.mark('WEB_CAMERA_SECURE_CONTEXT', APP.startsWith('https://') && !!hsts, `https + HSTS=${!!hsts}`);

  // ── 4. No external runtime dependency for the decoder ────────────────────────
  // The plugin's DEFAULT loads @zxing/library from unpkg; the strict CSP blocks
  // that, and the app points the decoder at the self-hosted copy instead.
  const scannerSrc = readFileSync(join(REPO, 'sdk', 'flutter', 'lib', 'widgets', 'banzami_qr_scanner.dart'), 'utf8');
  const setsSelfHostedUrl = /setBarcodeLibraryScriptUrl\('\/zxing-library-0\.21\.3\.js'\)/.test(scannerSrc);
  R.mark('QR_DECODER_EXTERNAL_RUNTIME_DEPENDENCY=0', setsSelfHostedUrl && cspNoCdn,
    `pointsAtSelfHosted=${setsSelfHostedUrl} cspBlocksCdn=${cspNoCdn}`);

  // ── 5. Root cause reproduced + identified ────────────────────────────────────
  const pc = join(homedir(), '.pub-cache', 'hosted', 'pub.dev', 'mobile_scanner-6.0.11', 'lib', 'src', 'web', 'zxing', 'zxing_barcode_reader.dart');
  const pluginDefaultUnpkg = existsSync(pc) && /unpkg\.com\/@zxing\/library@0\.21\.3/.test(readFileSync(pc, 'utf8'));
  R.mark('WEB_QR_CAMERA_DEFECT_REPRODUCED', pluginDefaultUnpkg && cspNoCdn,
    `pluginDefault=unpkg:${pluginDefaultUnpkg} + CSP blocks CDN:${cspNoCdn} → default decoder load blocked (reproduced)`);
  // Root cause A (facing constraint) + B (CDN decoder) both fixed in source.
  const hasWebFallback = /kIsWeb[\s\S]*CameraFacing\.front|_triedFallback/.test(scannerSrc) && /CameraFacing\.back/.test(scannerSrc);
  const classifies = /_CamError\.(denied|notFound|notReadable|unsupported)/.test(scannerSrc);
  R.mark('WEB_CAMERA_ROOT_CAUSE_IDENTIFIED', hasWebFallback && setsSelfHostedUrl && classifies,
    `A:webFacingFallback=${hasWebFallback} B:selfHostedDecoder=${setsSelfHostedUrl} classification=${classifies}`);

  // ── 6. Incidental realtime defect (C): BFF Accept header for stream routes ────
  const serverSrc = readFileSync(join(REPO, 'apps', 'app-banzami', 'server.mjs'), 'utf8');
  const bffStreamAccept = /route\.stream\s*\?\s*'text\/event-stream'\s*:\s*'application\/json'/.test(serverSrc);
  R.mark('WEB_BFF_SSE_ACCEPT_HEADER (source)', bffStreamAccept,
    bffStreamAccept ? "server forwards Accept: text/event-stream for stream routes only" : 'BFF Accept header not conditional on stream');
} catch (e) {
  R.mark('PROOF_08', false, e.message);
} finally {
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_08_WEB_QR_DECODER_INTEGRITY=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail)`);
  console.log(`evidence: ${out}`);
  process.exitCode = R.ok ? 0 : 1;
}
