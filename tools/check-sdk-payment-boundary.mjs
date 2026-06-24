#!/usr/bin/env node
/**
 * check-sdk-payment-boundary.mjs
 *
 * Enforces the architecture rule from
 * docs/adr/SDK_PAYMENT_SOURCE_OF_TRUTH.md:
 *
 *   The Flutter SDK (sdk/flutter, package banzami_flutter) is the single,
 *   autonomous source of truth for ALL payment flows. No app may re-implement
 *   a payment screen or payment-flow logic.
 *
 * Fails (exit 1) if:
 *   1. apps/mobile defines a payment / link / receipt / confirm / checkout /
 *      split-pay screen (instead of using the SDK).
 *   2. apps/mobile imports an internal SDK file (not the public barrel).
 *   3. sdk/flutter imports apps/mobile (banzami_mobile).
 *   4. a Receipt screen is defined outside the SDK.
 *   5. the payment-link resolver is defined outside the SDK.
 *   6. CheckoutScreen (decided removed) is still present or exported.
 *
 * Usage:
 *   node tools/check-sdk-payment-boundary.mjs
 *   make check-sdk-payment-boundary
 *
 * Exit codes:
 *   0 — all checks pass
 *   1 — one or more checks failed
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, relative, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

let failures = 0;
let passes   = 0;

const RESET = '\x1b[0m';
const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const BOLD  = '\x1b[1m';
const CYAN  = '\x1b[36m';

const pass    = (m) => { console.log(`  ${GREEN}✓${RESET}  ${m}`); passes++; };
const fail    = (m) => { console.error(`  ${RED}✗${RESET}  ${m}`); failures++; };
const section = (t) => console.log(`\n${BOLD}${CYAN}${t}${RESET}`);

const APP = join(ROOT, 'apps/mobile/lib');
const SDK = join(ROOT, 'sdk/flutter/lib');

/** Recursively list every .dart file under `dir`. */
function dartFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...dartFiles(p));
    else if (name.endsWith('.dart')) out.push(p);
  }
  return out;
}

const rel = (p) => relative(ROOT, p);

// ---------------------------------------------------------------------------
section('1 · No payment-flow screen defined in apps/mobile');

// Payment-flow source files that must NOT exist under apps/mobile.
const FORBIDDEN_APP_FILES = [
  'link_pay_screen.dart',
  'payment_link_screen.dart',
  'receipt_screen.dart',
  'confirm_screen.dart',
  'checkout_screen.dart',
  'split_pay_screen.dart',
  'payment_request_screen.dart', // singular — the merchant "payment_requests_screen.dart" (plural list) is allowed
];

// Payment-flow widget classes that must NOT be declared under apps/mobile.
// Specific to avoid false positives on merchant list screens (e.g.
// PaymentRequestsScreen — a list, not the payment confirm/receipt).
const FORBIDDEN_APP_CLASSES = [
  /\bclass\s+\w*ReceiptScreen\b/,
  /\bclass\s+\w*PaymentLinkScreen\b/,
  /\bclass\s+LinkPayScreen\b/,
  /\bclass\s+\w*CheckoutScreen\b/,
  /\bclass\s+\w*SplitPayScreen\b/,
];

const appFiles = dartFiles(APP);
let appScreenViolations = 0;

for (const f of appFiles) {
  if (FORBIDDEN_APP_FILES.includes(basename(f))) {
    fail(`forbidden payment screen file in app: ${rel(f)} — move it to sdk/flutter`);
    appScreenViolations++;
  }
}
for (const f of appFiles) {
  const src = readFileSync(f, 'utf8');
  for (const re of FORBIDDEN_APP_CLASSES) {
    if (re.test(src)) {
      fail(`forbidden payment screen class ${re} declared in ${rel(f)}`);
      appScreenViolations++;
    }
  }
}
if (appScreenViolations === 0) {
  pass('apps/mobile declares no payment confirm/receipt/link/checkout/split-pay screen');
}

// ---------------------------------------------------------------------------
section('2 · apps/mobile imports the SDK only via the public barrel');

let internalImports = 0;
const INTERNAL_IMPORT =
  /import\s+'package:banzami_flutter\/(?!banzami_flutter\.dart)[^']+'/g;
for (const f of appFiles) {
  const src = readFileSync(f, 'utf8');
  const m = src.match(INTERNAL_IMPORT);
  if (m) {
    for (const imp of m) fail(`internal SDK import in ${rel(f)}: ${imp}`);
    internalImports += m.length;
  }
}
if (internalImports === 0) {
  pass("apps/mobile imports only 'package:banzami_flutter/banzami_flutter.dart'");
}

// ---------------------------------------------------------------------------
section('3 · sdk/flutter is autonomous (never imports the app)');

let sdkOnApp = 0;
const sdkFiles = dartFiles(SDK);
for (const f of sdkFiles) {
  const src = readFileSync(f, 'utf8');
  if (/import\s+'package:banzami_mobile\/|apps\/mobile/.test(src)) {
    fail(`sdk/flutter imports the app: ${rel(f)}`);
    sdkOnApp++;
  }
}
if (sdkOnApp === 0) pass('sdk/flutter never imports apps/mobile (banzami_mobile)');

// ---------------------------------------------------------------------------
section('4 · The Receipt is defined exactly once, in the SDK');

const receiptPath = join(SDK, 'screens/receipt_screen.dart');
const receiptOk =
  existsSync(receiptPath) &&
  /\bclass\s+BanzamiReceiptScreen\b/.test(readFileSync(receiptPath, 'utf8'));
if (receiptOk) pass('BanzamiReceiptScreen defined in sdk/flutter/lib/screens/receipt_screen.dart');
else fail('BanzamiReceiptScreen must be defined in sdk/flutter/lib/screens/receipt_screen.dart');

// ---------------------------------------------------------------------------
section('5 · The payment-link resolver lives in the SDK');

const linkPath = join(SDK, 'screens/payment_link_screen.dart');
const linkOk =
  existsSync(linkPath) &&
  /\bclass\s+BanzamiPaymentLinkScreen\b/.test(readFileSync(linkPath, 'utf8'));
if (linkOk) pass('BanzamiPaymentLinkScreen defined in sdk/flutter/lib/screens/payment_link_screen.dart');
else fail('payment-link resolver must be BanzamiPaymentLinkScreen in sdk/flutter/lib/screens/payment_link_screen.dart');

// ---------------------------------------------------------------------------
section('6 · Dead CheckoutScreen removed (file + export)');

const checkoutFile = join(SDK, 'screens/checkout_screen.dart');
const barrel = join(SDK, 'banzami_flutter.dart');
const barrelSrc = existsSync(barrel) ? readFileSync(barrel, 'utf8') : '';
if (existsSync(checkoutFile)) fail('sdk/flutter/lib/screens/checkout_screen.dart still exists — remove it');
else if (/checkout_screen\.dart/.test(barrelSrc)) fail("checkout_screen.dart is still exported from banzami_flutter.dart");
else pass('CheckoutScreen file and export are gone');

// ---------------------------------------------------------------------------
console.log(
  `\n${BOLD}${failures === 0 ? GREEN : RED}` +
  `${passes} passed, ${failures} failed${RESET}`
);
process.exit(failures === 0 ? 0 : 1);
