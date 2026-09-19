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
import { readFileSync, writeFileSync, chmodSync, mkdtempSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
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

/* ── the three defects found around the clean GOLDEN, BZV-20260919-0001 ──────
 *
 * None of them changed that run's verdict, which came from durable per-journey
 * reconciliation. All three are about what the runner does OUTSIDE a journey.
 */

// R-001. An unrecognised command line must stop before the Sandbox, not fall
//        through into main() with defaults. `--help` did exactly that: it
//        claimed the queued GOLDEN run and executed it.
const { parseArgv } = await import('./validation-runner.mjs');
const refuses = (argv) => { try { parseArgv(argv); return false; } catch { return true; } };

check('R-001. an unknown option is refused', refuses(['--halp']));
check('R-001. a bare argument is refused', refuses(['GOLDEN']));
check('R-001. a value-taking option with no value is refused', refuses(['--run']));
check('R-001. an option cannot swallow the next option as its value', refuses(['--run', '--dry-run']),
  'otherwise --run --dry-run claims a run literally named "--dry-run"');
check('R-001. a repeated option is refused', refuses(['--dry-run', '--dry-run']));
check('R-001. --profile without --dry-run is refused', refuses(['--profile', 'FULL']),
  'a claimed run names its own profile; silently ignoring this reads as a request to run FULL');
check('R-001. --help parses and asks for nothing else', parseArgv(['--help']).help === true);
check('R-001. an empty command line still means "claim the oldest QUEUED"',
  parseArgv([]).help === false && parseArgv([]).dryRun === false && parseArgv([]).run === undefined);
check('R-001. parsing happens before the environment is proven',
  src.indexOf('parseArgv(process.argv') < src.indexOf('proveEnvironment();\n\n  if (cli.dryRun)'),
  'proveEnvironment opens the database; nothing may reach it on a command line we did not understand');

// The behavioural half: with a shimmed ssh that records every attempt, these
// command lines must produce NO attempt at all. The control below proves the
// shim can see one, so a silent zero is not the detector being broken.
const shim = mkdtempSync(join(tmpdir(), 'bzrunner-'));
const marker = join(shim, 'attempts');
writeFileSync(join(shim, 'ssh'), `#!/bin/sh\necho "$*" >> ${marker}\nexit 255\n`);
chmodSync(join(shim, 'ssh'), 0o755);
const attempts = (args) => {
  try { unlinkSync(marker); } catch { /* first run */ }
  const r = spawnSync(process.execPath, [RUNNER, ...args],
    { env: { ...process.env, PATH: `${shim}:${process.env.PATH}` }, encoding: 'utf8' });
  return { code: r.status, n: existsSync(marker) ? readFileSync(marker, 'utf8').trim().split('\n').length : 0 };
};

const control = attempts(['--dry-run']);
check('R-001. (control) the ssh detector can see a database attempt', control.n > 0,
  'if this is 0 the checks below prove nothing');
for (const bad of [['--help'], ['--halp'], ['--run'], ['GOLDEN']]) {
  const r = attempts(bad);
  check(`R-001. \`${bad.join(' ')}\` reaches no database`, r.n === 0, `${r.n} attempt(s)`);
  check(`R-001. \`${bad.join(' ')}\` exits ${bad[0] === '--help' ? '0' : 'non-zero'}`,
    bad[0] === '--help' ? r.code === 0 : r.code !== 0, `exit ${r.code}`);
}
rmSync(shim, { recursive: true, force: true });

// R-002. The console summary is a read-back of the committed record, not a
//        second opinion assembled from this process's counters.
check('R-002. the summary is read back from the database',
  /function summarise\([\s\S]*?FROM validation_runs r WHERE r\.id/.test(src));
check('R-002. it runs after the terminal state is persisted',
  src.indexOf("SET state='COMPLETED'") < src.indexOf('summarise(run.id'));
check('R-002. journey counts come from validation_run_journeys, not variables',
  /summarise\([\s\S]*?FROM validation_run_journeys j/.test(src));
check('R-002. the evidence count comes from validation_evidence',
  /summarise\([\s\S]*?FROM validation_evidence e/.test(src));
check('R-002. a divergence from the executor\'s own counters is stated, not hidden',
  /DIVERGENCE the executor counted/.test(src));
check('R-002. an unreadable read-back does not invent a summary',
  /could not be read back for display/.test(src) && !/summarise[\s\S]*?expected\.passed\}\s*passed/.test(src));

// R-003. The static assertion count is an estimate and must never be printed as
//        a fact. The plan said 115; the run recorded 112, wrong in both
//        directions across journeys.
const plan = JSON.parse(spawnSync(process.execPath,
  [join(repo, 'tools/validation-full-plan.mjs'), '--profile', 'GOLDEN', '--json'],
  { encoding: 'utf8', maxBuffer: 1 << 24 }).stdout);
const executable = plan.rows.filter((r) => r.applicability === 'EXECUTABLE');
check('R-003. the plan resolves its journeys', executable.length > 0);
check('R-003. every assertion figure carries its precision',
  executable.every((r) => r.assertionsPrecision === 'ESTIMATE' || r.assertionsPrecision === 'UNKNOWN'),
  'a bare integer is read as a count by whoever quotes it next');
check('R-003. no journey claims an exact planned count',
  executable.every((r) => r.assertionsPrecision !== 'EXACT'),
  'nothing derives one today: no harness publishes its own assertion inventory');
check('R-003. the rendered table marks the estimate in its header',
  spawnSync(process.execPath, [join(repo, 'tools/validation-full-plan.mjs'), '--profile', 'GOLDEN'],
    { encoding: 'utf8' }).stdout.includes('~ASRT is an ESTIMATE from static source, not a count'));

console.log(failures === 0
  ? `\n✓ VALIDATION_RUNNER_REGRESSIONS=PASS\n`
  : `\n✗ VALIDATION_RUNNER_REGRESSIONS=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
