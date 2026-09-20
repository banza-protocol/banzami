#!/usr/bin/env node
/**
 * check-validation-exposure — a journey's declaration, validated against what
 * its own resources actually held.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * The aggregate samples protect the shared 50 000 000 cap and move with
 * unrelated Sandbox traffic — this Sandbox carries DOA's production. They can
 * never validate a declaration, because a journey must not look under-declared
 * for someone else's payment.
 *
 *   node tools/check-validation-exposure.mjs
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const runner = readFileSync(join(repo, 'tools/validation-runner.mjs'), 'utf8');
const migration = readFileSync(join(repo, 'db/migrations/0163_validation_attributable_exposure.sql'), 'utf8');

let failures = 0;
const check = (t, ok, d = '') => { if (ok) return console.log(`  ✓ ${t}`); console.log(`  ✗ ${t}${d ? `\n      ${d}` : ''}`); failures++; };

console.log('\nattributable exposure — the peak a journey itself held\n');

const { attributablePeak, exposureVerdict } = await import('./lib/validation-exposure.mjs');
const T = (s) => `2026-09-19T12:00:${String(s).padStart(2, '0')}Z`;
const peak = (evts) => attributablePeak(evts).peak;
const v = (declared, actual, o = {}) => exposureVerdict({ declared, actual, ...o }).verdict;

/* ── A, B · the bound ────────────────────────────────────────────────────── */

check('A. peak equal to the declared bound is VERIFIED', v(1_000_000, 1_000_000) === 'VERIFIED');
check('B. one minor over it is UNDER_DECLARED', v(1_000_000, 1_000_001) === 'UNDER_DECLARED');
// pt-PT groups with U+00A0, so match the digits rather than the separator.
check('B. …and the detail names both numbers',
  /1.000.001[\s\S]*1.000.000/.test(exposureVerdict({ declared: 1_000_000, actual: 1_000_001 }).detail),
  exposureVerdict({ declared: 1_000_000, actual: 1_000_001 }).detail);

/* ── C · the final balance is not the peak ───────────────────────────────── */

const s05 = [{ resource: 'c', at: T(1), delta: 1_000_000 }, { resource: 'c', at: T(9), delta: -350_000 }];
check('C. a grant then a spend peaks at the grant, not the remainder',
  peak(s05) === 1_000_000, `got ${peak(s05)} — the S05 shape, whose final balance was 650 000`);
check('C. …so a declaration of 700 000 is UNDER_DECLARED, not VERIFIED',
  v(700_000, peak(s05)) === 'UNDER_DECLARED',
  'reading the final balance would have passed this');

/* ── D, E · concurrency is measured, never assumed ───────────────────────── */

check('D. two resources held at the same time sum',
  peak([{ resource: 'a', at: T(1), delta: 1_000_000 }, { resource: 'b', at: T(2), delta: 1_000_000 }]) === 2_000_000);
check('E. two maxima at DIFFERENT times do not sum',
  peak([{ resource: 'a', at: T(1), delta: 1_000_000 }, { resource: 'a', at: T(2), delta: -1_000_000 },
        { resource: 'b', at: T(3), delta: 1_000_000 }]) === 1_000_000,
  'sum(max per resource) would say 2 000 000 for exposure that never existed');
check('E. …and a transfer between two owned resources shows no phantom spike',
  peak([{ resource: 'a', at: T(1), delta: 1_000_000 },
        { resource: 'a', at: T(5), delta: -350_000 }, { resource: 'b', at: T(5), delta: 350_000 }]) === 1_000_000,
  'events at the same instant are all applied before the sum is taken');

/* ── F · unknown fails closed ────────────────────────────────────────────── */

