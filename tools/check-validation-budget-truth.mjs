#!/usr/bin/env node
/**
 * check-validation-budget-truth — a declared budget must not be smaller than
 * the plan it governs.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * GOLDEN declared `max_applications: 0` with the comment "GOLDEN uses the
 * provisioned actors only", and spent 4 on every run. FULL declared 2 and spent
 * 12. Nothing compared them, so nothing noticed — for as long as the number was
 * only ever read by people.
 *
 * This is the commit-time half of the runner's start-time refusal. Catching it
 * here means a journey added tomorrow fails review; catching it there means a
 * run refuses before it provisions anything. Both, because they fail at
 * different moments and only one of them is free.
 *
 *   node tools/check-validation-budget-truth.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { submitCost } from './lib/validation-capacity.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (n) => JSON.parse(execFileSync('python3', [
  '-c', 'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
  join(repo, `quality/validation/${n}.yaml`),
], { encoding: 'utf8', maxBuffer: 1 << 24 }));

const journeys = load('journeys').journeys ?? [];
const profiles = load('profiles').profiles ?? [];

let failures = 0;
const fail = (m) => { console.log(`  ✗ ${m}`); failures++; };
const pass = (m) => console.log(`  ✓ ${m}`);

console.log('\nbudget truth — declared vs planned\n');

for (const p of profiles) {
  const planned = { runner: 0, vm: 0 };
  for (const j of journeys) {
    if (!p.suites.includes(j.suite) || !j.existing_harness) continue;
    const abs = join(repo, j.existing_harness);
    if (!existsSync(abs)) continue;
    const cost = submitCost(j.existing_harness, readFileSync(abs, 'utf8'));
    if (cost) planned[cost.bucket]++;
  }
  const total = planned.runner + planned.vm;
  const declared = Number(p.budget?.max_applications ?? 0);

  if (total > declared) {
    fail(`${p.id}: plan spends ${total} application submit(s) (runner ${planned.runner}, vm ${planned.vm}) ` +
         `but the profile declares ${declared} — a budget smaller than its plan is not a budget`);
    continue;
  }
  // Over-declaring is not a lie, but it is a number nobody can rely on: the
  // preflight would demand headroom the run does not need and refuse to start.
  if (declared > total) {
    fail(`${p.id}: declares ${declared} but the plan spends ${total} — the preflight would ` +
         `demand headroom this run never uses, and refuse a start it should allow`);
    continue;
  }
  pass(`${p.id}: declared ${declared} = planned ${total} (runner ${planned.runner}, vm ${planned.vm})`);
}

console.log(failures === 0
  ? '\n✓ VALIDATION_BUDGET_TRUTH=PASS\n'
  : `\n✗ VALIDATION_BUDGET_TRUTH=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
