#!/usr/bin/env node
/**
 * check-live-fail-closed.mjs
 *
 * Automated proof that the Live activation envelope stays fail-closed
 * (docs/operations/LIVE_ACTIVATION_GATE.md). Fails if any invariant guard is
 * missing from the code. This is a STRUCTURAL guard — it asserts the
 * enforcement points exist so a refactor cannot silently remove them; the
 * behavioural proofs live in the Rust/Go unit tests it points at.
 *
 * Invariants asserted:
 *   1. Core environment defaults to LIVE when unset (fail-closed) and there is
 *      an is_live() test proving it.
 *   2. Sandbox utility handlers hard-enforce SANDBOX (requireSandbox).
 *   3. Live activation needs platform_mode agreement, not just an ENV var
 *      (EnvGate + ENVIRONMENT_MISMATCH).
 *   4. API keys are environment-bound by prefix (bz_live_ / bz_test_).
 *   5. Live money-movement rails fail closed without credentials (EMIS stub errors).
 *
 * Usage: node tools/check-live-fail-closed.mjs   (make check-live-fail-closed)
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
let failures = 0;
const fail = m => { console.error(`  ✗ ${m}`); failures++; };
const pass = m => console.log(`  ✓ ${m}`);

function assertContains(relPath, needles, label) {
  const p = resolve(ROOT, relPath);
  if (!existsSync(p)) { fail(`${label}: missing file ${relPath}`); return; }
  const src = readFileSync(p, 'utf-8');
  const missing = needles.filter(n => !src.includes(n));
  if (missing.length) fail(`${label}: ${relPath} missing [${missing.join(', ')}]`);
  else pass(label);
}

// 1. Core defaults to LIVE when ENV unset (safe default) + a test asserts it.
assertContains('core/api/src/state.rs',
  ['CoreEnvironment::Live, // safe default', 'is_live()'],
  'core environment fail-closes to LIVE (test-backed)');

// 2. Sandbox handlers hard-enforce SANDBOX.
assertContains('services/api-gateway/internal/handler/sandbox.go',
  ['func requireSandbox'],
  'sandbox utilities enforce SANDBOX (requireSandbox)');

// 3. Live activation requires platform_mode agreement (not one ENV flag).
assertContains('services/api-gateway/internal/service/env_gate.go',
  ['NewEnvGate'],
  'EnvGate gates writes on platform_mode agreement');
assertContains('services/api-gateway/internal/handler/merchant_application_admin.go',
  ['ENVIRONMENT_MISMATCH'],
  'onboarding refuses env/platform-mode mismatch (ENVIRONMENT_MISMATCH)');

// 4. API keys are environment-bound by prefix.
assertContains('core/merchants/src/api_key.rs',
  ['bz_live_', 'bz_test_', 'ApiKeyEnvironment'],
  'API keys are environment-bound (bz_live_/bz_test_)');

// 5. Live rails fail closed without credentials.
assertContains('core/acquiring/src/providers/emis.rs',
  ['not yet configured'],
  'EMIS live rail fails closed without credentials (no phantom success)');

// 6. The activation gate doc exists.
assertContains('docs/operations/LIVE_ACTIVATION_GATE.md',
  ['fail-closed', 'Two-person'],
  'Live activation gate document present');

console.log(failures ? `\n✗ Live fail-closed check FAILED (${failures})` : '\n✓ Live fail-closed invariants hold');
process.exit(failures ? 1 : 0);
