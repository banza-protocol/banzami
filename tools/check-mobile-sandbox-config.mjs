#!/usr/bin/env node
/**
 * check-mobile-sandbox-config.mjs
 *
 * Static config-isolation guard for the Banzami Flutter apps (apps/mobile).
 * This is NECESSARY but NOT SUFFICIENT for a mobile launch — the full proof
 * must run on the built iOS Simulator artifact (see docs/quality/
 * MOBILE_E2E_REQUIREMENTS.md and the make assure-mobile-* targets). This guard
 * catches the config-level regressions cheaply and runs in CI.
 *
 * Fails if, in the mobile source/config:
 *   1. any bz_live_ / real secret / service credential / webhook secret appears
 *      as a literal (Firebase CLIENT config keys are allowlisted — they ship in
 *      app binaries by design);
 *   2. the sandbox environment can resolve to a production/base host without the
 *      sandbox override (i.e. the sandbox flavor's documented dart-define is not
 *      the sandbox host);
 *   3. a localhost / private-IP / docker / core-route host is compiled as a
 *      default (dev-only 192.168 in README examples is fine; source defaults
 *      must be public hosts);
 *   4. a token is written to plain SharedPreferences/UserDefaults instead of
 *      flutter_secure_storage (heuristic).
 *
 * Usage: node tools/check-mobile-sandbox-config.mjs   (make check-mobile-config)
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const MOBILE = join(ROOT, 'apps/mobile');
let failures = 0;
const fail = m => { console.error(`  ✗ ${m}`); failures++; };
const pass = m => console.log(`  ✓ ${m}`);

if (!existsSync(MOBILE)) { console.log('apps/mobile absent — skipping'); process.exit(0); }

// Recursively collect Dart + iOS/Android config files (skip build artifacts).
function collect(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['build', '.dart_tool', 'Pods', 'ephemeral', '.symlinks'].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) collect(p, acc);
    else if (/\.(dart|xcconfig|plist|json|entitlements)$/.test(e.name)) acc.push(p);
  }
  return acc;
}
const files = collect(MOBILE);

// 1. Secret literals (Firebase client keys allowlisted).
const SECRET_RE = /(bz_live_[A-Za-z0-9]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|BANZA_WEBHOOK_SECRET\s*=\s*['"][^'"]+|service_account|client_secret)/;
let secretHit = false;
for (const f of files) {
  const src = readFileSync(f, 'utf-8');
  if (SECRET_RE.test(src)) {
    // allow Firebase google-services / GoogleService-Info (client config)
    if (/google-services\.json|GoogleService-Info\.plist/.test(f)) continue;
    fail(`possible secret literal in ${f.replace(ROOT + '/', '')}`); secretHit = true;
  }
}
if (!secretHit) pass('no live-key/secret/credential literals in mobile source');

// 2/3. Host defaults must be public banzami hosts; the sandbox override must be
//      the sandbox host. Inspect lib/config.dart + merchant/config.dart.
for (const rel of ['lib/config.dart', 'lib/merchant/config.dart']) {
  const p = join(MOBILE, rel);
  if (!existsSync(p)) continue;
  const src = readFileSync(p, 'utf-8');
  const hosts = [...src.matchAll(/https?:\/\/([a-zA-Z0-9.\-]+)(?::\d+)?/g)].map(m => m[1]);
  const bad = hosts.filter(h => /localhost|127\.0\.0\.1|(^| )10\.|(^| )172\.|192\.168\.|core-api|:8081|:8083/.test(h));
  if (bad.length) fail(`${rel}: non-public host default(s): ${[...new Set(bad)].join(', ')}`);
}
// Consumer uses a dedicated sandbox HOST; merchant uses an overridable
// GATEWAY_URL + key-prefix (bz_test) env detection. Both must be able to reach
// the deployed sandbox without a code change.
const consumerCfg = join(MOBILE, 'lib/config.dart');
if (existsSync(consumerCfg) && !readFileSync(consumerCfg, 'utf-8').includes('sandbox-api.banzami.com'))
  fail('lib/config.dart: consumer sandbox host (sandbox-api.banzami.com) not referenced');
const merchCfg = join(MOBILE, 'lib/merchant/config.dart');
if (existsSync(merchCfg) && !/String\.fromEnvironment\(\s*['"]GATEWAY_URL/.test(readFileSync(merchCfg, 'utf-8')))
  fail('lib/merchant/config.dart: GATEWAY_URL is not overridable via dart-define (cannot target a sandbox gateway)');
if (failures === 0) pass('config hosts are public; consumer has sandbox host, merchant gateway is overridable');

// 4. Token storage heuristic — tokens must use secure storage.
const cfg = ['lib/services/session_service.dart', 'lib/merchant/services/merchant_session_service.dart'];
for (const rel of cfg) {
  const p = join(MOBILE, rel);
  if (!existsSync(p)) continue;
  const src = readFileSync(p, 'utf-8');
  if (!/FlutterSecureStorage|flutter_secure_storage/.test(src))
    fail(`${rel}: session store does not use FlutterSecureStorage`);
  if (/SharedPreferences[\s\S]{0,120}(token|jwt|api_key)/i.test(src))
    fail(`${rel}: token/key may be written to SharedPreferences (use secure storage)`);
}
if (failures === 0) pass('tokens stored via flutter_secure_storage (no plain prefs)');

console.log(failures ? `\n✗ Mobile sandbox-config check FAILED (${failures})` : '\n✓ Mobile sandbox-config check passed (static — full proof requires iOS Simulator E2E)');
process.exit(failures ? 1 : 0);
