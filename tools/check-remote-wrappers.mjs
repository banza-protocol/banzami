#!/usr/bin/env node
/**
 * No script may run a proof over ssh and then throw away the answer.
 *
 * Six of them did, for weeks. The remote command ended with a cleanup `rm`, and
 * ssh reports the status of the last command it ran, so ledger reconciliation,
 * the canonical binding proof, both prunes and both audits returned 0 whatever
 * happened on the far side. A seventh did it in the deploy path, where the
 * output also went through `tail` — two independent ways to lose the verdict in
 * one line.
 *
 * This is the static gate for that. It reads every shell script and flags an
 * ssh invocation whose remote command ends in cleanup, or whose output is piped
 * into something that replaces its status.
 *
 * The canonical way to do it is tools/ops/lib/remote.sh, which captures the
 * status before cleaning up and returns it. Scripts that use it pass here
 * without a special case, because they contain no such ssh line at all.
 *
 * Usage: node tools/check-remote-wrappers.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['tests', 'tools', 'infra', 'scripts'];
const SKIP = /node_modules|\.git|target|dist/;

function shells(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const f = join(dir, e);
    if (SKIP.test(f)) continue;
    let st;
    try { st = statSync(f); } catch { continue; }
    if (st.isDirectory()) shells(f, out);
    else if (f.endsWith('.sh')) out.push(f);
  }
  return out;
}

let failures = 0;
const bad = (f, line, why, text) => {
  failures += 1;
  console.error(`  ✗ ${f}:${line} — ${why}`);
  console.error(`      ${text.trim().slice(0, 110)}`);
};

const files = ROOTS.flatMap((r) => shells(r));
console.log(`remote exit-status contract — ${files.length} shell script(s)\n`);

for (const f of files) {
  // The library itself contains the canonical pattern, and the self-test
  // deliberately constructs failing remote calls.
  if (/lib\/remote\.(sh|selftest\.sh)$/.test(f)) continue;

  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '');
    if (!/(^|\s)ssh\s/.test(line)) return;

    // A remote command whose last statement is cleanup: ssh returns that.
    if (/;\s*rm\s+-[a-z]*f[a-z]*\s+[^"']*["']\s*$/.test(line)) {
      bad(f, i + 1, 'the remote command ends in cleanup, so ssh returns the cleanup\'s status', raw);
      return;
    }
    // A pipeline: the status becomes the last stage's, not the proof's.
    if (/\|\s*(tail|head|grep|awk|sed|tr|cut)\b/.test(line) && !/\|\|/.test(line)) {
      bad(f, i + 1, 'the ssh output is piped, so the pipeline\'s status replaces the proof\'s', raw);
    }
  });
}

console.log();
if (failures === 0) {
  console.log('✓ no remote proof discards its own exit status');
  process.exit(0);
}
console.error(`✗ ${failures} place(s) where a remote failure can become a local success`);
console.error('  use tools/ops/lib/remote.sh');
process.exit(1);
