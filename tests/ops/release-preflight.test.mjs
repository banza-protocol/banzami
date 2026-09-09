/**
 * The release preflight, and the cleanup classification it feeds.
 *
 * Disk exhaustion stopped this programme twice. The second time it killed a
 * Rust attestation build partway through and left the Docker daemon
 * unresponsive — ENOSPC does not announce itself as "no disk", it arrives as a
 * compiler error or a hang, long after the decision that caused it.
 *
 * These assertions cover the two halves that matter: the gate refuses before an
 * expensive build, and the cleanup it suggests can never select something whose
 * loss would break the provenance chain.
 *
 * No test here fills a filesystem. Capacity is injected.
 *
 * Run: node tests/ops/release-preflight.test.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FLOOR_GIB, preflight, freeGiB, requiredGiB, regenerableConsumers, PROTECTED, recordBuildConsumption }
  from '../../tools/release/preflight.mjs';

let pass = 0, fail = 0;
const ok = (d) => { console.log(`  \x1b[0;32m✓\x1b[0m ${d}`); pass++; };
const no = (d, got) => { console.log(`  \x1b[0;31m✗\x1b[0m ${d} — ${got}`); fail++; };
const is = (d, cond, got = '') => (cond ? ok(d) : no(d, got));

console.log('\n▸ sufficient capacity passes, insufficient capacity fails BEFORE the build');
// Injected, not simulated by filling a disk: ask for less than is free, then more.
const free = freeGiB();
is('a requirement below free space passes',
   preflight({ requireGib: Math.max(0.01, free / 2) }).checks[0].ok, 'capacity check failed');
const tight = preflight({ requireGib: free + 1000 });
is('a requirement above free space fails', tight.checks[0].ok === false, 'capacity check passed');
is('the failure names available and required',
   /GiB free/.test(tight.checks[0].detail) && /GiB required/.test(tight.checks[0].detail),
   tight.checks[0].detail);
is('a failing preflight yields a FAIL verdict', tight.verdict === 'FAIL', tight.verdict);

console.log('\n▸ the threshold is derived, not invented');
const req = requiredGiB();
is('an uncalibrated requirement states its bounds',
   req.source === 'env' || /floor|calibrated/.test(req.source), req.source);
is('the floor sits inside the observed interval (>2.3 failed, <13 succeeded)',
   FLOOR_GIB > 2.3 && FLOOR_GIB < 13, `FLOOR_GIB=${FLOOR_GIB}`);

console.log('\n▸ calibration replaces the guess with a measurement');
const store = mkdtempSync(join(tmpdir(), 'bz-cal-'));
process.env.BANZAMI_ASSURANCE_STORE = store;
const rec = recordBuildConsumption({ beforeGiB: 20, afterGiB: 11, sha: 'deadbeef' });
is('consumption is recorded as the peak', rec.peak_build_gib === 9, `${rec.peak_build_gib}`);
const calibrated = requiredGiB();
is('the requirement then comes from the measurement',
   /calibrated/.test(calibrated.source) && calibrated.gib >= 9, `${calibrated.gib} · ${calibrated.source}`);
is('a smaller later build does not lower the peak',
   recordBuildConsumption({ beforeGiB: 20, afterGiB: 19 }).peak_build_gib === 9, 'peak moved down');
rmSync(store, { recursive: true, force: true });
delete process.env.BANZAMI_ASSURANCE_STORE;

console.log('\n▸ cleanup classification never selects protected artefacts');
const consumers = regenerableConsumers();
is('every candidate is a regenerable build product',
   consumers.every((c) => /banzami-(blueprint-release|source-deploy|blueprint-runner-lab)/.test(c.path)),
   consumers.map((c) => c.path).join(', '));
is('no candidate is the assurance store',
   !consumers.some((c) => c.path.includes('.banzami/assurance')), 'assurance store listed');
is('no candidate is a secret, database or runtime path',
   !consumers.some((c) => /run\/secrets|postgres|\.env|releases\//.test(c.path)), 'protected path listed');
is('provenance manifests are named as protected',
   PROTECTED.some((p) => p.includes('manifest.json')) && PROTECTED.some((p) => p.includes('receipt')),
   PROTECTED.join(' | '));
is('the source-bundle entry warns that manifests must be kept',
   consumers.every((c) => !c.path.includes('source-deploy') || /PROVENANCE/.test(c.what)),
   'source-deploy entry lacks the provenance warning');

console.log('\n▸ a hung docker daemon is a preflight failure, not a build failure');
const checks = preflight({ requireGib: 0.01 }).checks.map((c) => c.name);
is('the daemon is checked before the build', checks.includes('docker daemon'), checks.join(', '));

console.log();
if (fail === 0) { console.log(`\x1b[0;32m✓ release preflight: ${pass}/${pass + fail}\x1b[0m\n`); process.exit(0); }
console.log(`\x1b[0;31m✗ release preflight: ${fail} of ${pass + fail} failed\x1b[0m\n`);
process.exit(1);
