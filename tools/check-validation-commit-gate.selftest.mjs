#!/usr/bin/env node
/**
 * Prove the pre-commit gate can actually block a commit.
 *
 * On 2026-09-19 a failing registry guard did not stop a commit, because the
 * command line separated the check from the write with `;`. This asserts the
 * replacement is structural: git runs it, and a red guard refuses the write.
 *
 * It runs against a THROWAWAY repository, never this one — a test that has to
 * dirty the real tree to prove itself is a test nobody will run twice.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const check = (t, ok, d = '') => { if (ok) return console.log(`  ✓ ${t}`); console.log(`  ✗ ${t}${d ? `\n      ${d}` : ''}`); failures++; };

console.log('\nvalidation commit gate — mutation proof\n');

const box = mkdtempSync(join(tmpdir(), 'bz-gate-'));
// stdio fully piped: this test makes a guard fail ON PURPOSE, and letting that
// "✗ COMMIT BLOCKED" reach the terminal makes a passing suite read as a broken
// one. An intentional failure that looks like a real one is its own defect.
const sh = (cmd, env = {}) => execFileSync('bash', ['-c', cmd],
  { cwd: box, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
const tryShell = (cmd, env = {}) => { try { return { ok: true, out: sh(cmd, env) }; } catch (e) { return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }; } };

try {
  sh('git init -q . && git config user.email t@t && git config user.name t');
  // The inner Makefile prints the intentional failure; keep it inside this box.
  mkdirSync(join(box, '.githooks'), { recursive: true });
  copyFileSync(join(repo, '.githooks/pre-commit'), join(box, '.githooks/pre-commit'));
  chmodSync(join(box, '.githooks/pre-commit'), 0o755);
  sh('git config core.hooksPath .githooks');
  mkdirSync(join(box, 'quality/validation'), { recursive: true });

  // A guard that FAILS.
  writeFileSync(join(box, 'Makefile'), 'check-validation:\n\t@echo "  ✗ SOMETHING=FAIL"; exit 1\n');
  writeFileSync(join(box, 'quality/validation/journeys.yaml'), 'journeys: []\n');
  sh('git add -A');
  const blocked = tryShell('git commit -q -m "touches validation"');
  check('a failing guard blocks the commit', !blocked.ok, blocked.out.slice(0, 120));
  check('…and says why', /COMMIT BLOCKED/.test(blocked.out), blocked.out.slice(0, 200));
  const count = tryShell('git rev-list --count HEAD 2>/dev/null');
  check('…and nothing was written', !count.ok || count.out.trim() === '0', `HEAD has ${count.out.trim()} commit(s)`);

  // The same commit with a guard that PASSES.
  writeFileSync(join(box, 'Makefile'), 'check-validation:\n\t@echo ok\n');
  sh('git add -A');
  const allowed = tryShell('git commit -q -m "touches validation"');
  check('a passing guard allows it', allowed.ok, allowed.out.slice(0, 200));

  // A commit that touches nothing validation-owned must not pay the cost.
  writeFileSync(join(box, 'Makefile'), 'check-validation:\n\t@echo "  ✗ FAIL"; exit 1\n');
  writeFileSync(join(box, 'unrelated.txt'), 'hello\n');
  sh('git add unrelated.txt');
  const unrelated = tryShell('git commit -q -m "nothing to do with validation" -- unrelated.txt');
  check('an unrelated commit is not gated', unrelated.ok, unrelated.out.slice(0, 200));

  // The escape hatch exists and is explicit.
  sh('git add -A');
  const bypass = tryShell('git commit -q -m "deliberate"', { BANZAMI_SKIP_VALIDATION_GATE: '1' });
  check('the documented bypass works, and only when asked for', bypass.ok, bypass.out.slice(0, 200));
} finally {
  rmSync(box, { recursive: true, force: true });
}

console.log(failures === 0
  ? `\n✓ VALIDATION_COMMIT_GATE=PASS\n`
  : `\n✗ VALIDATION_COMMIT_GATE=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
