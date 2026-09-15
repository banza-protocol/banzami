#!/usr/bin/env node
// Header design-system guard (ACCOUNT-ONBOARDING-NAME-001 §78).
//
// The canonical page title is ONE style — BanzamiTextStyles.pageTitle — and it
// is rendered ONLY through the shared AppScreenHeader. This guard fails if any
// screen inlines the page-title token directly (the drift class we just closed:
// per-screen hand-rolled titles). It is deliberately narrow — it does not try
// to police every font size, only the one canonical title token — so it stays
// robust and does not block legitimate typography.
//
// Run: node tools/check-consumer-headers.mjs   (wired into `make check-*`)

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

// The ONLY file allowed to reference the canonical page-title token.
const OWNER = 'sdk/flutter/lib/widgets/app_screen_header.dart';

// Where Consumer/Merchant Flutter UI lives.
const SCAN_DIRS = [
  'sdk/flutter/lib',
  'apps/mobile/lib',
];

const TOKEN = /BanzamiTextStyles\.pageTitle\b/;

function walk(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(join(ROOT, dir)); } catch { return out; }
  for (const e of entries) {
    const rel = join(dir, e);
    const full = join(ROOT, rel);
    if (statSync(full).isDirectory()) out.push(...walk(rel));
    else if (e.endsWith('.dart')) out.push(rel);
  }
  return out;
}

const offenders = [];
for (const dir of SCAN_DIRS) {
  for (const rel of walk(dir)) {
    if (rel === OWNER) continue;
    const src = readFileSync(join(ROOT, rel), 'utf8');
    src.split('\n').forEach((line, i) => {
      if (TOKEN.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
}

if (offenders.length > 0) {
  console.error('✗ Page-title drift: BanzamiTextStyles.pageTitle must only be');
  console.error(`  used inside ${OWNER} — render page titles via AppScreenHeader,`);
  console.error('  never by inlining the token in a screen.\n');
  offenders.forEach((o) => console.error('  ' + o));
  process.exit(1);
}

console.log('✓ Consumer header guard: page title is rendered only via AppScreenHeader.');
