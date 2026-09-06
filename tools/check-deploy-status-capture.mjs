#!/usr/bin/env node
/**
 * A deploy must not be able to report success for a build that failed.
 *
 * It could. `ssh ... docker build ... | grep -E ... || true` followed by
 * `build_rc=${PIPESTATUS[0]}` looks careful and is not: PIPESTATUS describes the
 * last pipeline the shell ran, and after `||` that pipeline is `true`. The
 * status read 0 for a website build that was failing to compile, and the deploy
 * went on to start the previous image and print "Deploy complete".
 *
 * That is the same family as the ssh wrappers that returned the status of their
 * own cleanup (RA-081): a command whose real verdict is discarded by whatever
 * ran after it.
 *
 * This gate flags the shape wherever it appears: a PIPESTATUS read that follows
 * a line ending in `|| true`.
 *
 * Usage: node tools/check-deploy-status-capture.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['.', 'tools', 'infra', 'scripts', 'tests'];
const SKIP = /node_modules|\.git|target|dist|\.next/;

function shells(dir, out = [], depth = 0) {
  if (depth > 6) return out;
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const f = join(dir, e);
    if (SKIP.test(f)) continue;
    let st; try { st = statSync(f); } catch { continue; }
    if (st.isDirectory()) shells(f, out, depth + 1);
    else if (f.endsWith('.sh')) out.push(f);
  }
  return out;
}

let failures = 0;
const files = [...new Set(ROOTS.flatMap((r) => shells(r)))];
console.log(`deploy status capture — ${files.length} shell script(s)\n`);

for (const f of files) {
  if (/check-deploy-status-capture/.test(f)) continue;
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((raw, i) => {
    if (!/PIPESTATUS/.test(raw) || raw.trim().startsWith('#')) return;
    // Walk back over blank lines and comments to the command that actually ran.
    let j = i - 1;
    while (j >= 0 && (lines[j].trim() === '' || lines[j].trim().startsWith('#'))) j -= 1;
    if (j >= 0 && /\|\|\s*true\s*$/.test(lines[j])) {
      failures += 1;
      console.error(`  ✗ ${f}:${i + 1} — PIPESTATUS read after a line ending in \`|| true\`,`);
      console.error('      which replaces it with the status of `true`.');
      console.error(`      ${lines[j].trim().slice(0, 100)}`);
    }
  });
}

console.log();
if (failures === 0) {
  console.log('✓ no build or deploy status is discarded by a following `|| true`');
  process.exit(0);
}
console.error(`✗ ${failures} place(s) where a failure can be reported as success`);
process.exit(1);
