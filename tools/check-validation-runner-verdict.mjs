#!/usr/bin/env node
/**
 * check-validation-runner-verdict — a journey cannot pass on nothing.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * The runner decides a journey's outcome from two independent signals: the
 * harness's exit status and the assertions it wrote down. The dangerous case is
 * neither of the obvious ones — it is a harness that exits 0 and records
 * nothing, because the evidence was written somewhere the runner does not look.
 * That journey would be PASSED, the run would be green, and it would have
 * proved nothing at all.
 *
 * This drives the real `runHarness` against fixture harnesses that each exhibit
 * one behaviour, so the verdict contract is proven rather than asserted.
 *
 *   node tools/check-validation-runner-verdict.mjs
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

// The runner harvests from <TMPDIR>/banzami-assurance; point both at a scratch
// tree so this never reads or writes real evidence.
const scratch = mkdtempSync(join(tmpdir(), 'vs-verdict-'));
process.env.TMPDIR = scratch;
const evidence = join(scratch, 'banzami-assurance', 'fixture');
mkdirSync(evidence, { recursive: true });

const { runHarness, parseShellGates, scrub, harvestAssuranceJSON } = await import('./validation-runner.mjs');

// Fixtures live where a real harness lives, so they travel the runner's real
// entry point — allow-list included — rather than a test-only side door. They
// are removed on the way out, pass or fail.
const harnessDir = join(repo, 'tools/e2e/app-web/proofs');
const written = [];

/** Write a fixture harness that exits `code` after writing `gates` (or nothing). */
function fixture(name, { code = 0, gates = null }) {
  const file = join(harnessDir, `${name}.mjs`);
  written.push(file);
  const body = gates === null
    ? `process.exit(${code});`
    : `import { writeFileSync } from 'node:fs';\n` +
      `writeFileSync(${JSON.stringify(join(evidence, `${name}-`))} + Date.now() + '.json',\n` +
      `  JSON.stringify({ gates: ${JSON.stringify(gates)} }));\n` +
      `process.exit(${code});`;
  writeFileSync(file, body);
  return relative(repo, file);
}

let failures = 0;
const check = (title, actual, expected) => {
  if (actual === expected) { console.log(`  ✓ ${title}`); return; }
  console.log(`  ✗ ${title}\n      expected ${expected}, got ${actual}`);
  failures++;
};

console.log('\nrunner verdict contract\n');

const PASS = [{ gate: 'a', verdict: 'PASS', detail: '' }];
const FAILG = [{ gate: 'a', verdict: 'FAIL', detail: '' }];
const NOTES = [{ gate: 'n', verdict: 'NOTE', detail: '42' }];

check('a harness that exits 0 and asserts a PASS passes',
  runHarness(fixture('zz-fixture-ok', { gates: PASS }), 20000).ok, true);

check('a harness that exits non-zero fails even with passing gates',
  runHarness(fixture('zz-fixture-exits1', { code: 1, gates: PASS }), 20000).ok, false);

check('a harness that exits 0 but records a FAIL gate fails',
  runHarness(fixture('zz-fixture-gatefail', { gates: [...PASS, ...FAILG] }), 20000).ok, false);

// The one this guard exists for.
const silent = runHarness(fixture('zz-fixture-silent', { gates: null }), 20000);
check('a harness that exits 0 and records NOTHING does not pass', silent.ok, false);
check('  …and says why', /no assertions/.test(silent.reason), true);

const onlyNotes = runHarness(fixture('zz-fixture-notesonly', { gates: NOTES }), 20000);
check('a harness that records only measurements does not pass', onlyNotes.ok, false);

check('a harness that does not exist does not pass',
  runHarness('tools/e2e/app-web/proofs/zz-fixture-absent.mjs', 20000).ok, false);

// ── the shell adapter ────────────────────────────────────────────────────────
// A phase-0 harness prints its assertions and then its own totals. The adapter
// must either understand BOTH and agree, or say it did not understand.
console.log('\nshell harness adapter\n');

const good = ['  QR_PAID PASS (200)', '  QR_LEDGER PASS (ok)', 'QR_PAYMENT_E2E: PASS=2 FAIL=0'].join('\n');
const g1 = parseShellGates(good);
check('reads every assertion line', g1.gates.length, 2);
check('agrees with the harness totals', g1.mismatch, null);

const withFail = ['  A PASS (x)', '  B FAIL (got 500 want 200)', 'X_E2E: PASS=1 FAIL=1'].join('\n');
const g2 = parseShellGates(withFail);
check('records a failing assertion as FAIL', g2.gates.filter((g) => g.verdict === 'FAIL').length, 1);
check('a failing harness is still understood', g2.mismatch, null);

