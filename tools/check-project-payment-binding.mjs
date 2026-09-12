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

// The seal (ADR-055, which superseded RT04C §2's blanket immutability). A binding
// is correctable while it is only a statement of intent and fixed once an artifact
// exists under it, so the thing to check is no longer "no rebind route exists" —
// it is that the route refuses a sealed binding, revalidates the payee, and is not
// reachable without the internal key.
const handlers = read('services/developer-api/internal/developer/handlers.go');
const svcSrc = read('services/developer-api/internal/developer/service.go');
const rebind = svcSrc.slice(svcSrc.indexOf('func (s *Service) RebindProjectSandbox'));
const rebindBody = rebind.slice(0, rebind.indexOf('\nfunc ', 1));

rebindBody && /current\.ArtifactCreated/.test(rebindBody) && /ErrConflict/.test(rebindBody)
  ? pass('the seal holds in the service: a rebind of a SEALED binding is refused')
  : fail('RebindProjectSandbox does not refuse a SEALED binding — ADR-055 §seal');

rebindBody && /ValidatePayee/.test(rebindBody)
  ? pass('a rebind revalidates the payee through Core, exactly as a first bind does')
  : fail('RebindProjectSandbox does not revalidate the payee — a rebind could name a foreign wallet');

/r\.Post\("\/internal\/v1\/projects\/\{projID\}\/binding"/.test(handlers) &&
!/r\.Post\("\/v1\/projects\/\{projID\}\/binding"/.test(handlers)
  ? pass('the binding route is internal-only (no public self-service rebind)')
  : fail('the binding route is publicly mounted — a rebind must stay operator-controlled');

/artifact_created/.test(read('db/migrations/0105_binding_seal_enforcement.sql'))
  ? pass('the seal is also a property of the data (migration 0105 trigger)')
  : fail('no database-level seal — the service guard would be the only defence');

console.log('\n── deployed E2E evidence (§6/§7) ──');

// Deployed E2E evidence artifact.
const evDir = join(ROOT, 'evidence/assurance/payment-binding');
// A registered artifact is not enough: the run it records must have passed. The
// harness writes an artifact whether it passes or fails, precisely so that a
// failing run cannot be registered as if it were a success.
const artifacts = existsSync(evDir)
  ? readdirSync(evDir).filter(f => /^payment-binding-e2e-.*\.json$/.test(f))
  : [];
if (!artifacts.length) {
  fail('deployed Sandbox payment-binding E2E evidence missing — HOLD (controlled deployment + full matrix not yet run)');
} else {
  const latest = artifacts.sort().at(-1);
  let ev = null;
  try { ev = JSON.parse(readFileSync(join(evDir, latest), 'utf8')); } catch { /* handled below */ }
  if (!ev) fail(`deployed E2E evidence ${latest} is unreadable`);
  else if (ev.result !== 'PASS' || ev.failed !== 0) {
    fail(`deployed E2E evidence ${latest} records a failed run (${ev.passed} passed, ${ev.failed} failed)`);
  } else if (!Array.isArray(ev.checks) || ev.checks.length === 0) {
    fail(`deployed E2E evidence ${latest} carries no checks`);
  } else {
    pass(`deployed Sandbox payment-binding E2E evidence registered (${latest}: ${ev.checks.length} checks, ${ev.ran_at})`);
  }
}

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
