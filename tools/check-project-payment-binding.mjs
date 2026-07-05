#!/usr/bin/env node
/**
 * check-project-payment-binding.mjs — Release Train 04C dedicated gate
 * (make assure-project-payment-binding).
 *
 * Verifies the ADR-047 payment-binding controls that must exist BEFORE a
 * controlled deployment, and then requires the full deployed Sandbox E2E
 * evidence before it can pass. It fails closed (HOLD) until every condition
 * holds — build-level controls AND registered deployed evidence.
 *
 * Static (build-level) checks it enforces now:
 *   - migration 0100 present;
 *   - drift authority covers public + developer + account_identity;
 *   - manifest registers the binding table + the one-ACTIVE partial unique index;
 *   - Core validate-payee uses the DEDICATED least-privilege credential;
 *   - deploy-vs-release control present (payment scopes gated);
 *   - single-authority immutability: NO rebind/disable endpoint exists.
 *
 * Evidence checks (HOLD until the deployed E2E runs):
 *   - a registered deployed-E2E evidence artifact under
 *     evidence/assurance/payment-binding/;
 *   - the three capabilities marked released in the manifest.
 *
 * Usage: node tools/check-project-payment-binding.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { parseManifest } from './assurance-manifest-lib.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
let failures = 0;
const fail = m => { console.error(`  ✗ ${m}`); failures++; };
const pass = m => console.log(`  ✓ ${m}`);
const read = p => { try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return ''; } };

console.log('── build-level controls (ADR-047 / RT04C §1–§3) ──');

// Migration + drift authority.
existsSync(join(ROOT, 'db/migrations/0100_dev_project_sandbox_binding.sql'))
  ? pass('migration 0100 present')
  : fail('migration 0100_dev_project_sandbox_binding.sql missing');

const introspect = read('tools/introspect-schema.sql');
introspect.includes("'developer'") && introspect.includes("'account_identity'")
  ? pass('drift authority covers developer.* + account_identity.*')
  : fail('introspect-schema.sql does not cover developer.* + account_identity.*');

const manifest = read('tools/schema-manifest.json');
manifest.includes('developer.dev_project_sandbox_binding') &&
manifest.includes('dev_project_sandbox_binding_one_active')
  ? pass('manifest registers the binding table + one-ACTIVE index')
  : fail('manifest does not register the binding table + one-ACTIVE index');

// Least-privilege Core credential (§3).
read('core/api/src/main.rs').includes('CORE_PAYEE_VALIDATION_KEY')
  ? pass('Core validate-payee bound to the dedicated least-privilege credential')
  : fail('Core validate-payee not bound to a dedicated credential');

// Deploy-vs-release control (§1).
const svc = read('services/developer-api/internal/developer/service.go');
svc.includes('PaymentScopes') && svc.includes('paymentReleased')
  ? pass('deploy-vs-release control present (payment scopes gated)')
  : fail('deploy-vs-release control missing');

// Single-authority immutability (§2): no rebind/disable endpoint in this release.
const handlers = read('services/developer-api/internal/developer/handlers.go');
/rebind|binding.*disable|disable.*binding/i.test(handlers)
  ? fail('a rebind/disable binding endpoint exists — immutability decision (RT04C §2) is that none should')
  : pass('immutability: no rebind/disable binding endpoint (bindings immutable this release)');

console.log('\n── deployed E2E evidence (§6/§7) ──');

// Deployed E2E evidence artifact.
const evDir = join(ROOT, 'evidence/assurance/payment-binding');
const hasE2E = existsSync(evDir) &&
  readdirSync(evDir).some(f => /payment-binding-e2e-.*\.json/.test(f));
hasE2E
  ? pass('deployed Sandbox payment-binding E2E evidence registered')
  : fail('deployed Sandbox payment-binding E2E evidence missing — HOLD (controlled deployment + full matrix not yet run)');

// Capabilities released.
const { capabilities } = parseManifest(ROOT);
for (const id of ['CAP-PAY-001', 'CAP-PAY-002', 'CAP-APP-004']) {
  const c = capabilities.find(x => x.id === id);
  if (!c) { fail(`${id} missing from manifest`); continue; }
  c.disposition === 'released'
    ? pass(`${id} released`)
    : fail(`${id} not released (disposition=${c.disposition}) — HOLD`);
}

if (failures) {
  console.log(`\n✗ assure-project-payment-binding: HOLD (${failures} check(s) failed)`);
  process.exit(1);
}
console.log('\n✓ assure-project-payment-binding: GO (controls + deployed E2E evidence + released)');
