#!/usr/bin/env node
/**
 * Run the canonical post-deploy suites and produce ONE machine-readable result.
 *
 * This exists because release verdicts were being read out of prose. The gate
 * grepped each suite's output for "PASS" or "FAIL", and since a perfect run
 * prints `FAIL=0`, four green suites were reported as four failures. The
 * verdict lives in numbers and exit codes; nothing here scrapes English.
 *
 * Order of trust, per suite:
 *   1. process exit status
 *   2. the anchored summary line (tools/e2e/lib/parse-suite-summary.mjs)
 *   3. nothing else — an unparseable suite is UNKNOWN, never PASS
 *
 * Generated evidence is written outside the worktree, keyed by the revision it
 * observed. Running this must never modify the revision it verifies.
 *
 *   node tools/e2e/run-assurance.mjs [--remote root@host] [--suite name]...
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { suiteVerdict } from './lib/parse-suite-summary.mjs';
import { assuranceDir, candidateSha, writeAssuranceResult } from './lib/assurance-output.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// The suites that run ON the Sandbox VM against the deployed runtime.
const REMOTE_SUITES = [
  'settlement-economics-e2e',
  'economic-model-smoke',
  'campaign-payment-segregation',
  'developer-platform-e2e',
];
// Suites that run locally against the deployed public surface.
const LOCAL_SUITES = [
  { slug: 'developer-golden-journey',
    cmd: ['node', 'tools/e2e/golden/developer-golden-journey-e2e.mjs'],
    env: { BANZAMI_E2E: 'RUN' } },
];

const args = process.argv.slice(2);
const remote = args.includes('--remote') ? args[args.indexOf('--remote') + 1] : 'root@217.160.9.248';
const only = args.reduce((a, v, i) => (v === '--suite' ? [...a, args[i + 1]] : a), []);
const wanted = (s) => only.length === 0 || only.includes(s);

const sha = candidateSha();
const started = new Date().toISOString();
const runs = [];

for (const slug of REMOTE_SUITES.filter(wanted)) {
  process.stdout.write(`  ${slug.padEnd(32)}`);
  execFileSync('scp', ['-q', join(ROOT, `tests/phase0/${slug}.sh`), `${remote}:/tmp/${slug}.sh`]);
  const r = spawnSync('ssh', ['-o', 'ConnectTimeout=25', remote, `bash /tmp/${slug}.sh`],
                      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const v = suiteVerdict({ exitCode: r.status, output: `${r.stdout}\n${r.stderr}` });
  runs.push({ suite: slug, where: 'vm', exit_code: r.status, ...v });
  console.log(`${v.verdict}${v.pass !== undefined ? ` (${v.pass}/${v.pass + v.fail})` : ''}`);
}

for (const { slug, cmd, env } of LOCAL_SUITES.filter((s) => wanted(s.slug))) {
  process.stdout.write(`  ${slug.padEnd(32)}`);
  const r = spawnSync(cmd[0], cmd.slice(1),
                      { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env },
                        maxBuffer: 64 * 1024 * 1024 });
  // The golden journey has no summary line; its exit status is the contract.
  const m = /(\d+)\/(\d+) PASS/.exec(r.stdout ?? '');
  const pass = m ? +m[1] : 0, total = m ? +m[2] : 0;
  const verdict = r.status === 0 && total > 0 && pass === total ? 'PASS' : 'FAIL';
  runs.push({ suite: slug, where: 'local', exit_code: r.status,
              pass, fail: total - pass, blocked: 0, simulated: 0, verdict });
  console.log(`${verdict} (${pass}/${total})`);
}

const failed = runs.filter((r) => r.verdict !== 'PASS');
const { file } = writeAssuranceResult({
  suiteSlug: 'post-deploy',
  suite: 'BANZAMI CANONICAL POST-DEPLOY ASSURANCE',
  candidate_sha: sha,
  pass: runs.filter((r) => r.verdict === 'PASS').length,
  fail: failed.length,
  simulated: runs.reduce((n, r) => n + (r.simulated ?? 0), 0),
  blocked: runs.reduce((n, r) => n + (r.blocked ?? 0), 0),
  started_at: started,
  payload: { suites: runs },
});

console.log(`\n  evidence: ${file}`);
console.log(`  verdict:  ${failed.length === 0 ? 'PASS' : `FAIL (${failed.map((f) => f.suite).join(', ')})`}`);
process.exit(failed.length === 0 ? 0 : 1);
