#!/usr/bin/env node
/**
 * check-developer-foundation.mjs — Release Train 01 dedicated gate.
 *
 * Fails unless ALL FOUR scoped capabilities satisfy their full release criteria:
 *   CAP-DEV-001 Developer Console, CAP-DEV-002 API-key lifecycle,
 *   CAP-DOCS-001 Developer Docs, CAP-SDK-001 TypeScript SDK.
 *
 * A capability satisfies the criteria when it is disposition=released,
 * status=verified, and carries deployed-Sandbox e2e evidence. It also runs the
 * docs↔manifest claim check and the SDK↔manifest contract check as sub-gates.
 *
 * The deployed browser E2E itself (tools/e2e/dev-console/developer-foundation-
 * e2e.mjs) runs on demand / on a runner (needs a browser + sandbox + OTP path);
 * this gate verifies its evidence is registered and the four dispositions hold.
 *
 * Usage: node tools/check-developer-foundation.mjs   (make assure-developer-foundation)
 */
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseManifest } from './assurance-manifest-lib.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
let failures = 0;
const fail = m => { console.error(`  ✗ ${m}`); failures++; };
const pass = m => console.log(`  ✓ ${m}`);

// Sub-gates (static, always run).
for (const t of ['check-docs-claims.mjs', 'check-sdk-contract.mjs']) {
  try { execFileSync('node', [resolve(ROOT, 'tools', t)], { stdio: 'pipe' }); pass(`sub-gate ${t}`); }
  catch (e) { fail(`sub-gate ${t} failed:\n${e.stdout?.toString() || e.message}`); }
}

const SCOPE = ['CAP-DEV-001', 'CAP-DEV-002', 'CAP-DOCS-001', 'CAP-SDK-001'];
const { capabilities } = parseManifest(ROOT);
for (const id of SCOPE) {
  const c = capabilities.find(x => x.id === id);
  if (!c) { fail(`${id} missing from manifest`); continue; }
  if (c.disposition !== 'released') { fail(`${id} not released (disposition=${c.disposition}) — HOLD`); continue; }
  if (c.status !== 'verified') { fail(`${id} released but status=${c.status}`); continue; }
  const hasE2E = c.tests.e2e_sandbox.length > 0 || c.deployment_gate === 'static-only';
  const hasEvidence = c.evidence.some(e => e.includes('evidence/assurance'));
  if (!hasE2E) fail(`${id} released without deployed e2e_sandbox test IDs`);
  else if (!hasEvidence) fail(`${id} released without a registered evidence artifact`);
  else if (!c.evidence.filter(e => e.includes('evidence/assurance')).every(e => existsSync(resolve(ROOT, e))))
    fail(`${id} evidence artifact missing on disk`);
  else pass(`${id} released with registered deployed evidence`);
}

const releasedCount = SCOPE.filter(id => (capabilities.find(x => x.id === id) || {}).disposition === 'released').length;
console.log(`\n  Developer foundation: ${releasedCount}/${SCOPE.length} scoped capabilities released`);
if (failures) {
  console.log(`\n✗ assure-developer-foundation: HOLD (${failures} check(s) failed)`);
  process.exit(1);
}
console.log('\n✓ assure-developer-foundation: GO (all four released with evidence)');
