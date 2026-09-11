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

// 1. Core defaults to LIVE when ENV is unset or unrecognised (safe default), and a
//    test asserts it. The definition lives in the shared types crate — core's
//    CoreEnvironment is an alias of it (f3b5077b removed a second, independent
//    copy) — so both halves are checked: the default arm itself, and that core
//    still uses that one definition rather than a new one of its own.
assertContains('core/types/src/environment.rs',
  ['.unwrap_or(Environment::Live)', 'pub fn parse(raw: &str) -> Option<Self>'],
  'core environment fail-closes to LIVE (canonical definition)');
// …and since RA-118 a running core never stands on that default: it refuses to
// boot unless ENVIRONMENT names SANDBOX or LIVE, and a LIVE core refuses the
// simulated acquirer and KYC provider.
assertContains('core/api/src/main.rs',
  ['FATAL: ENVIRONMENT must be SANDBOX or LIVE.', 'fn live_provider_guard('],
  'core refuses an undeclared environment and simulated providers in LIVE');
assertContains('core/api/src/state.rs',
  ['pub type CoreEnvironment = banzami_types::Environment;', 'fn missing_env_defaults_to_live()', 'fn unknown_env_defaults_to_live()'],
  'core uses the canonical environment and tests its LIVE default');

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

// 7. Open security findings deferred to Live must live in the GATE, not only in a
// report. The 2026-07-03 transfer-surface record showed why: a correctly written,
// correctly prioritised Live blocker survived for weeks because nothing FAILED
// while it was open. SEC-019 (progressive-KYC on consumer P2P) is accepted as a
// LOW residual today; this assertion makes its removal from the activation
// protocol break the build instead of quietly losing it.
assertContains('docs/operations/LIVE_ACTIVATION_GATE.md',
  ['SEC-019'],
  'SEC-019 registered as a pre-Live activation condition');

console.log(failures ? `\n✗ Live fail-closed check FAILED (${failures})` : '\n✓ Live fail-closed invariants hold');
process.exit(failures ? 1 : 0);
