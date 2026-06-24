#!/usr/bin/env node
// Guard: the iOS AASA and Android assetlinks app/bundle ids MUST match the
// real Banzami mobile app id `com.banzami.consumer`. A regression to the
// historical typo `com.banza.consumer` silently breaks Universal Links /
// App Links (iOS/Android won't associate the app with pay.banzami.com).
//
// Dependency-free; run with:  node tools/check-aasa-appid.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED = 'com.banzami.consumer';
const FORBIDDEN = 'com.banza.consumer'; // the typo — NOT a substring of EXPECTED

const targets = [
  'apps/pay/app/.well-known/apple-app-site-association/route.ts',
  'apps/pay/app/.well-known/assetlinks.json/route.ts',
];

let failed = false;
for (const rel of targets) {
  const body = readFileSync(join(root, rel), 'utf8');
  if (body.includes(FORBIDDEN)) {
    console.error(`✗ ${rel}: contains forbidden app id "${FORBIDDEN}" (should be "${EXPECTED}")`);
    failed = true;
  }
  if (!body.includes(EXPECTED)) {
    console.error(`✗ ${rel}: missing expected app id "${EXPECTED}"`);
    failed = true;
  }
  if (!failed) console.log(`✓ ${rel}: app id ${EXPECTED}`);
}

if (failed) {
  console.error('\nAASA/assetlinks app id check FAILED.');
  process.exit(1);
}
console.log('\nAASA/assetlinks app id check passed.');
