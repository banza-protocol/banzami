/**
 * Is the deployed runtime current enough for evidence to be about today's code?
 *
 * Equating "deployed build" with "repository HEAD" is too strict and quietly
 * corrosive: every docs or evidence commit invalidates a perfectly good
 * deployment, so the honest gate starts failing for dishonest reasons and the
 * pressure becomes to bypass it. But loosening it to "close enough" is how Stage E
 * found a Sandbox running images 105 commits behind main.
 *
 * The distinction that actually matters is whether the diff between the deployed
 * commit and HEAD contains anything that is COMPILED INTO or CONFIGURES the
 * running services. The sandbox images are built from `core/` and `services/`
 * (see svc_build_spec in remote-native-build.sh); `infra/` shapes how they are
 * built and wired; `db/migrations/` defines the schema they run against.
 *
 * Fail-closed by construction: a path in neither list is treated as
 * runtime-affecting. A new top-level directory should make this say "redeploy",
 * not silently pass.
 */
import { execFileSync } from 'node:child_process';

/** Changing any of these can change what the deployed binaries do. */
const RUNTIME_PREFIXES = ['core/', 'services/', 'infra/', 'db/migrations/'];

/**
 * Explicitly NOT built into the sandbox services. Each is listed with why, so the
 * list stays reviewable instead of accumulating whatever was convenient.
 */
const NON_RUNTIME_PREFIXES = [
  'docs/',        // documentation
  'evidence/',    // assurance artifacts
  'quality/',     // assurance manifest — metadata about the runtime, not the runtime
  'tools/',       // operator/test tooling, executed from a workstation
  'apps/',        // websites and mobile apps — deployed separately, not in these images
  'sdk/',         // client libraries, published separately
  'plugins/',     // commerce platform integrations
  'ops/',         // asset inventory
  '.github/',     // CI
];

const isRuntimePath = (p) => RUNTIME_PREFIXES.some((r) => p.startsWith(r));
const isKnownNonRuntime = (p) => NON_RUNTIME_PREFIXES.some((r) => p.startsWith(r));

/**
 * Returns { current, headCommit, runtimeCommit, runtimeAffecting, nonRuntime }.
 * `current` is true when the deployed build is HEAD, or differs from HEAD only by
 * files that cannot change service behaviour.
 */
export function assessRuntimeFreshness(runtimeCommit) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head.startsWith(runtimeCommit) || runtimeCommit.startsWith(head)) {
    return { current: true, headCommit: head, runtimeCommit, runtimeAffecting: [], nonRuntime: [], exact: true };
  }

  let changed;
  try {
    changed = execFileSync('git', ['diff', '--name-only', `${runtimeCommit}..HEAD`], { encoding: 'utf8' })
      .split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    // The deployed commit is not in this repository — it cannot be reasoned about,
    // so it is not acceptable.
    return { current: false, headCommit: head, runtimeCommit, runtimeAffecting: ['<commit unknown to this repository>'], nonRuntime: [], exact: false };
  }

  // Unclassified paths count as runtime-affecting: an unrecognised directory must
  // demand a redeploy rather than slip through.
  const runtimeAffecting = changed.filter((p) => isRuntimePath(p) || !isKnownNonRuntime(p));
  const nonRuntime = changed.filter((p) => !runtimeAffecting.includes(p));

  return { current: runtimeAffecting.length === 0, headCommit: head, runtimeCommit, runtimeAffecting, nonRuntime, exact: false };
}
