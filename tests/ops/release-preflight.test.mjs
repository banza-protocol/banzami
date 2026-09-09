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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FLOOR_GIB, CALIBRATION_MARGIN, UNCALIBRATED_BUILD_GIB, preflight, freeGiB, requiredGiB,
         regenerableConsumers, PROTECTED } from '../../tools/release/preflight.mjs';
import { HARD_FLOOR_BYTES } from '../../tools/release/disk-sampler.mjs';

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
// The source string must show the arithmetic, because a bare number is what let
// a reserve be mistaken for a requirement in the first place.
is('the requirement shows how it was reached',
   req.source === 'env' || /reserve \+/.test(req.source), req.source);
is('the floor sits inside the observed interval (>2.3 failed, <13 succeeded)',
   FLOOR_GIB > 2.3 && FLOOR_GIB < 13, `FLOOR_GIB=${FLOOR_GIB}`);

console.log('\n▸ the gate must not permit a build the guard will kill');
// The requirement WAS max(FLOOR, peak × margin), so a calibrated peak of 3.24
// GiB produced a requirement of 8 GiB — the floor exactly. A build could pass
// the gate at 8.0 GiB free and be aborted the instant it wrote anything, because
// free space had crossed the same 8 GiB line. It happened: a release build
// passed at 11.07 GiB, consumed 3.24 GiB, crossed the floor at 7.84 and was
// killed after seventeen minutes of compiling.
const store = mkdtempSync(join(tmpdir(), 'bz-cal-'));
process.env.BANZAMI_ASSURANCE_STORE = store;
const writeCal = (peak) => {
  mkdirSync(store, { recursive: true });
  writeFileSync(join(store, 'build-capacity.json'), JSON.stringify({
    schema: 'banzami-build-capacity/v2', peak_build_gib: peak,
    measurement: 'peak (initial_free - minimum_free_observed)', observed_at: new Date().toISOString(),
  }));
};

for (const peak of [0.5, 3.24, 9]) {
  writeCal(peak);
  const r = requiredGiB();
  // Start with `required`, consume `peak`: what remains must still clear the
  // floor. Anything less and the gate is predicting a death it calls a pass.
  is(`a ${peak} GiB build starting at the requirement still clears the floor`,
     r.gib - peak >= FLOOR_GIB,
     `required=${r.gib.toFixed(2)} − peak=${peak} = ${(r.gib - peak).toFixed(2)} < floor ${FLOOR_GIB}`);
  is(`the requirement for a ${peak} GiB build exceeds the floor itself`,
     r.gib > FLOOR_GIB, `${r.gib.toFixed(2)} <= ${FLOOR_GIB}`);
}

writeCal(3.24);
const calibrated = requiredGiB();
is('the requirement comes from the measurement, and says so',
   /peak 3\.24 GiB observed/.test(calibrated.source), calibrated.source);
is('the requirement is the reserve PLUS the measured build, not the larger of the two',
   Math.abs(calibrated.gib - (FLOOR_GIB + 3.24 * CALIBRATION_MARGIN)) < 1e-9,
   `${calibrated.gib}`);

rmSync(join(store, 'build-capacity.json'), { force: true });
const uncal = requiredGiB();
is('an uncalibrated requirement also leaves room above the floor',
   uncal.gib - UNCALIBRATED_BUILD_GIB >= FLOOR_GIB, `${uncal.gib}`);
is('the uncalibrated allowance covers the peaks actually observed (3.09, 3.24)',
   UNCALIBRATED_BUILD_GIB >= 3.24, `${UNCALIBRATED_BUILD_GIB}`);
rmSync(store, { recursive: true, force: true });
delete process.env.BANZAMI_ASSURANCE_STORE;

console.log('\n▸ the reserve is one number, not two that can drift');
is('the gate and the guard read the same floor',
   FLOOR_GIB === HARD_FLOOR_BYTES / 1024 ** 3,
   `gate=${FLOOR_GIB} guard=${HARD_FLOOR_BYTES / 1024 ** 3}`);

console.log('\n▸ net can no longer be written into the peak field');
// A helper here stored `beforeGiB - afterGiB` under `peak_build_gib`. Net is not
// peak, and a second way to write that file is a second way to get it wrong.
const preflightSrc = readFileSync(new URL('../../tools/release/preflight.mjs', import.meta.url), 'utf8');
is('no net-based calibration writer remains',
   !/beforeGiB\s*-\s*afterGiB/.test(preflightSrc), 'net-based writer still present');
is('the only calibration writer is the sampler',
   !/export function recordBuildConsumption/.test(preflightSrc), 'recordBuildConsumption still exported');

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
