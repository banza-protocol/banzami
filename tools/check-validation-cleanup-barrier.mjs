#!/usr/bin/env node
/**
 * check-validation-cleanup-barrier — VD-009 held shut.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * FULL's no-cleanup upper bound on funded value is 56 950 000 minor against a
 * shared Sandbox cap of 50 000 000, and a start gate that must also survive a
 * failed run plus one retry needs 113 900 000. FULL is feasible ONLY because
 * cleanup works — which was invisible for as long as cleanup was a convention
 * that harnesses followed and nothing measured. Proof 15 leaked 500 000 per run
 * until 42 consumers held 79% of the cap and the next funding call was refused.
 *
 *   node tools/check-validation-cleanup-barrier.mjs
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const runner = readFileSync(join(repo, 'tools/validation-runner.mjs'), 'utf8');
const migration = readFileSync(join(repo, 'db/migrations/0161_validation_cleanup_barrier.sql'), 'utf8');
const journeys = JSON.parse(execFileSync('python3', [
  '-c', 'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
  join(repo, 'quality/validation/journeys.yaml'),
], { encoding: 'utf8', maxBuffer: 1 << 24 }));

let failures = 0;
const check = (title, ok, detail = '') => {
  if (ok) return console.log(`  ✓ ${title}`);
  console.log(`  ✗ ${title}${detail ? `\n      ${detail}` : ''}`);
  failures++;
};

console.log('\ncleanup barrier — VD-009\n');

const { cleanupVerdict } = await import('./validation-runner.mjs');
const dirty = { disposable: 2, fundsResidualAllowed: 0 };

/* ── the decision ────────────────────────────────────────────────────────── */

check('a journey that creates nothing disposable needs no verification',
  cleanupVerdict({ disposable: 0 }, 0, 999999).result === 'NOT_REQUIRED');
check('returning to the baseline is VERIFIED',
  cleanupVerdict(dirty, 1_000_000, 1_000_000).result === 'VERIFIED');
check('leaving funded value behind is FAILED',
  cleanupVerdict(dirty, 1_000_000, 1_500_000).result === 'FAILED');
check('…and the residual is stated in the detail',
  /500\D?000/.test(cleanupVerdict(dirty, 1_000_000, 1_500_000).detail));
check('a fall is not a failure', cleanupVerdict(dirty, 1_000_000, 900_000).result === 'VERIFIED',
  'the Sandbox also carries DOA production traffic; only a RISE consumes the cap');
check('no baseline is UNDECLARED, never a pass',
  cleanupVerdict(dirty, null, null).result === 'UNDECLARED');
check('an unreadable reading is UNDECLARED, never a pass',
  cleanupVerdict(dirty, 1_000_000, null, 'connection refused').result === 'UNDECLARED');
check('a declared allowance is honoured exactly',
  cleanupVerdict({ disposable: 1, fundsResidualAllowed: 500 }, 0, 500).result === 'VERIFIED'
  && cleanupVerdict({ disposable: 1, fundsResidualAllowed: 500 }, 0, 501).result === 'FAILED');

/* ── UNDECLARED is not a pass anywhere it is read ─────────────────────────── */

check('only VERIFIED and NOT_REQUIRED let a journey be terminally PASSED',
  /\['VERIFIED', 'NOT_REQUIRED'\]\.includes\(cleanup\.result\)/.test(runner),
  'UNDECLARED and NOT_REACHED must not appear in that list');

/* ── the barrier stops the run ───────────────────────────────────────────── */

check('a FAILED cleanup stops the run rather than continuing',
  /\['FAILED', 'UNDECLARED'\]\.includes\(cleanup\.result\)[\s\S]{0,600}?break;/.test(runner));
check('an UNDECLARED cleanup stops it too',
  /\['FAILED', 'UNDECLARED'\]\.includes\(cleanup\.result\)/.test(runner),
  'the concurrent-peak bound holds only while every journey is PROVEN clean; '
  + 'unmeasured breaks the proof exactly as leaking does');
check('the journeys after it are recorded, not silently absent',
  /NOT_REACHED/.test(runner) && /not started: the run stopped at a cleanup barrier/.test(runner),
  'a run that stops must still say what it intended to do');
check('stopping at the barrier makes the run FAIL',
  /!budgetStopped && !cleanupStopped \? 'PASS'/.test(runner));
check('the run event says why it stopped',
  /STOPPED AT CLEANUP BARRIER/.test(runner));

/* ── the two results are two results ─────────────────────────────────────── */

check('functional and cleanup results are persisted separately',
  /functional_result=\$\{results\.functional \? lit\(results\.functional\) : 'NULL'\}/.test(runner)
  && /cleanup_result=\$\{lit\(results\.cleanup\.result\)\}/.test(runner),
  'since 0162 a journey that was never attempted writes NULL rather than '
  + 'claiming UNAVAILABLE, which would blame its adapter');
check('they are written in the same statement as the outcome',
  /UPDATE validation_run_journeys SET outcome=\$\{lit\(outcome\)\}, detail=\$\{lit\(detail\)\}\$\{extra\}/.test(runner),
  'otherwise there is a window where a journey is PASSED with no cleanup record');

/* ── the schema enforces it too ──────────────────────────────────────────── */

check('0161 adds both result columns',
  /ADD COLUMN IF NOT EXISTS functional_result/.test(migration)
  && /ADD COLUMN IF NOT EXISTS cleanup_result/.test(migration));
check('0161 refuses a PASSED journey whose cleanup failed',
  /validation_run_journeys_clean_pass[\s\S]{0,400}?outcome <> 'PASSED'/.test(migration));
check('0161 leaves pre-barrier rows NULL rather than backfilling them',
  /cleanup_result IS NULL\s+-- pre-0161 rows/.test(migration),
  'filling them from today\'s values would assert something nothing observed');
