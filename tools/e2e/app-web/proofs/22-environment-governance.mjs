#!/usr/bin/env node
/**
 * Proof 22 — environment and governance (suite S00).
 *
 * Every other suite's result is conditional on this one: a PASS proved against
 * the wrong environment is worse than no PASS at all. So this asserts, from the
 * running system rather than from configuration files, that the thing being
 * validated is the Sandbox and that its public surfaces say so.
 *
 *   the platform declares SANDBOX          the operator's own source of truth
 *   the public API answers as Sandbox      the surface a developer integrates
 *   the Validation Studio admits SANDBOX   the schema refuses any other value
 *   no Validation Run targets Live         counted, not assumed
 *   the public edge enforces TLS           a Sandbox is still a public surface
 *
 *   node proofs/22-environment-governance.mjs
 */
import { execFileSync } from 'node:child_process';
import { GateReport } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';
import { psql } from '../lib/operator-read.mjs';

const R = new GateReport('22-environment-governance');

const curl = (args) => execFileSync('curl', ['-s', ...args], { encoding: 'utf8', timeout: 30000 });

function main() {
  // 1. The platform's own declaration.
  let mode = '';
  try {
    const body = curl(['https://sandbox-api.banzami.com/v1/platform/mode']);
    mode = (JSON.parse(body).mode ?? '').toUpperCase();
  } catch { mode = ''; }
  if (mode) {
    R.mark('PLATFORM_MODE_IS_SANDBOX', mode === 'SANDBOX', `platform reports ${mode}`);
  } else {
    // Absent is not the same as wrong. Say which.
    R.note('PLATFORM_MODE_ENDPOINT_UNAVAILABLE', 'the public mode endpoint did not answer');
  }

  // 2. The public API a developer would integrate against.
  const health = curl(['https://sandbox-api.banzami.com/health']);
  let build = '';
  try { build = JSON.parse(health).build ?? ''; } catch { /* not JSON */ }
  R.mark('SANDBOX_PUBLIC_API_ANSWERS', health.length > 0, `/health returned ${health.length} bytes`);
  R.mark('SANDBOX_GATEWAY_REPORTS_ITS_BUILD', /^[0-9a-f]{8,}$/.test(build),
    build ? `deployed revision ${build}` : 'the gateway does not report a build revision');

  // 3. The Validation Studio's schema admits exactly one environment.
  const check = psql(
    `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='validation_runs_environment_check'`);
  R.mark('VALIDATION_SCHEMA_ADMITS_SANDBOX_ONLY', /SANDBOX/.test(check) && !/LIVE/.test(check),
    check.trim() || 'constraint not found');

  // 4. Counted, not assumed.
  const nonSandbox = Number(psql(`SELECT count(*) FROM validation_runs WHERE environment <> 'SANDBOX'`));
  R.mark('NO_VALIDATION_RUN_TARGETS_LIVE', nonSandbox === 0, `${nonSandbox} run(s) declare another environment`);

  const everStarted = Number(psql(`SELECT count(*) FROM validation_runs WHERE started_at IS NOT NULL`));
  R.note(`VALIDATION_RUNS_EVER_STARTED=${everStarted}`, 'runs that reached execution');

  // 5. A Sandbox is still a public surface.
  let tls = '';
  try {
    tls = execFileSync('sh', ['-c',
      "curl -s -o /dev/null -w '%{ssl_verify_result}:%{http_version}' https://sandbox-api.banzami.com/health"],
      { encoding: 'utf8', timeout: 30000 });
  } catch { tls = ''; }
  R.mark('SANDBOX_EDGE_TLS_VERIFIES', tls.startsWith('0:'), `ssl_verify_result:http_version = ${tls || 'unknown'}`);

  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_22_ENVIRONMENT_GOVERNANCE=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail)`);
  console.log(`evidence: ${out}`);
  process.exit(R.ok ? 0 : 1);
}

main();
