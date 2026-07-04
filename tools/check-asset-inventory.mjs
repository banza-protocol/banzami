#!/usr/bin/env node
/**
 * check-asset-inventory.mjs
 *
 * Cleanup/inventory assurance gate for ops/asset-inventory.yaml. Uses the same
 * dependency-free strict-YAML reader as the assurance manifest is NOT needed
 * here — this is a lightweight lexical check because the inventory is prose-ish
 * YAML. It fails when:
 *
 *   1. any `lifecycle:` value is not one of the allowed states;
 *   2. any asset is still `obsolete-candidate` (must be removed or reclassified
 *      before the launch gate — no "candidate for cleanup" at the final gate);
 *   3. the secret-hygiene guard trips (an obvious secret-looking token appears).
 *
 * Usage: node tools/check-asset-inventory.mjs   (make assure-inventory)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const PATH = 'ops/asset-inventory.yaml';
const ALLOWED = ['active-required', 'active-needs-remediation', 'legacy-compat-justified', 'obsolete-candidate', 'removed'];

let failures = 0;
const fail = m => { console.error(`  ✗ ${m}`); failures++; };
const pass = m => console.log(`  ✓ ${m}`);

const raw = readFileSync(resolve(ROOT, PATH), 'utf-8');
const lines = raw.split('\n');

let lifecycleCount = 0;
let obsolete = [];
lines.forEach((line, i) => {
  const m = line.match(/lifecycle:\s*([a-z-]+)/);
  if (m) {
    lifecycleCount++;
    if (!ALLOWED.includes(m[1])) fail(`line ${i + 1}: invalid lifecycle "${m[1]}"`);
    if (m[1] === 'obsolete-candidate') obsolete.push(i + 1);
  }
});

if (lifecycleCount === 0) fail('no lifecycle entries found — inventory looks empty');
else pass(`${lifecycleCount} lifecycle entries, all valid states`);

// Release-blocking: obsolete-candidate must not survive to the gate. This is a
// warning by default and a hard failure under --release.
const RELEASE = process.argv.includes('--release');
if (obsolete.length) {
  const msg = `obsolete-candidate assets remain at lines ${obsolete.join(', ')} — remove or reclassify with evidence`;
  if (RELEASE) fail(msg); else console.log(`  ⚠ ${msg}`);
} else pass('no obsolete-candidate assets remain');

// Secret-hygiene guard: the inventory must never contain a real secret.
const SECRET_RE = /(sk_live_[A-Za-z0-9]{8,}|bz_live_[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16})/;
if (SECRET_RE.test(raw)) fail('a secret-looking token appears in the inventory — inventory must be secret-free');
else pass('no secret-looking tokens in inventory');

console.log(failures ? `\n✗ Asset inventory check FAILED (${failures})` : '\n✓ Asset inventory check passed');
process.exit(failures ? 1 : 0);
