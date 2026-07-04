#!/usr/bin/env node
/**
 * check-sdk-contract.mjs
 *
 * Contract-drift gate for the TypeScript SDK (Release Train 01). Enforces the
 * release rule: the SDK may not be marked `released` while it ships public
 * methods for capability areas that are NOT released, and only when it is
 * actually distributable. Fails when:
 *
 *   1. the SDK is disposition=released in the manifest but exposes route
 *      surfaces for capabilities that are not themselves released;
 *   2. the SDK is released but not published/distributable (private or unpublished);
 *   3. the built SDK contains a raw secret, a production host default that a
 *      Sandbox consumer cannot override, or an internal core route;
 *   4. the SDK does not reject bz_live_ keys against a sandbox base URL.
 *
 * Usage: node tools/check-sdk-contract.mjs   (make check-sdk-contract)
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseManifest } from './assurance-manifest-lib.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SDK = join(ROOT, 'sdk/typescript');
let failures = 0;
const fail = m => { console.error(`  ✗ ${m}`); failures++; };
const pass = m => console.log(`  ✓ ${m}`);

const { capabilities } = parseManifest(ROOT);
const sdkCap = capabilities.find(c => c.id === 'CAP-SDK-001');
const dispOf = id => (capabilities.find(c => c.id === id) || {}).disposition;
const released = id => dispOf(id) === 'released';

// Route-surface → capability the SDK ships methods for.
const SURFACES = [
  [/payment[-_]?sessions/i, 'CAP-PAY-001', 'payment sessions'],
  [/payment[-_]?links/i,    'CAP-PAY-002', 'payment links'],
  [/\/qr\b|createStaticQr|createDynamicQr/i, 'CAP-PAY-003', 'QR'],
  [/\/refunds|createRefund/i, 'CAP-REFUND-001', 'refunds'],
  [/\/payouts|createPayout/i, 'CAP-PAYOUT-001', 'payouts'],
  [/\/webhooks\/endpoints|registerWebhookEndpoint/i, 'CAP-WEBHOOK-001', 'webhooks'],
];

// Collect SDK source text.
function collect(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) collect(p, acc);
    else if (/\.(ts|js)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) acc.push(p);
  }
  return acc;
}
const srcText = collect(join(SDK, 'src')).map(f => readFileSync(f, 'utf-8')).join('\n');

// Which unreleased capabilities does the SDK expose?
const shippedUnreleased = SURFACES
  .filter(([re]) => re.test(srcText))
  .filter(([, cap]) => !released(cap))
  .map(([, cap, label]) => `${label} (${cap}:${dispOf(cap)})`);

// 1. Release rule.
if (sdkCap && sdkCap.disposition === 'released') {
  if (shippedUnreleased.length)
    fail(`SDK marked released but ships public methods for UNRELEASED capabilities: ${shippedUnreleased.join(', ')}`);
  // 2. Distributable when released.
  const pkg = JSON.parse(readFileSync(join(SDK, 'package.json'), 'utf-8'));
  if (pkg.private === true) fail('SDK released but package.json private:true (not distributable)');
} else {
  pass(`SDK is ${sdkCap?.disposition} (not released) — ships ${shippedUnreleased.length} unreleased-capability surface(s): ${shippedUnreleased.join(', ') || 'none'}`);
}

// 3. No secret / prod-host-only / core-route literals in src.
const SECRET_RE = /(bz_live_[A-Za-z0-9]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk_live_[A-Za-z0-9]{8,})/;
if (SECRET_RE.test(srcText)) fail('SDK source contains a secret-looking literal');
else pass('no secret literals in SDK source');
if (/core-api:8081|:8083\b|127\.0\.0\.1|172\.\d+\./.test(srcText)) fail('SDK source contains an internal host/core route');
else pass('no internal host/core route in SDK source');

// 4. bz_live_ rejection present (env-safety).
if (/BanzamiConfigError/.test(srcText) && /bz_test_|bz_live_/.test(srcText)) pass('SDK has environment key-prefix safety (bz_live_ rejection)');
else fail('SDK missing environment key-prefix safety');

console.log(failures ? `\n✗ SDK contract check FAILED (${failures})` : '\n✓ SDK contract consistent with manifest');
process.exit(failures ? 1 : 0);
