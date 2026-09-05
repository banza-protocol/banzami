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
 * Checked against the GitHub REST API over plain fetch — NOT via `gh`. The
 * first version shelled out to `gh`, which is not installed on the CI runner
 * image, so the step printed "gh unavailable — skipped" and passed. A guard that
 * skips in the one place it is meant to run is the same vacuity it exists to
 * catch.
 *
 * Uses GITHUB_TOKEN / GH_TOKEN when present (CI supplies one); unauthenticated
 * requests work too, at a lower rate limit. Exits non-zero on an unresolvable
 * pin, and only skips when the API itself is unreachable — which it reports.
 *
 * Usage: node tools/check-action-pins.mjs [workflow.yml ...]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = '.github/workflows';
const files = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f)).map((f) => join(DIR, f));

const pins = new Map(); // "repo@sha" -> [files]
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/uses:\s*([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)@([0-9a-f]{40})/g)) {
    const key = `${m[1]}@${m[2]}`;
    pins.set(key, [...(pins.get(key) ?? []), f]);
  }
}

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'banzami-action-pin-check',
  ...(token ? { authorization: `Bearer ${token}` } : {}),
};

let bad = 0;
let unreachable = 0;
for (const [key, where] of [...pins].sort()) {
  const [repo, sha] = key.split('@');
  let state; // 'ok' | 'missing' | 'unreachable'
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}`, { headers });
    if (r.status === 200) state = 'ok';
    else if (r.status === 404 || r.status === 422) state = 'missing';
    else state = 'unreachable';           // rate limit, auth, outage
  } catch {
    state = 'unreachable';
  }
  const mark = { ok: '\u2713', missing: '\u2717', unreachable: '\u00b7' }[state];
  const note = state === 'missing' ? `  \u2014 does not exist (${[...new Set(where)].join(', ')})`
    : state === 'unreachable' ? '  \u2014 could not be checked' : '';
  console.log(`  ${mark} ${repo}@${sha.slice(0, 8)}${note}`);
  if (state === 'missing') bad++;
  if (state === 'unreachable') unreachable++;
}

if (pins.size === 0) {
  console.error('no pinned actions found — the pattern may have changed');
  process.exit(2);
}
console.log(`\n${bad === 0 ? '✓' : '✗'} ${pins.size - bad - unreachable}/${pins.size} pinned actions resolve`
  + (unreachable ? ` (${unreachable} could not be checked)` : ''));
if (bad > 0) process.exit(1);
// Every pin unreachable means the API was, not that the pins are fine — say so
// rather than reporting a pass nobody earned.
if (unreachable === pins.size) {
  console.error('the GitHub API was unreachable for every pin — nothing was verified');
  process.exit(0);
}
process.exit(0);
