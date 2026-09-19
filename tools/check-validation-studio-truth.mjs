#!/usr/bin/env node
/**
 * check-validation-studio-truth — the Studio may not assert what it cannot know.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * For one day the dashboard rendered "o motor de execução é separado e ainda
 * não existe" and "Nenhuma execução foi alguma vez iniciada" directly above a
 * table of runs that engine had executed, beside a blocker reading "No
 * execution runner exists", over a coverage panel reporting 0 journeys proven
 * at runtime — a number assigned from a constant under a comment promising to
 * derive it "when a runner exists".
 *
 * None of that was a lie anyone told. Each sentence was true when written, and
 * nothing made any of them answerable to the system they described. So this
 * asserts the property that keeps them honest: claims about runs come from
 * runs, and the prose that cannot be derived must at least be conditional.
 *
 *   node tools/check-validation-studio-truth.mjs
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

let failures = 0;
const check = (title, ok, detail = '') => {
  if (ok) return console.log(`  ✓ ${title}`);
  console.log(`  ✗ ${title}${detail ? `\n      ${detail}` : ''}`);
  failures++;
};

console.log('\nvalidation studio — the surface may not outlive its facts\n');

const page = read('apps/admin/app/(admin)/validation/page.tsx');
const catalogue = read('services/admin-api/internal/validation/catalogue.go');
const handler = read('services/admin-api/internal/handler/validation.go');
const store = read('services/admin-api/internal/validation/store.go');

/* ── claims about execution must be conditional on execution ─────────────── */

check('the page does not state unconditionally that no run has ever started',
  !/Nenhuma execução foi alguma vez iniciada\.\s*\n?\s*<\/p>/.test(page)
  && /runs_ever_started\s*\n?\s*\?/.test(page),
  'it said so over a table of four runs, two of them COMPLETED');
check('…nor that the execution engine does not exist',
  !/motor de execução[^<]*ainda não existe/.test(page),
  'tools/validation-runner.mjs has executed four runs');
check('…nor that no route can start one',
  !/não existe rota que inicie uma/.test(page));

/* ── runtime-proven is derived, not declared ─────────────────────────────── */

check('the registry does not assign JourneysRuntimeProven',
  !/c\.JourneysRuntimeProven\s*=\s*\d/.test(catalogue),
  'the registry knows what was written; only the run store knows what ran');
check('the handler derives it from the run store',
  /RuntimeProvenJourneys\(/.test(handler) && /out\.Coverage\.JourneysRuntimeProven\s*=/.test(handler));
check('…and that query counts DISTINCT journeys that PASSED',
  /count\(DISTINCT journey_id\)[\s\S]{0,120}?outcome = 'PASSED'/.test(store));

/* ── a verdict is not a state ────────────────────────────────────────────── */

check('the runs list renders the verdict beside the state',
  /RUN_VERDICT_STYLE\[r\.verdict\]/.test(page),
  'COMPLETED alone read identically for a run that passed and one that failed');
check('…and the run shape carried to it includes the verdict',
  /verdict: string \| null;[\s\S]{0,120}started_at: string \| null/.test(page));

/* ── a profile's last outcome outranks "não verificado" ──────────────────── */

check('the profile card shows what the profile last DID',
  /outcome\?\.verdict === 'PASS'/.test(page) && /outcome\?\.verdict === 'FAIL'/.test(page),
  'FULL was shown as "não verificado" after reaching 9 of 38 journeys');
check('…including the coverage it actually reached',
  /journeys_executed\}\s*\/\s*\{[^}]*journeys_planned/.test(page));
check('…and the denominator says it counts plan RECORDS, not journeys',
  /\/ \{outcome\.journeys_planned\} registos/.test(page),
  'the FULL plan materialises 39 records, one of which is a non-journey control '
  + 'row; reporting 38 would infer the distinction 0162 exists to make explicit');
check('…and says when cleanup was never measured rather than implying clean',
  /!outcome\.cleanup_measured/.test(page) && /introduzido depois desta execução/.test(page),
  'a run predating 0161 is unmeasured, which is not the same as clean');

/* ── closed issues must not be rendered as blockers ──────────────────────── */

const assurance = JSON.parse(execFileSync('python3', ['-c',
  'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
  join(repo, 'quality/validation/assurance.yaml')], { encoding: 'utf8', maxBuffer: 1 << 24 }));
const stillOpen = (assurance.known_issues ?? []).filter((i) => i.status === 'open' && (i.blocks_golden || i.blocks_full));
const runnerIssue = (assurance.known_issues ?? []).find((i) => /no execution runner exists/i.test(i.title ?? ''));
check('the "no execution runner" issue is not still open',
  runnerIssue ? runnerIssue.status !== 'open' : true,
  `VD-002 is ${runnerIssue?.status}; the runner has executed four runs`);
check('the overview only surfaces issues that are still open',
  /i\.Status == "open" && \(i\.BlocksGolden \|\| i\.BlocksFull\)/.test(handler));
console.log(`\n  ${stillOpen.length} issue(s) still block a profile: ${stillOpen.map((i) => i.id).join(', ') || '—'}`);

console.log(failures === 0
  ? `\n✓ VALIDATION_STUDIO_TRUTH=PASS\n`
  : `\n✗ VALIDATION_STUDIO_TRUTH=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
