#!/usr/bin/env node
/**
 * check-validation-studio-naming.mjs — one validation system, one name.
 *
 * The canonical name is **Banzami Validation Studio** and the application is
 * `apps/validation-studio` (owner decision D12). Phase A was drafted under a
 * different name and the documents were renamed in Phase B; this guard is what
 * stops the old name coming back, and what stops a second validation product
 * being created beside the one that exists.
 *
 * Two failures it exists for, and they are different failures:
 *
 *   the old name reappears — a document, schema or comment says "Validation
 *     Lab", and a reader goes looking for a system that is not there. Two names
 *     for one thing is the ambiguity CLAUDE.md §15 exists to prevent.
 *
 *   a parallel product appears — `apps/validation-lab`, a second registry, a
 *     second engine. REUSE > EXTEND > REFACTOR > REPLACE: the moment a second
 *     validation application exists, the two disagree exactly when it matters.
 *
 * Usage: node tools/check-validation-studio-naming.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
let failures = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failures += 1; };
const pass = (m) => console.log(`  ✓ ${m}`);

// This file necessarily contains the forbidden spellings in order to search for
// them, so it excludes itself. Assembled rather than written literally so the
// guard cannot match its own source through a different path.
const SELF = 'tools/check-validation-studio-naming.mjs';
const OLD_NAME = ['Validation', 'Lab'].join(' ');
const OLD_APP = ['apps/validation', 'lab'].join('-');
const OLD_DOCS = ['docs/validation', 'lab/'].join('/');

/**
 * Tracked files, read from the WORKING TREE rather than from HEAD.
 *
 * Reading `git show HEAD:<f>` was the first attempt and it was wrong twice: a
 * newly added file is not in HEAD, so it threw and was skipped — which is
 * precisely the file most likely to carry the drift — and a staged edit was
 * compared against its pre-edit content. The working tree is what the next
 * commit will contain, and it is what this must judge.
 */
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 })
  .split('\n').filter(Boolean).filter((f) => f !== SELF && !f.startsWith('.git/'));

function grepTracked(needle, label) {
  const hits = [];
  for (const f of tracked) {
    // Binary and vendored trees are not prose about this system.
    if (/node_modules\/|\.(png|jpg|jpeg|ico|woff2?|ttf|zip|y4m|webm|pdf|lock)$/.test(f)) continue;
    let src;
    try { src = readFileSync(resolve(ROOT, f), 'utf8'); }
    catch { continue; }                      // deleted in the worktree — nothing to judge
    if (src.includes(needle)) hits.push(f);
  }
  if (hits.length) fail(`${label}: ${hits.length} file(s) — ${hits.slice(0, 5).join(', ')}${hits.length > 5 ? ' …' : ''}`);
  else pass(`${label}: none`);
  return hits.length;
}

console.log('Banzami Validation Studio — naming and single-product guard\n');

// 1. The retired name must not reappear in tracked content.
grepTracked(OLD_NAME, `the retired system name does not appear`);
grepTracked(OLD_DOCS, `no reference to the retired documentation path`);

// 2. No parallel validation application.
if (existsSync(resolve(ROOT, OLD_APP))) fail(`a parallel validation application exists at ${OLD_APP}`);
else pass('no parallel validation application');

// 3. The canonical application is where it is supposed to be.
if (existsSync(resolve(ROOT, 'apps/validation-studio'))) pass('apps/validation-studio is present');
else fail('apps/validation-studio is missing — the canonical application must exist');

// 4. The canonical documentation is where it is supposed to be.
if (existsSync(resolve(ROOT, 'docs/validation/studio/README.md'))) pass('docs/validation/studio/ is the documentation home');
else fail('docs/validation/studio/README.md is missing');

if (failures) {
  console.error(`\n✗ VALIDATION_STUDIO_NAMING_DRIFT=${failures}`);
  process.exit(1);
}
console.log('\n✓ VALIDATION_STUDIO_NAMING_DRIFT=0');