check('0161 is additive — no existing row is rewritten',
  !/\bUPDATE\s+validation_run_journeys/i.test(migration) && !/\bDELETE\s+FROM/i.test(migration));
check('0161 carries a DOWN', /DROP TABLE IF EXISTS validation_run_resources/.test(migration));

/* ── resources are owned, never recognised ───────────────────────────────── */

check('the resource ledger records the run and journey that created each thing',
  /CREATE TABLE IF NOT EXISTS validation_run_resources[\s\S]*?run_id[\s\S]*?journey_id/.test(migration));
check('…with the fields a cleanup verifier needs',
  ['created_at', 'cleanup_required', 'cleanup_state', 'cleanup_evidence']
    .every((c) => new RegExp(`${c}\\s+\\w`).test(migration)));
check('a resource class nothing can verify cannot be invented at runtime',
  /resource_class\s+TEXT\s+NOT NULL[\s\S]{0,200}?CHECK \(resource_class IN \(/.test(migration),
  'extending the list is a migration, deliberately');
// Only SQL that would MATCH on a name counts here — the prose above the table
// says the word "prefix" precisely to explain why none of it appears below.
const ddl = migration.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
check('nothing in the ledger identifies a resource by name pattern',
  !/\b(LIKE|ILIKE|SIMILAR TO)\b/i.test(ddl) && !/~\*?\s*'/.test(ddl),
  'fm65, priscila, oxfannio and qatester15 matched every synthetic pattern and were real people');

/* ── a FULL run must not start into a schema that cannot record this ─────── */

check('the barrier is probed, never assumed', /function probeCleanupBarrier/.test(runner));
check('a FULL run is refused when 0161 is not deployed',
  /VALIDATION_CLEANUP_BARRIER_UNAVAILABLE/.test(runner));
check('…and refused BEFORE the run is claimed',
  runner.indexOf('VALIDATION_CLEANUP_BARRIER_UNAVAILABLE') < runner.indexOf('const run = claim('),
  'the claim is the irreversible step; an authorisation costs two step-up ceremonies');
check('peeking at the queue does not claim it',
  /function peekQueued[\s\S]{0,400}?SELECT run_ref, profile_id FROM validation_runs/.test(runner)
  && !/function peekQueued[\s\S]{0,400}?UPDATE/.test(runner));

/* ── the registry says what each journey may leave behind ────────────────── */

const withHarness = (journeys.journeys ?? []).filter((j) => j.existing_harness);
const overAllowed = withHarness.filter((j) => Number(j.cleanup?.funds_residual_allowed_minor ?? 0) > 0);
check('every journey with a harness declares its disposables',
  withHarness.every((j) => Array.isArray(j.cleanup?.disposable)),
  'a journey with no cleanup block cannot be verified or excused');
check('no journey is permitted to leave funded value behind today',
  overAllowed.length === 0,
  overAllowed.map((j) => `${j.journey_id}=${j.cleanup.funds_residual_allowed_minor}`).join(', '));

/* ── the funds model must ask the question of rows that can answer it ──────
 *
 * The FULL plan carries one row per suite that has no journey, so a suite
 * nobody can prove still appears in the run's record. Those rows have no
 * harness, the runner marks them UNAVAILABLE without executing anything, and
 * asking them to declare a funds ceiling has no referent — UNKNOWN to that
 * question refused the first authorised FULL run at the moment of claim.
 */
const { plannedPeakFunds } = await import('./lib/validation-capacity.mjs');
const mixed = [
  { journey: 'REAL-A', harness: 'a.mjs', max_synthetic_funds_exposure_minor: 1000 },
  { journey: 'S99-NOT-PROVEN', harness: null },
  { journey: 'REAL-B', harness: 'b.mjs', max_synthetic_funds_exposure_minor: 3000 },
];
const mix = plannedPeakFunds(mixed, null, null, { barrier: true });
check('a plan row that cannot execute is not asked what it will spend',
  mix.unknown.length === 0, mix.unknown.join(', '));
check('…and is listed, so a row that stops being inert is noticed',
  mix.inert.length === 1 && mix.inert[0] === 'S99-NOT-PROVEN');
check('…and contributes nothing to either bound',
  mix.cumulativeExposureBound === 4000 && mix.concurrentPeakMax === 3000);
check('a REAL journey that declares nothing is still UNKNOWN',
  plannedPeakFunds([{ journey: 'REAL-C', harness: 'c.mjs' }]).unknown.length === 1,
  'an undeclared exposure is not a zero exposure');

/* ── and the reporting tool must resolve the plan the way the runner does ─── */
const { planFor } = await import('./validation-runner.mjs');
const readiness = readFileSync(join(repo, 'tools/validation-owner-readiness.mjs'), 'utf8');
check('the readiness tool uses the runner\'s own plan resolver',
  /planFor\(PROFILE\)\.plan/.test(readiness),
  'building a second plan from journeys.yaml measured 38 rows where the runner executes 39');
check('…and that resolver is exported for exactly that reason',
  typeof planFor === 'function');
const runnerPlan = planFor('FULL').plan;
check('the runner\'s FULL plan carries the inert S20 row',
  runnerPlan.some((r) => r.journey === 'S20-NOT-PROVEN' && !r.harness),
  'a suite nobody can prove must still appear in the run record');
check('the funds model accepts the runner\'s real FULL plan',
  plannedPeakFunds(runnerPlan, null, null, { barrier: true }).unknown.length === 0);

console.log(failures === 0
  ? `\n✓ VALIDATION_CLEANUP_BARRIER=PASS\n`
  : `\n✗ VALIDATION_CLEANUP_BARRIER=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
