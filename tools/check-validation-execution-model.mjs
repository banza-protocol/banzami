#!/usr/bin/env node
/**
 * check-validation-execution-model — what a plan row IS, why it did not run,
 * and whether the funds instrument can be believed.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * BZV-20260919-0003 recorded 39 rows for a profile everyone calls "38
 * journeys", marked 30 journeys it never started as SKIPPED while its own
 * counter called them UNAVAILABLE, and reported an actual funds peak of 0
 * beside a residual of +2 000 000. Three different ways of saying something
 * the system had no vocabulary for.
 *
 *   node tools/check-validation-execution-model.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const runner = readFileSync(join(repo, 'tools/validation-runner.mjs'), 'utf8');
const migration = readFileSync(join(repo,
  'db/migrations/0162_validation_execution_record_kinds_and_reachability.sql'), 'utf8');

let failures = 0;
const check = (title, ok, detail = '') => {
  if (ok) return console.log(`  ✓ ${title}`);
  console.log(`  ✗ ${title}${detail ? `\n      ${detail}` : ''}`);
  failures++;
};

console.log('\nexecution model — record kinds, reachability, funded exposure\n');

const { planFor, peakFromSamples, sampleFunds } = await import('./validation-runner.mjs');

/* ── D + E · the plan is typed by the planner that makes it ──────────────── */

const { plan } = planFor('FULL');
const journeys = plan.filter((p) => p.kind === 'JOURNEY');
const controls = plan.filter((p) => p.kind === 'CONTROL');
check('E. the FULL plan is 38 JOURNEY + 1 CONTROL',
  journeys.length === 38 && controls.length === 1,
  `${journeys.length} JOURNEY, ${controls.length} CONTROL, ${plan.length} total`);
check('E. …and every row declares a kind', plan.every((p) => p.kind === 'JOURNEY' || p.kind === 'CONTROL'));
check('D. the S20 architectural record is CONTROL, not a journey',
  controls[0]?.suite === 'S20' && controls[0].controlClassification === 'NOT_PROVEN'
  && controls[0].controlReason === 'ARCHITECTURAL',
  JSON.stringify(controls[0] && { s: controls[0].suite, c: controls[0].controlClassification, r: controls[0].controlReason }));
check('D. a CONTROL record carries no harness, and is not counted as executable',
  controls.every((p) => !p.harness));
check('the kind is DECLARED, never inferred from a null harness or a name',
  /kind: 'CONTROL'/.test(runner) && /kind: 'JOURNEY'/.test(runner)
  && !/record_kind[^\n]*harness\s*(===|==)\s*null/.test(runner));
check('…and it is what gets materialised',
  /INSERT INTO validation_run_journeys[\s\S]{0,300}?record_kind/.test(runner));

/* ── A, B, C · the reachability vocabulary ───────────────────────────────── */

