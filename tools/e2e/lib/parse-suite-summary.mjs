/**
 * Reading a suite's verdict without guessing.
 *
 * On 2026-09-09 a release check classified four passing suites as failures. It
 * used `grep -oE "PASS|FAIL"` over the output, and every suite ends with a line
 * like:
 *
 *     SETTLEMENT_ECONOMICS_E2E: PASS=24 FAIL=0
 *
 * The substring `FAIL` is present in a perfect run — it is the label of the
 * zero. Fragment matching cannot distinguish "failed" from "zero failures",
 * because the distinction is in the NUMBER, and the pattern never looked at it.
 *
 * The lesson is not "use a better regex". It is that a release gate must not
 * infer a verdict from prose at all. Prefer, in order:
 *
 *   1. the process exit status,
 *   2. the machine-readable result (banzami-assurance-result/v1),
 *   3. and only then, this — an ANCHORED parse of a declared summary line,
 *      for suites whose output contract is still textual.
 *
 * This never returns a verdict it had to guess: an unparseable summary is
 * `null`, which callers must treat as "unknown", never as "pass".
 */

/** Matches an anchored `NAME: PASS=<n> FAIL=<n>` summary with optional extras. */
const SUMMARY = /^\s*([A-Z0-9_]+)\s*:\s*PASS=(\d+)\s+FAIL=(\d+)(?:\s+BLOCKED=(\d+))?(?:\s+SIMULATED=(\d+))?\s*$/;

/** Matches the `### SUMMARY pass=n fail=n simulated=n blocked=n` shape. */
const SUMMARY_LOWER = /^\s*#*\s*SUMMARY\s+pass=(\d+)\s+fail=(\d+)(?:\s+simulated=(\d+))?(?:\s+blocked=(\d+))?\s*$/i;

/**
 * Parse a suite's stdout. Returns null when no summary line is present —
 * "no summary" is not a pass.
 */
export function parseSuiteSummary(output) {
  for (const line of String(output).split('\n').reverse()) {
    let m = SUMMARY.exec(line);
    if (m) {
      const [, name, pass, fail, blocked, simulated] = m;
      return build(name, +pass, +fail, +(blocked ?? 0), +(simulated ?? 0));
    }
    m = SUMMARY_LOWER.exec(line);
    if (m) {
      const [, pass, fail, simulated, blocked] = m;
      return build(null, +pass, +fail, +(blocked ?? 0), +(simulated ?? 0));
    }
  }
  return null;
}

function build(suite, pass, fail, blocked, simulated) {
  // A suite that ran nothing has proved nothing, and a blocked required check
  // is not a pass — both would otherwise aggregate to green on zero failures.
  const verdict = fail === 0 && blocked === 0 && pass > 0 ? 'PASS' : 'FAIL';
  return { suite, pass, fail, blocked, simulated, verdict };
}

/**
 * The verdict for one suite run, trusting exit status first.
 * `exitCode` may be null when the caller genuinely has no status to offer.
 */
export function suiteVerdict({ exitCode = null, output = '' }) {
  const parsed = parseSuiteSummary(output);
  if (exitCode !== null && exitCode !== 0) {
    return { ...(parsed ?? { pass: 0, fail: 0, blocked: 0, simulated: 0 }),
             verdict: 'FAIL', reason: `exit ${exitCode}` };
  }
  if (!parsed) return { verdict: 'UNKNOWN', reason: 'no parseable summary line' };
  return parsed;
}
