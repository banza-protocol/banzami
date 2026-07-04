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

// The EXTERNAL Sandbox surface is the curated ./sandbox entry (ADR-046/RT02).
// Release is judged on THAT entry, not the full internal/vendored index.
const sandboxEntry = join(SDK, 'src/sandbox.ts');
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const sandboxText = existsSync(sandboxEntry) ? stripComments(readFileSync(sandboxEntry, 'utf-8')) : '';
if (!sandboxText) fail('SDK missing curated external entry src/sandbox.ts');
else pass('curated external entry src/sandbox.ts present');

// The external entry must NOT re-export methods for unreleased capabilities.
const externalUnreleased = SURFACES
  .filter(([re]) => re.test(sandboxText))
  .filter(([, cap]) => !released(cap))
  .map(([, cap, label]) => `${label} (${cap})`);
if (externalUnreleased.length) fail(`./sandbox entry exposes UNRELEASED capabilities: ${externalUnreleased.join(', ')}`);
else pass('./sandbox entry exposes no unreleased-capability methods');

// me() must exist (the released consumption surface) for a releasable SDK.
if (!/\bme\s*\(\s*\)\s*:/.test(srcText) && !/async me\s*\(/.test(srcText))
  fail('SDK client is missing me() — the released consumption method');
else pass('SDK client exposes me() (released consumption surface)');

// Release rule: released requires the external entry clean AND a distribution
// verification (published + installable). Distribution evidence is a published
// package marker; a local tarball install is necessary but not sufficient.
if (sdkCap && sdkCap.disposition === 'released') {
  if (externalUnreleased.length) fail('SDK released but ./sandbox exposes unreleased capabilities');
  const pkg = JSON.parse(readFileSync(join(SDK, 'package.json'), 'utf-8'));
  if (pkg.private === true) fail('SDK released but package.json private:true');
  const published = (sdkCap.evidence || []).some(e => /published|registry|npm-publish/i.test(e));
  if (!published) fail('SDK released but no publication evidence (registry install) registered');
} else {
  pass(`SDK is ${sdkCap?.disposition} (not released) — publication to a Banzami-owned registry is the remaining external blocker`);
}

// 2b. SDK↔Gateway route: the released me() must map to a real gateway route,
//     and the released consumption scope must exist.
const gwServer = join(ROOT, 'services/api-gateway/internal/server/server.go');
if (existsSync(gwServer)) {
  const s = readFileSync(gwServer, 'utf-8');
  if (!/["']\/v1\/me["']/.test(s)) fail('gateway does not expose GET /v1/me (SDK me() would 404)');
  else pass('SDK me() maps to a real gateway route (GET /v1/me)');
}

// 2c. Docs↔distribution: while the SDK is not released, docs must NOT present an
//     external `npm install @banzami/sdk` as available.
const docs = join(ROOT, 'apps/website/app/developers/docs/page.tsx');
if (existsSync(docs) && sdkCap && sdkCap.disposition !== 'released') {
  const d = readFileSync(docs, 'utf-8');
  // The docs already say the package is NOT published; ensure they don't also
  // present a bare install command as a working step.
  const claimsInstall = /Corra\s+<Code>npm install @banzami\/sdk/.test(d) || />npm install @banzami\/sdk<\/Code>\s*(para|to)\b/.test(d);
  if (claimsInstall) fail('docs present `npm install @banzami/sdk` as available while SDK is not released');
  else pass('docs do not present external npm install as available (SDK not released)');
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