check('A. a cleanup abort records the rest as NOT_REACHED',
  /mark\(run\.id, later, 'NOT_REACHED'/.test(runner),
  'they were executable and their adapters were fine; the run stopped before them');
check('A. …and no longer as SKIPPED wearing functional_result UNAVAILABLE',
  !/mark\(run\.id, later, 'SKIPPED'[\s\S]{0,200}?functional: 'UNAVAILABLE'/.test(runner));
check('A. …with no functional result at all, because it never ran',
  /'NOT_REACHED'[\s\S]{0,160}?functional: null/.test(runner));
check('B. a journey with no harness is UNAVAILABLE',
  /mark\(run\.id, p, 'UNAVAILABLE', why\)/.test(runner),
  'the adapter or dependency could not be exercised — a different fact');
check('C. SKIPPED is reserved for a deliberate policy skip',
  !/mark\([^)]*'SKIPPED'/.test(runner),
  'nothing in the runner may reach for SKIPPED to mean "did not happen"');
check('the schema admits NOT_REACHED as an outcome',
  /outcome IN \('PLANNED', 'OBSERVED', 'ASSERTED',\s*'PASSED', 'FAILED', 'NOT_REACHED'/.test(migration));
check('a CONTROL record can never be recorded as having executed',
  /validation_run_journeys_control_never_executes[\s\S]{0,300}?outcome NOT IN \('PASSED', 'FAILED'/.test(migration));
check('a CONTROL record must say why it is one',
  /record_kind = 'CONTROL'\s*\n\s*AND control_classification IS NOT NULL/.test(migration));

/* ── F · the summary counts what the rows say ────────────────────────────── */

check('F. the summary reads NOT_REACHED from the rows',
  /outcome = 'NOT_REACHED'\)/.test(runner));
check('F. …and the record kinds too',
  /record_kind = 'JOURNEY'\)/.test(runner) && /record_kind = 'CONTROL'\)/.test(runner));
check('F. …and says so when legacy rows make the two disagree',
  /LEGACY rows present \(pre-0162\)/.test(runner),
  'pre-0162 rows have no kind, and inventing one would be the inference 0162 abolishes');
check('F. a divergence between counter and record is still reported',
  /not reached \$\{expected\.notReached/.test(runner));

/* ── §7 + §8 · the funds instrument ──────────────────────────────────────── */

check('funded exposure is sampled at all five phases',
  ['BASELINE', 'PRE_JOURNEY', 'POST_FUNCTIONAL', 'POST_CLEANUP', 'RUN_TERMINAL']
    .every((ph) => new RegExp(`take\\('${ph}'`).test(runner)),
  'a peak read once per loop never sees the last journey');
check('…POST_FUNCTIONAL is taken BEFORE cleanup verification',
  runner.indexOf("take('POST_FUNCTIONAL'") < runner.indexOf('verifyCleanup(p, fundsBaselineForJourney)'),
  'otherwise cleanup removes the exposure before anything records it');
check('…and each sample is persisted with its phase and delta',
  /INSERT INTO validation_run_funds_samples[\s\S]{0,200}?delta_from_baseline_minor/.test(runner));

const peak = (deltas, residual) => peakFromSamples(deltas.map((d) => ({ delta: d })), residual);
check('the peak is the maximum delta across samples',
  peak([0, 500, 2000, 300, 0], 0).peak === 2000);
check('a journey that returns everything still shows the exposure it held',
  peak([0, 0, 1_000_000, 0, 0], 0).peak === 1_000_000,
  'POST_FUNCTIONAL is why: POST_CLEANUP alone would report nothing happened');
check('§8. peak 0 beside a positive residual is reported as impossible',
  peak([0, 0], 2_000_000).impossible === true,
  'this is the exact state BZV-20260919-0003 reported');
check('§8. …and so is any peak below the residual',
  peak([0, 100], 2_000_000).impossible === true);
check('§8. a peak at or above the residual is believable',
  peak([0, 2_000_000, 2_000_000], 2_000_000).impossible === false);
check('§8. a clean run with no exposure is not flagged',
  peak([0, 0, 0], 0).impossible === false);
check('§8. no samples at all, with a residual, is a fault not a zero',
  peak([], 350_000).impossible === true,
  'an instrument that recorded nothing has not shown the exposure was nothing');
check('§8. the runner refuses to quote a faulted peak as evidence',
  /FUNDS INSTRUMENTATION FAULT/.test(runner) && /is NOT evidence for this run/.test(runner));

/* ── §15 · the phase sequence, driven end to end ─────────────────────────── */
//
// The real reader and writer are swapped out so this proves the SEQUENCE
// without attaching invented samples to a run that actually happened.

function series(readings) {
  const rows = [];
  const write = (r) => rows.push(r);
  const next = () => readings.shift();
  const baselineRow = sampleFunds('run', 'BASELINE', null, null, { read: next, write });
  const base = baselineRow.used;
  const take = (phase, j) => sampleFunds('run', phase, j, base, { read: next, write });
  take('PRE_JOURNEY', 'J1');
  take('POST_FUNCTIONAL', 'J1');
  take('POST_CLEANUP', 'J1');
  const terminal = take('RUN_TERMINAL', null);
  return { rows, residual: terminal.delta, ...peakFromSamples(rows, terminal.delta) };
}

{
  // A journey that funds 1 000 000, does its work, and gives it all back.
  const clean = series([10_000_000, 10_000_000, 11_000_000, 10_000_000, 10_000_000]);
  const at = (ph) => clean.rows.find((r) => r.phase === ph);
  check('§15. BASELINE sample recorded', at('BASELINE')?.delta === 0);
  check('§15. POST_FUNCTIONAL delta > 0', at('POST_FUNCTIONAL').delta === 1_000_000);
  check('§15. POST_CLEANUP delta = 0', at('POST_CLEANUP').delta === 0);
  check('§15. TERMINAL residual = 0', clean.residual === 0);
  check('§15. ACTUAL_PEAK > 0 even though nothing remained', clean.peak === 1_000_000,
    'the exposure existed; a clean ending does not mean it never did');
  check('§15. …and the peak is not flagged', clean.impossible === false);
  check('§15. five samples, one per phase', clean.rows.length === 5);
  check('§15. per-journey phases carry the journey, run-level phases do not',
    at('PRE_JOURNEY').journeyID === 'J1' && at('BASELINE').journeyID === null
    && at('RUN_TERMINAL').journeyID === null,
    'the schema CHECK refuses the other shapes');
}

{
  // The same journey with cleanup that returns nothing — the retireBusiness
  // shape, which called a cleanup helper and restored nothing.
  const leaking = series([10_000_000, 10_000_000, 11_000_000, 10_350_000, 10_350_000]);
  const at = (ph) => leaking.rows.find((r) => r.phase === ph);
  check('§15. leaking run · POST_FUNCTIONAL > 0', at('POST_FUNCTIONAL').delta === 1_000_000);
  check('§15. leaking run · POST_CLEANUP residual > 0', at('POST_CLEANUP').delta === 350_000);
  check('§15. leaking run · ACTUAL_PEAK >= residual',
    leaking.peak >= leaking.residual && leaking.residual === 350_000,
    `peak ${leaking.peak} residual ${leaking.residual}`);
  check('§15. leaking run · the peak is believable, so it is not flagged',
    leaking.impossible === false,
    'the fault flag is for an instrument that missed the rise, not for a leak');
}

{
  // And the state that made this phase necessary: a run that ended holding
  // 2 000 000 while its only samples said nothing ever moved.
  const blind = series([10_000_000, 10_000_000, 10_000_000, 10_000_000, 12_000_000]);
  check('§15. a rise seen only at TERMINAL still sets the peak',
    blind.peak === 2_000_000 && blind.impossible === false,
    `peak ${blind.peak} — RUN_TERMINAL is why BZV-20260919-0003 could not happen again`);
}

/* ── §9 · what the static guard proves, said out loud ────────────────────── */

const lifecycle = readFileSync(join(repo, 'tools/check-validation-fixture-lifecycle.mjs'), 'utf8');
check('§9. the static lifecycle guard scopes its own claim',
  /Under-declaration is therefore checked where the answer actually exists/.test(lifecycle)
  || /at RUNTIME/.test(lifecycle),
  'retireBusiness returned 200 and restored nothing; source text cannot tell');

console.log(failures === 0
  ? `\n✓ VALIDATION_EXECUTION_MODEL=PASS\n`
  : `\n✗ VALIDATION_EXECUTION_MODEL=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