// The case this adapter exists to refuse: totals that do not match what was
// read. Reporting the subset it understood would be a confident partial truth.
const drifted = ['  A PASS (x)', 'X_E2E: PASS=7 FAIL=0'].join('\n');
const g3 = parseShellGates(drifted);
check('refuses a count it cannot reconcile', g3.mismatch !== null, true);
check('  …and says which side disagreed', /counted 7/.test(g3.mismatch ?? ''), true);

// The `### SUMMARY pass=n fail=n` dialect is the same contract in another
// spelling, and the canonical parser already knows it.
const lower = ['  A PASS (x)', '### SUMMARY pass=1 fail=0 simulated=0 blocked=0'].join('\n');
check('understands the ### SUMMARY dialect', parseShellGates(lower).mismatch, null);

// A blocked assertion could not run. It is neither a pass nor a measurement.
const blocked = ['  A PASS (x)', 'X_E2E: PASS=1 FAIL=0 BLOCKED=2'].join('\n');
const gb = parseShellGates(blocked);
check('a blocked assertion is not proved', gb.mismatch !== null, true);
check('  …and says how many', /2 assertion\(s\) blocked/.test(gb.mismatch ?? ''), true);

const silentShell = parseShellGates('doing some work\nfinished\n');
check('output with neither assertions nor a summary is not understood',
  silentShell.mismatch !== null, true);

check('a secret-shaped token never survives capture',
  /sk_/.test(scrub('key bz_test_sk_ABC123 used')), false);
check('a bearer token never survives capture',
  /abcdef/.test(scrub('Authorization: Bearer abcdefGHIJ.klm')), false);
check('a financial amount is NOT mistaken for a PIN',
  /750000 minor/.test(scrub('moved 750000 minor')), true);

console.log('');

// ── the assurance-json adapter ───────────────────────────────────────────────
// The non-app-web estate writes named booleans plus its own totals, in three
// spellings. One adapter reads all three and reconciles; a shape it does not
// recognise yields nothing, and nothing does not pass.
console.log('\nassurance-json adapter\n');

const { writeFileSync: wf } = await import('node:fs');
let n = 0;
const report = (obj) => {
  const stem = `zzrep${++n}`;
  wf(join(evidence, `${stem}-${Date.now()}.json`), JSON.stringify(obj));
  return stem;
};
const t0 = Date.now() - 1000;

const steps = harvestAssuranceJSON(report({
  steps: [{ n: 1, verdict: 'PASS' }, { n: 2, verdict: 'PASS' }], summary: { passed: 2, total: 2 },
}), t0);
check('reads the steps[] shape', steps.length, 2);
check('  …and reconciles against the summary', steps.some((g) => g.gate === 'ADAPTER_RECONCILED'), false);

const matrix = harvestAssuranceJSON(report({
  matrix: [{ id: 'A', ok: true }, { id: 'B', ok: false }], passed: 1, failed: 1,
}), t0);
check('reads the matrix[] shape', matrix.length, 2);
check('  …and records the failing row as FAIL',
  matrix.filter((g) => g.verdict === 'FAIL').length, 1);

// PENDING and NOT_RUN exist precisely so a step nobody ran cannot read as
// success. Only PASS is a pass.
const pending = harvestAssuranceJSON(report({
  steps: [{ n: 1, verdict: 'PASS' }, { n: 2, verdict: 'PENDING' }, { n: 3, verdict: 'NOT_RUN' }],
  summary: { passed: 1, total: 3 },
}), t0);
check('PENDING and NOT_RUN are not passes',
  pending.filter((g) => g.verdict === 'PASS').length, 1);

const drift = harvestAssuranceJSON(report({
  steps: [{ n: 1, verdict: 'PASS' }], summary: { passed: 9, total: 9 },
}), t0);
check('refuses totals it cannot reconcile',
  drift.some((g) => g.gate === 'ADAPTER_RECONCILED' && g.verdict === 'FAIL'), true);

check('an unrecognised shape yields no assertions',
  harvestAssuranceJSON(report({ whatever: [1, 2, 3] }), t0).length, 0);

console.log('');

// The allow-list is the other half: a declared harness path that is not one of
// the two known shapes must be refused outright, never executed.
for (const bad of ['/etc/passwd', '../../etc/passwd', 'tools/deploy.sh',
                   'tests/phase0/../../etc/passwd', 'tests/phase0/x; rm -rf /.sh']) {
  const r = runHarness(bad, 5000);
  check(`refuses an unlisted harness path: ${bad}`, r.ok, false);
  check('  …without executing it', /allow-listed/.test(r.reason), true);
}

for (const f of written) rmSync(f, { force: true });
rmSync(scratch, { recursive: true, force: true });

console.log(failures === 0
  ? '\nrunner verdict contract: OK\n'
  : `\nrunner verdict contract: ${failures} failure(s)\n`);
process.exit(failures === 0 ? 0 : 1);
