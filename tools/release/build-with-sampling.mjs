#!/usr/bin/env node
/**
 * Run the release build under continuous disk observation.
 *
 *   node tools/release/build-with-sampling.mjs -- <command> [args...]
 *
 * Wraps the command, samples free space throughout, and writes the measurement
 * to the durable assurance store keyed by the revision being built. If free
 * space crosses the ABORT floor mid-build the child is terminated: losing a build
 * is cheap, and an exhausted host that leaves the Docker daemon unresponsive is
 * not — that has already happened twice in this programme. That floor is the
 * danger line (3 GiB), not the start requirement (8 GiB): aborting at the
 * requirement killed a healthy build seventeen minutes in.
 *
 * The measurement is recorded whether the build succeeds or fails. A build that
 * died of ENOSPC is exactly the one whose disk profile is worth keeping.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ABORT_FLOOR_BYTES, gib, proposedRequirementBytes, startSampler } from './disk-sampler.mjs';
import { candidateSha } from '../e2e/lib/assurance-output.mjs';
import { storeRoot } from './preflight.mjs';

const sep = process.argv.indexOf('--');
if (sep === -1 || sep === process.argv.length - 1) {
  console.error('usage: build-with-sampling.mjs -- <command> [args...]');
  process.exit(2);
}
const cmd = process.argv.slice(sep + 1);
const intervalMs = Number(process.env.BANZAMI_DISK_SAMPLE_MS) || 5_000;

const sha = (() => { try { return candidateSha(); } catch { return 'unknown'; } })();

let aborted = false;
const child = spawn(cmd[0], cmd.slice(1), { stdio: 'inherit' });

const sampler = startSampler({
  intervalMs,
  hardFloorBytes: ABORT_FLOOR_BYTES,
  onFloorBreach(free) {
    aborted = true;
    console.error(`\n\x1b[0;31m✗ release build aborted: free space crossed the hard floor\x1b[0m`);
    console.error(`  ${gib(free)} GiB free < ${gib(ABORT_FLOOR_BYTES)} GiB abort floor — stopping before the filesystem is exhausted.\n`);
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 10_000).unref?.();
  },
});

child.on('exit', (code, signal) => {
  const summary = sampler.stop();
  const record = {
    ...summary,
    candidate_sha: sha,
    command: cmd.join(' '),
    build_exit_code: code,
    build_signal: signal ?? null,
    aborted_for_disk: aborted,
    proposed_requirement_bytes: proposedRequirementBytes(summary),
    measured_at: new Date().toISOString(),
  };

  const dir = join(storeRoot(), sha);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'build-disk.json'), JSON.stringify(record, null, 2) + '\n');
  } catch (e) {
    console.error(`  warning: could not persist disk measurement: ${e.message}`);
  }

  // Raise the stored requirement when a trustworthy measurement asks for more.
  // A measurement never lowers it, and an untrustworthy one never touches it.
  //
  // A BUILD THAT DID NOT FINISH DID NOT REACH ITS PEAK
  //
  // Both measurements this programme had recorded came from builds the sampler
  // ABORTED, and both were stored as if they were the peak. They are not: an
  // aborted build stopped consuming, so its figure is a LOWER BOUND on what the
  // build actually needs. Storing 3.24 GiB from a build killed early set the
  // requirement to 8 GiB, which let the next build start with 9.4 GiB free and
  // abort again at a real peak of 6.45 GiB — itself another lower bound.
  //
  // The number is still worth keeping, because it proves the build needs AT
  // LEAST that much. What must not happen is treating it as the whole answer, so
  // the record says which it is and the requirement widens its margin
  // accordingly.
  if (record.usable_for_calibration) {
    const f = join(storeRoot(), 'build-capacity.json');
    let prev = {};
    try { prev = JSON.parse(readFileSync(f, 'utf8')); } catch { /* first build */ }
    const peakGib = summary.peak_consumed_bytes / 1024 ** 3;
    const lowerBound = aborted || (code ?? 1) !== 0;
    if (peakGib > (prev.peak_build_gib ?? 0)) {
      writeFileSync(f, JSON.stringify({
        schema: 'banzami-build-capacity/v3',
        peak_build_gib: peakGib,
        // True when the build did not finish: the real peak is higher than this.
        peak_is_lower_bound: lowerBound,
        measurement: 'peak (initial_free - minimum_free_observed)',
        observed_at: record.measured_at,
        last_sha: sha,
      }, null, 2) + '\n');
    }
  }

  const b = (n) => (n === null ? '—' : `${gib(n)} GiB`);
  console.log('\n▸ build disk profile');
  console.log(`  initial free     ${b(summary.initial_free_bytes)}`);
  console.log(`  minimum observed ${b(summary.minimum_free_bytes_observed)}`);
  console.log(`  final free       ${b(summary.final_free_bytes)}`);
  console.log(`  PEAK consumed    ${b(summary.peak_consumed_bytes)}   (initial − minimum)`);
  console.log(`  net consumed     ${b(summary.net_consumed_bytes)}   (initial − final)`);
  console.log(`  duration         ${summary.build_duration_seconds}s over ${summary.sample_count} samples @ ${summary.sample_interval_seconds}s`);
  console.log(`  sampling         ${summary.sampling_status}${summary.sample_errors ? ` (${summary.sample_errors} errors)` : ''}`);
  if (summary.floor_breached) console.log(`  \x1b[0;31mfloor breached at ${b(summary.floor_breach_free_bytes)}\x1b[0m`);
  console.log(`  record           ${join(dir, 'build-disk.json')}\n`);

  process.exit(aborted ? 75 : (code ?? 1));
});