check('F. unestablished ownership is UNKNOWN', v(1_000_000, null, { ownershipKnown: false }) === 'UNKNOWN');
check('F. an unmeasurable peak is UNKNOWN', v(1_000_000, null) === 'UNKNOWN');
check('F. a missing declaration is UNKNOWN', v(undefined, 500) === 'UNKNOWN');
check('F. …and UNKNOWN never becomes VERIFIED or zero',
  ['VERIFIED'].includes(v(1_000_000, null, { ownershipKnown: false })) === false
  && exposureVerdict({ declared: 1_000_000, actual: null, ownershipKnown: false }).verdict !== 'VERIFIED');
check('F. a journey that creates nothing disposable needs no measurement',
  v(0, 0, { fundingCapable: false }) === 'VERIFIED');

/* ── G · global traffic must not move the attributable figure ────────────── */

const owned = [{ resource: 'mine', at: T(1), delta: 1_000_000 }];
const withStranger = [...owned, { resource: 'someone-elses', at: T(2), delta: 40_000_000 }];
check('G. a stranger\'s balance is not in the journey\'s event set at all',
  peak(owned) === 1_000_000,
  'attributable events come from the resources the harness handed over');
check('G. …and including one would be visible, which is why ownership is declared',
  peak(withStranger) === 41_000_000,
  'the engine sums what it is given; the guard is that it is only ever given owned resources');
check('G. the runner reads the trajectory of OWNED handles only',
  /WHERE c\.handle IN \(\$\{list\}\)/.test(runner) && /manifest\.owned/.test(runner));
check('G. …and global samples remain a separate number',
  /validation_run_funds_samples/.test(runner) && /actual_attributable_peak_minor/.test(runner));

/* ── the declaration is never rewritten ──────────────────────────────────── */

check('the runner never raises a declaration to the observed value',
  !/max_synthetic_funds_exposure_minor\s*=\s*(e\.actual|peak|actual)/.test(runner),
  'a bound that follows the measurement is not a bound');
check('under-declaration fails the run',
  /underDeclared\.length === 0 \? 'PASS'/.test(runner));
check('the verdict is persisted with what it was measured from',
  /exposure_resource_count = \$\{e\.resources\}, exposure_event_count = \$\{e\.events\}/.test(runner));
check('…and the schema refuses a VERIFIED that is not within its bound',
  /exposure_verdict IS DISTINCT FROM 'VERIFIED'\s*\n\s*OR actual_attributable_peak_minor <= declared_peak_minor/.test(migration));
check('…and refuses a measured verdict with no numbers behind it',
  /validation_run_journeys_exposure_shape[\s\S]{0,400}?declared_peak_minor IS NOT NULL/.test(migration));

/* ── the known journeys, re-derived rather than assumed ──────────────────── */

const journeys = JSON.parse(execFileSync('python3', ['-c',
  'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
  join(repo, 'quality/validation/journeys.yaml')], { encoding: 'utf8', maxBuffer: 1 << 24 })).journeys ?? [];
const decl = (id) => journeys.find((j) => j.journey_id === id)?.max_synthetic_funds_exposure_minor;

// S04 registers twice through the UI; each registration is granted 1 000 000.
check('S04-RCV-001 declares at least the two grants it takes',
  decl('S04-RCV-001') >= 2 * 1_000_000, `declares ${decl('S04-RCV-001')}`);
// S05 is granted once and then spends; the grant is the peak, not the remainder.
check('S05-LNK-002 declares at least the grant, not its 650 000 residual',
  decl('S05-LNK-002') >= 1_000_000, `declares ${decl('S05-LNK-002')}`);
// S23 creates a test payer (granted 1 000 000) and funds it 200 000 on top.
check('S23-RAIL-001 declares at least the grant plus the funding it adds',
  decl('S23-RAIL-001') >= 1_200_000,
  `declares ${decl('S23-RAIL-001')} — its payers were found holding 1 195 000, which is that minus the spend`);

console.log(failures === 0
  ? `\n✓ VALIDATION_EXPOSURE=PASS\n`
  : `\n✗ VALIDATION_EXPOSURE=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
