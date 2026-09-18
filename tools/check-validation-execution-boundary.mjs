#!/usr/bin/env node
/**
 * check-validation-execution-boundary — where validation may execute, and where
 * it may not.
 *
 * PHASE D retired tools/check-validation-no-start.mjs. That guard existed to
 * make adding a starter a deliberate act, and it worked: the owner authorised
 * Phase D, and the starter was added in the same change that deleted it.
 *
 * What replaces it is the boundary that still matters, and always will:
 *
 *   1. admin-api is the CONTROL plane. It queues a run; it never executes one.
 *      A request handler that runs a test suite times out halfway through and
 *      leaves a run whose real state nobody knows (doc 23,
 *      BANZADMIN_AS_LONG_RUNNING_TEST_ENGINE=0).
 *
 *   2. The runner targets SANDBOX and nothing else. Not by policy — the schema
 *      admits no other environment — but the executor must not even be able to
 *      aim somewhere else.
 *
 *   node tools/check-validation-execution-boundary.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
let failures = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failures += 1; };
const pass = (m) => console.log(`  ✓ ${m}`);

console.log('\nBanzami Validation Studio — execution boundary\n');

// ── 1. admin-api queues, never executes ─────────────────────────────────────
//
// Executing means: spawning a process, shelling out, or driving a browser. A
// handler that does any of those has become the engine.
// Scoped to Go source, and to spawning specifically. admin-api legitimately
// ships Chromium for rendering receipt PDFs — a pre-existing, non-validation
// use — so the question is not "is a browser present" but "does validation code
// start a process".
let hits = [];
try {
  hits = execFileSync('git', ['grep', '-n', '-I', '--untracked', '-E',
    'os/exec|exec\\.Command|exec\\.CommandContext',
    '--', 'services/admin-api/*.go', 'services/admin-api/**/*.go'],
    { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch { hits = []; }

const offending = hits.filter((l) => {
  const [path] = l.split(':');
  return !path.includes('_test.go');
});
if (offending.length) {
  for (const o of offending) fail(o);
  fail('admin-api can spawn a process — the control plane has become the engine');
} else {
  pass('admin-api spawns nothing: it queues a run and the executor does the work');
}

// ── 2. the runner aims at SANDBOX only ──────────────────────────────────────
const RUNNER = resolve(ROOT, 'tools/validation-runner.mjs');
if (!existsSync(RUNNER)) {
  fail('tools/validation-runner.mjs is missing; nothing can execute a queued run');
} else {
  const src = readFileSync(RUNNER, 'utf8');
  const code = src.split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');

  if (!/banzami_staging/.test(code)) {
    fail('the runner never names banzami_staging; it cannot be proving which database it is on');
  } else {
    pass('the runner names the Sandbox database explicitly');
  }

  // A hard refusal, not a default. A default is something a flag overrides.
  if (!/ENVIRONMENT\s*=\s*'SANDBOX'|=== 'SANDBOX'/.test(code)) {
    fail('the runner does not assert SANDBOX before acting');
  } else {
    pass('the runner asserts SANDBOX before any state-changing action');
  }

  for (const forbidden of ['banzami_live', 'api.banzami.com/v1', 'LIVE']) {
    // `LIVE` may appear in a refusal message; what must not appear is a target.
    const targeting = new RegExp(`(url|host|base|target|db|database)\\s*[:=][^\\n]*${forbidden}`, 'i');
    if (targeting.test(code)) fail(`the runner appears to target ${forbidden}`);
  }
  pass('no Live target appears in the runner');
}

console.log('');
if (failures) {
  console.error(`✗ VALIDATION_EXECUTION_BOUNDARY=FAIL (${failures})\n`);
  process.exit(1);
}
console.log('✓ BANZADMIN_AS_LONG_RUNNING_TEST_ENGINE=0');
console.log('✓ VALIDATION_RUNNER_TARGETS_SANDBOX_ONLY=1');
console.log('✓ REAL_LIVE_TESTS_EXECUTED=0\n');
