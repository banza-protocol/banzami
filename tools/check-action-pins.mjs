/**
 * Every pinned GitHub Action SHA must actually exist.
 *
 * `dart-lang/setup-dart` was pinned to a SHA that does not exist: it shared its
 * first seven characters with a real tag and then diverged, so it read as a
 * plausible pin in review and in every diff. The job failed at "Set up job",
 * before a single step ran — and nobody saw it, because the self-hosted runner
 * was offline and the job had never been dispatched.
 *
 * A pin that cannot resolve is not a stricter pin. It is a job that cannot run,
 * wearing the appearance of one that is carefully locked down.
 *
 * Checked against the GitHub API via `gh`, so it needs authentication and
 * network. Skips (exit 0) when `gh` is unavailable rather than failing a local
 * run for a reason unrelated to the change.
 *
 * Usage: node tools/check-action-pins.mjs [workflow.yml ...]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = '.github/workflows';
const files = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f)).map((f) => join(DIR, f));

try {
  execFileSync('gh', ['--version'], { stdio: 'ignore' });
} catch {
  console.log('gh unavailable — action-pin check skipped');
  process.exit(0);
}

const pins = new Map(); // "repo@sha" -> [files]
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/uses:\s*([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)@([0-9a-f]{40})/g)) {
    const key = `${m[1]}@${m[2]}`;
    pins.set(key, [...(pins.get(key) ?? []), f]);
  }
}

let bad = 0;
for (const [key, where] of [...pins].sort()) {
  const [repo, sha] = key.split('@');
  let ok = false;
  try {
    execFileSync('gh', ['api', `repos/${repo}/commits/${sha}`, '--jq', '.sha'], { stdio: 'ignore' });
    ok = true;
  } catch { /* unresolvable */ }
  console.log(`  ${ok ? '✓' : '✗'} ${repo}@${sha.slice(0, 8)}${ok ? '' : `  — does not exist (${[...new Set(where)].join(', ')})`}`);
  if (!ok) bad++;
}

if (pins.size === 0) {
  console.error('no pinned actions found — the pattern may have changed');
  process.exit(2);
}
console.log(`\n${bad === 0 ? '✓' : '✗'} ${pins.size - bad}/${pins.size} pinned actions resolve`);
process.exit(bad === 0 ? 0 : 1);
