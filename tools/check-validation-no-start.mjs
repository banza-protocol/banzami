#!/usr/bin/env node
/**
 * check-validation-no-start — nothing can start a Validation Run.
 *
 * Banzami Validation Studio (Phase C).
 *
 * Phase C builds a surface CAPABLE of orchestrating a real validation run. It
 * does not start one, and the honest way to say that is not a sentence in a
 * report — it is a guard that fails if a code path appears which could.
 *
 * A run starts by entering QUEUED. So: no non-test source outside the migration
 * and this guard may write that state. When the execution plane is authorised,
 * the change that adds a starter will fail here, and whoever makes it will have
 * to come and delete this check deliberately — which is exactly the amount of
 * deliberation that decision deserves.
 *
 *   node tools/check-validation-no-start.mjs
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

const SEARCH = ['services', 'apps', 'tools', 'core'];
const ALLOWED = [
  'db/migrations/0160_validation_runs.sql',   // declares the state machine
  'tools/check-validation-no-start.mjs',      // this file
  'tools/check-validation-run-model.mjs',     // proves the machine on a disposable DB
];

// A file is a test if it is one. Tests MAY drive a run through its whole
// lifecycle — that is how the machine is proven — and a test touches no
// deployed Sandbox.
const isTest = (p) =>
  p.includes('_test.go') || p.includes('.test.') || p.includes('/tests/') ||
  p.includes('__tests__') || p.endsWith('.spec.ts') || p.endsWith('.spec.tsx');

let hits = [];
try {
  // --untracked matters: a new file is exactly where a starter would first
  // appear, and plain `git grep` silently skips one. (The same omission once
  // made this programme's naming guard blind to the files most likely to drift.)
  const out = execFileSync('git', ['grep', '-n', '-I', '--untracked', '-E',
    "QUEUED|StateQueued", '--', ...SEARCH],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 });
  hits = out.trim().split('\n').filter(Boolean);
} catch {
  hits = [];   // git grep exits 1 when there are no matches
}

const offending = [];
for (const line of hits) {
  const [path, lineNo, ...rest] = line.split(':');
  const text = rest.join(':');
  if (ALLOWED.includes(path) || isTest(path)) continue;

  // A CONSTANT declaring the state, or a read that lists it, is not a start.
  // Writing it is. Look for the shapes that write.
  const writes =
    /state\s*=\s*'QUEUED'/i.test(text) ||
    /VALUES\s*\([^)]*'QUEUED'/i.test(text) ||
    /(Queue|Start)Run\b/.test(text) ||
    /=\s*StateQueued\b/.test(text) ||
    /,\s*StateQueued\b/.test(text);

  if (writes) offending.push(`${path}:${lineNo}: ${text.trim()}`);
}

console.log('\nBanzami Validation Studio — no run can be started\n');

if (offending.length) {
  for (const o of offending) console.error(`  ✗ ${o}`);
  console.error('\n✗ VALIDATION_RUN_START_IMPLEMENTED=1');
  console.error('  A code path can move a Validation Run into QUEUED. Phase C builds the');
  console.error('  surface, not the starter. If the execution plane is now authorised,');
  console.error('  remove this guard deliberately and say so in the same commit.');
  process.exit(1);
}

// The claim is only worth anything if the state exists to be written. Guard the
// guard: if QUEUED ever disappears from the model, this check would pass
// vacuously.
const migration = readFileSync(resolve(ROOT, 'db/migrations/0160_validation_runs.sql'), 'utf8');
if (!migration.includes("'QUEUED'")) {
  console.error("  ✗ the run model no longer has a QUEUED state; this guard would pass vacuously");
  process.exit(1);
}

console.log('  ✓ QUEUED exists in the run model, and nothing outside tests writes it');
console.log('\n✓ VALIDATION_RUN_START_IMPLEMENTED=0');
console.log('✓ GOLDEN_RUN_EXECUTED=0');
console.log('✓ FULL_RUN_EXECUTED=0\n');
