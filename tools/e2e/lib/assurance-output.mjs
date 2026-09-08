/**
 * Where generated assurance evidence goes — and why it is not the source tree.
 *
 * The golden journey used to write its result to a fixed path inside the
 * repository. That produced a release invariant nothing could satisfy:
 *
 *     run the canonical post-deploy verification
 *       → the tracked source tree becomes dirty
 *       → commit the evidence to clean it
 *       → HEAD changes, so the verified revision is no longer the head
 *       → verify again
 *       → dirty again
 *
 * The loop is not an inconvenience, it is a category error. A post-deploy
 * verification observes a runtime; its output is a fact ABOUT a revision and
 * cannot be part of that revision. Committing it makes the artifact describe a
 * commit that no longer exists by the time it is stored.
 *
 * So ownership is split, permanently:
 *
 *     release input   tracked source, tests, static fixtures, expectations
 *     verification    generated evidence, keyed by the revision it observed,
 *                     written OUTSIDE the worktree
 *
 * The default destination is outside the tree on purpose. A harness that
 * silently defaulted into `evidence/` and had to be told not to would put the
 * burden on whoever runs it, and the release ceremony is exactly when someone
 * forgets. Writing into the repository is now something you have to ask for by
 * name, and the cleanliness guard fails if anything does.
 *
 * Destination, in order:
 *   1. $EVIDENCE_OUT_DIR                      — explicit, wins over everything
 *   2. $BANZAMI_ASSURANCE_ROOT/<sha>/<suite>  — an operator-chosen root
 *   3. <tmpdir>/banzami-assurance/<sha>/<suite>
 *
 * The revision is part of the path so two runs against two runtimes cannot
 * overwrite each other, which is the other half of the same mistake.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

/** The revision under test. Explicit env wins; otherwise ask git. */
export function candidateSha(fallback = 'unknown') {
  const env = process.env.BANZAMI_CANDIDATE_SHA || process.env.GITHUB_SHA;
  if (env && /^[0-9a-f]{7,40}$/i.test(env)) return env;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

/**
 * Resolve (and create) the directory for one suite's generated evidence.
 * Never inside the worktree unless EVIDENCE_OUT_DIR explicitly points there.
 */
export function assuranceDir(suiteSlug, sha = candidateSha()) {
  const explicit = process.env.EVIDENCE_OUT_DIR;
  const dir = explicit
    ? resolve(explicit)
    : join(process.env.BANZAMI_ASSURANCE_ROOT || join(tmpdir(), 'banzami-assurance'),
           sha, suiteSlug);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * The result contract every canonical suite emits, alongside its own payload.
 *
 * It exists so release orchestration stops reading prose. A gate that greps a
 * human-readable line for "PASS" or "FAIL" cannot tell `FAIL=0` from `FAIL=1` —
 * and on 2026-09-09 one did not, reporting four green suites as four failures.
 * `verdict` is computed here, once, from numbers.
 */
export function writeAssuranceResult({
  suiteSlug, suite, candidate_sha, runtime_sha, environment = null,
  pass = 0, fail = 0, blocked = 0, simulated = 0,
  started_at = null, completed_at = new Date().toISOString(),
  payload = {},
}) {
  const sha = candidate_sha || candidateSha();
  const dir = assuranceDir(suiteSlug, sha);
  // Blocked assertions are not passes. A suite that could not run a required
  // check has not proved it, and must not aggregate to a green verdict.
  const verdict = fail === 0 && blocked === 0 && pass > 0 ? 'PASS' : 'FAIL';
  const result = {
    schema: 'banzami-assurance-result/v1',
    suite, suite_slug: suiteSlug,
    candidate_sha: sha, runtime_sha: runtime_sha ?? null, environment,
    pass, fail, blocked, simulated, verdict,
    started_at, completed_at,
    ...payload,
  };
  const file = join(dir, `${suiteSlug}.json`);
  writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
  return { file, dir, result, verdict };
}
