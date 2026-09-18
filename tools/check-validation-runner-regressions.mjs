#!/usr/bin/env node
/**
 * check-validation-runner-regressions — the ten defects BZV-20260918-0003 found,
 * held shut.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * The first Validation Run ever executed exposed seven defects, none of them in
 * the product. A fix that is only a fix is a fix until someone edits the line
 * above it, so each one gets an assertion here — behavioural where the thing can
 * be called, structural where it is a property of how the SQL is built.
 *
 *   node tools/check-validation-runner-regressions.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = join(repo, 'tools/validation-runner.mjs');
const src = readFileSync(RUNNER, 'utf8');

const { adoptionFromFlag, scrub, parseShellGates } = await import('./validation-runner.mjs');

let failures = 0;
const check = (title, ok, detail = '') => {
  if (ok) return console.log(`  ✓ ${title}`);
  console.log(`  ✗ ${title}${detail ? `\n      ${detail}` : ''}`);
  failures++;
};

console.log('\nrunner regressions — BZV-20260918-0003\n');

// 1. The separator is defined ONCE and used by both the query and the parse, so
//    they cannot disagree. That disagreement — not a wrong escape — was the bug.
check('1. the field separator is a real tab', src.includes("const SEP = '\\t';"));
check('1. the query uses that same constant', /-F"\$\{SEP\}"/.test(src),
  'a literal in the psql flag can drift from the literal in the split');
check('1. the parse uses it too', src.includes('l.split(SEP)'));
check('1. the transport proves itself before acting',
  /SELECT 'a', 'b', 'c'/.test(src) && /transport does not split columns/.test(src));

// 2. psql prints `UPDATE 1` after a RETURNING and -t does not suppress it.
check('2. the command tag is suppressed (-q)', /-Atq\b/.test(src));

// 3. The opt-in the harnesses require is set by the runner and nowhere else.
check('3. the runner sets BANZAMI_E2E=RUN', /BANZAMI_E2E: 'RUN'/.test(src));
check('3. …and only in the harness child environment',
  (src.match(/BANZAMI_E2E/g) || []).length === 1,
  'more than one mention means it is being set on some other path too');

// 4/5/6. Lease adoption, recorded as adoption, failing closed on a flag nobody
//        can read. A run stuck RUNNING with a dead executor used to be terminal.
check('4. an expired RUNNING lease can be adopted',
  /state = 'RUNNING' AND lease_expires_at < now\(\)/.test(src));
check('4. a live lease is not taken', /FOR UPDATE SKIP LOCKED/.test(src));
check('5. adoption is recorded as adoption', /adopted by \$\{EXECUTOR\}/.test(src));
check('5. …and a fresh claim as a claim', /claimed by \$\{EXECUTOR\}/.test(src));
check('6. psql\'s ::text boolean is read', adoptionFromFlag('true') === true && adoptionFromFlag('false') === false);
check('6. psql\'s bare boolean is read too', adoptionFromFlag('t') === true && adoptionFromFlag('f') === false);
let threw = false;
try { adoptionFromFlag('UPDATE 1'); } catch { threw = true; }
check('6. an unreadable flag FAILS CLOSED, never silently false', threw,
  'reading it as false would lose the adoption, which is the lossy direction');

// 7. Differencing a rolling 24h window under-reports a long run's spend.
check('7. spend is anchored to the run\'s own started_at',
  /SELECT started_at FROM validation_runs/.test(src) && src.includes('creditSince(since)'));
check('7. no rolling-window delta remains', !/creditVolume24h/.test(src));

// 8/9. Environment first, plan first.
const mainBody = src.slice(src.indexOf('function main()'));
check('8. the environment is proven before anything else in main',
  mainBody.indexOf('proveEnvironment()') < mainBody.indexOf('claim('));
check('9. the whole plan is persisted before the first journey runs',
  mainBody.indexOf("'PLANNED'") < mainBody.indexOf('runHarness('),
  'a run must be able to say what it INTENDED to execute');

// 10. Capture is scrubbed structurally, not by operator discipline.
check('10. secrets are scrubbed out of captured output', /sk_/.test(scrub('bz_test_sk_ABC123')) === false);
check('10. bearer tokens too', /abcdefGHIJ/.test(scrub('Bearer abcdefGHIJ.klm')) === false);
check('10. a financial amount survives', scrub('750000 minor').includes('750000 minor'),
  'shredding evidence to look careful is its own defect');
check('10. shell capture passes through it', /scrub\(\(res\.stdout/.test(src));

// And the adapter honesty the same run depended on.
check('+. the shell adapter still reconciles counts',
  parseShellGates(['  A PASS (x)', 'X: PASS=9 FAIL=0'].join('\n')).mismatch !== null);

console.log(failures === 0
  ? `\n✓ VALIDATION_RUNNER_REGRESSIONS=PASS\n`
  : `\n✗ VALIDATION_RUNNER_REGRESSIONS=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
