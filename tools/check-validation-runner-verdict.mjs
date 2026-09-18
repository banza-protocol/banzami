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

const { runHarness } = await import('./validation-runner.mjs');

const harnessDir = join(repo, 'tools', '.verdict-fixtures');
mkdirSync(harnessDir, { recursive: true });

/** Write a fixture harness that exits `code` after writing `gates` (or nothing). */
function fixture(name, { code = 0, gates = null }) {
  const file = join(harnessDir, `${name}.mjs`);
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
  runHarness(fixture('ok', { gates: PASS }), 20000).ok, true);

check('a harness that exits non-zero fails even with passing gates',
  runHarness(fixture('exits1', { code: 1, gates: PASS }), 20000).ok, false);

check('a harness that exits 0 but records a FAIL gate fails',
  runHarness(fixture('gatefail', { gates: [...PASS, ...FAILG] }), 20000).ok, false);

// The one this guard exists for.
const silent = runHarness(fixture('silent', { gates: null }), 20000);
check('a harness that exits 0 and records NOTHING does not pass', silent.ok, false);
check('  …and says why', /no assertions/.test(silent.reason), true);

const onlyNotes = runHarness(fixture('notesonly', { gates: NOTES }), 20000);
check('a harness that records only measurements does not pass', onlyNotes.ok, false);

check('a harness that does not exist does not pass',
  runHarness('tools/.verdict-fixtures/absent.mjs', 20000).ok, false);

rmSync(harnessDir, { recursive: true, force: true });
rmSync(scratch, { recursive: true, force: true });

console.log(failures === 0
  ? '\nrunner verdict contract: OK\n'
  : `\nrunner verdict contract: ${failures} failure(s)\n`);
process.exit(failures === 0 ? 0 : 1);
