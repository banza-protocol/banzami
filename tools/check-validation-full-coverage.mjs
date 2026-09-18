#!/usr/bin/env node
/**
 * check-validation-full-coverage — FULL must mean FULL, or say what it does not.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D.9).
 *
 * The failure this exists to prevent is not a red result. It is a GREEN one: a
 * profile named FULL that executed the thirteen suites which happened to have a
 * harness, reported PASS, and never mentioned the eleven it skipped. A run that
 * proves less than it claims is worse than a run that fails, because a failure
 * is investigated and a silent omission is believed.
 *
 * So every suite a profile selects must be one of exactly two things:
 *
 *   EXECUTABLE   at least one journey, each naming a harness that exists
 *   NOT_PROVEN   with a class, a detail a reviewer can check, Portuguese copy
 *                for the operator, and what would make it EXECUTABLE
 *
 * Absence is neither, and is the only thing this refuses.
 *
 *   node tools/check-validation-full-coverage.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (n) => JSON.parse(execFileSync('python3', [
  '-c', 'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
  join(repo, `quality/validation/${n}.yaml`),
], { encoding: 'utf8', maxBuffer: 1 << 24 }));

const suites = load('suites').suites ?? [];
const journeys = load('journeys').journeys ?? [];
const profiles = load('profiles').profiles ?? [];

// ARCHITECTURAL is a distinct answer, not a softer EXTERNAL: it says the
// obstacle is a capability this operator never built, and names it. A blocker
// that blames someone else invites nobody to fix it.
const BLOCKER_CLASSES = ['SAFETY', 'SECURITY_POLICY', 'EXTERNAL', 'TOOLING', 'ARCHITECTURAL'];

let failures = 0;
const fail = (m) => { console.log(`  ✗ ${m}`); failures++; };
const ok = (m) => console.log(`  ✓ ${m}`);

const bySuite = new Map();
for (const j of journeys) {
  if (!bySuite.has(j.suite)) bySuite.set(j.suite, []);
  bySuite.get(j.suite).push(j);
}

console.log('\nFULL coverage — every selected suite is EXECUTABLE or justified\n');

const executable = [], notProven = [];

for (const s of suites) {
  const js = bySuite.get(s.id) ?? [];
  const runnable = js.filter((j) => j.existing_harness && existsSync(join(repo, j.existing_harness)));
  const declared = s.runtime_proof ?? 'EXECUTABLE';

  if (runnable.length > 0) {
    if (declared === 'NOT_PROVEN') {
      fail(`${s.id} declares NOT_PROVEN but has ${runnable.length} executable journey(s) — ` +
           `the blocker is stale and understates what this suite can prove`);
      continue;
    }
    executable.push(s.id);
    ok(`${s.id} ${s.name_pt}: ${runnable.length} executable journey(s)`);
    continue;
  }

  if (declared !== 'NOT_PROVEN') {
    fail(`${s.id} ${s.name_pt}: no executable journey and no declared blocker — ` +
         `a FULL run would omit it in silence`);
    continue;
  }
  const b = s.blocker ?? {};
  const missing = ['class', 'detail', 'detail_pt', 'path_to_proof'].filter((k) => !String(b[k] ?? '').trim());
  if (missing.length) {
    fail(`${s.id}: NOT_PROVEN without ${missing.join(', ')} — an unexplained gap is not a justification`);
    continue;
  }
  if (!BLOCKER_CLASSES.includes(b.class)) {
    fail(`${s.id}: blocker class '${b.class}' is not one of ${BLOCKER_CLASSES.join(', ')}`);
    continue;
  }
  notProven.push(s.id);
  ok(`${s.id} ${s.name_pt}: NOT_PROVEN · ${b.class} · justified`);
}

// A journey may not name a harness that is not there. A missing harness would
// otherwise be reported at run time as UNAVAILABLE, which reads like a choice.
for (const j of journeys) {
  if (j.existing_harness && !existsSync(join(repo, j.existing_harness))) {
    fail(`${j.journey_id} names a harness that does not exist: ${j.existing_harness}`);
  }
}

// Each profile is checked against the same rule, so a profile cannot select a
// suite the registry never classified.
for (const p of profiles) {
  const unknown = (p.suites ?? []).filter((id) => !suites.some((s) => s.id === id));
  if (unknown.length) fail(`${p.id} selects unregistered suite(s): ${unknown.join(', ')}`);
}

console.log('');
console.log(`  VALIDATION_SUITES_EXECUTABLE=${executable.length}`);
console.log(`  VALIDATION_SUITES_NOT_PROVEN=${notProven.length} (${notProven.join(', ') || '—'})`);
console.log(`  VALIDATION_JOURNEYS_EXECUTABLE=${journeys.filter((j) => j.existing_harness).length}`);
console.log(failures === 0
  ? `\n✓ FULL_COVERAGE_CLASSIFIED=PASS — ${executable.length} executable, ${notProven.length} justified, 0 silent\n`
  : `\n✗ FULL_COVERAGE_CLASSIFIED=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
