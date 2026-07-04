#!/usr/bin/env node
/**
 * check-payments-foundation.mjs — Release Train 03 dedicated gate.
 *
 * Fails unless ALL of the scoped payment capabilities are released with deployed
 * evidence AND the §1 developer-key resilience precondition is registered:
 *   CAP-PAY-001 (Payment Sessions), CAP-PAY-002 (Payment Links),
 *   CAP-APP-004 (Pay/Checkout).
 *
 * A capability qualifies when disposition=released, status=verified, and it
 * carries deployed-Sandbox e2e evidence. The §1 precondition is satisfied by a
 * registered dev-key-resilience evidence artifact (fail-closed fault injection).
 *
 * Usage: node tools/check-payments-foundation.mjs   (make assure-payments-foundation)
 */
import { existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { parseManifest } from './assurance-manifest-lib.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
let failures = 0;
const fail = m => { console.error(`  ✗ ${m}`); failures++; };
const pass = m => console.log(`  ✓ ${m}`);

// §1 precondition: developer-key resilience evidence must exist.
const evDir = join(ROOT, 'evidence/assurance/dev-foundation');
const hasResilience = existsSync(evDir) && readdirSync(evDir).some(f => /dev-key-resilience-.*\.json/.test(f));
if (hasResilience) pass('§1 developer-key runtime-resilience evidence registered (fail-closed fault injection)');
else fail('§1 developer-key runtime-resilience evidence missing — precondition not met');

const SCOPE = ['CAP-PAY-001', 'CAP-PAY-002', 'CAP-APP-004'];
const { capabilities } = parseManifest(ROOT);
for (const id of SCOPE) {
  const c = capabilities.find(x => x.id === id);
  if (!c) { fail(`${id} missing from manifest`); continue; }
  if (c.disposition !== 'released') { fail(`${id} not released (disposition=${c.disposition}) — HOLD`); continue; }
  if (c.status !== 'verified') { fail(`${id} released but status=${c.status}`); continue; }
  if (c.tests.e2e_sandbox.length === 0) { fail(`${id} released without deployed e2e_sandbox test IDs`); continue; }
  if (!c.evidence.some(e => e.includes('evidence/assurance'))) { fail(`${id} released without a registered evidence artifact`); continue; }
  pass(`${id} released with registered deployed evidence`);
}

const released = SCOPE.filter(id => (capabilities.find(x => x.id === id) || {}).disposition === 'released').length;
console.log(`\n  Payments foundation: ${released}/${SCOPE.length} scoped capabilities released`);
if (failures) {
  console.log(`\n✗ assure-payments-foundation: HOLD (${failures} check(s) failed)`);
  process.exit(1);
}
console.log('\n✓ assure-payments-foundation: GO (all three released with evidence)');
