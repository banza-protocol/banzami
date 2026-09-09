#!/usr/bin/env node
/**
 * What a build actually costs, measured while it runs.
 *
 * The first version of this recorded `initial_free - final_free`. That is the
 * NET consumption, and it is not the number that decides whether a build
 * survives: a build that allocates 15 GiB and frees 12 before exiting reports 3,
 * having come within a hair of exhausting the host. Two release builds measured
 * 2.80 and 3.09 GiB net while free space was observed dipping to roughly 3.9 GiB
 * consumed mid-flight. Calibrating headroom from net would have set the
 * threshold below the real requirement — the failure mode the calibration
 * existed to prevent.
 *
 *     peak_consumed_bytes = initial_free_bytes - minimum_free_bytes_observed
 *
 * never initial minus final.
 *
 * A SAMPLER THAT DIES MUST NOT LOOK HEALTHY
 *
 * A dead sampler produces a small, plausible, entirely fictional peak. So
 * `sampling_status` is part of the record and never inferred: a run with too few
 * samples for its duration is `degraded`, one with none is `failed`, and neither
 * may be used to calibrate anything. Silence is not evidence of a small peak.
 *
 * FAIL BEFORE THE FILESYSTEM DOES
 *
 * Sampling is also a live guard. If free space crosses the abort floor mid-build,
 * the sampler says so and the caller aborts — losing a build is cheap, an
 * exhausted host that corrupts a Docker daemon is not. That is not theoretical
 * here: it has happened twice.
 *
 * TWO FLOORS, TWO QUESTIONS
 *
 * These were one constant, and that made the gate approve builds the guard was
 * certain to kill: a release build passed the preflight at 11.07 GiB free,
 * consumed its 3.24 GiB peak, crossed the floor at 7.84 GiB and was aborted
 * after seventeen minutes of compiling. Nothing was wrong with either check —
 * they were answering different questions with the same number.
 *
 *   REQUIREMENT_FLOOR  "is this machine fit to start a release build at all?"
 *                      8 GiB. A policy minimum, never lowered by measurement.
 *   ABORT_FLOOR        "is the host now in danger?"
 *                      3 GiB. Bounded by the failure actually observed at 2.3
 *                      GiB free, where the build died and the daemon hung.
 *
 * Aborting at 8 GiB free was not protecting anything: the host is nowhere near
 * exhaustion there. The requirement must leave room for the build to run all the
 * way down to the abort floor without reaching it.
 */
import { statfsSync } from 'node:fs';

/**
 * Minimum free space before a release build may START. Policy, never lowered by
 * measurement however small a peak turns out to be.
 */
export const REQUIREMENT_FLOOR_BYTES = 8 * 1024 ** 3;
/**
 * The live danger line: free space at which a running build is killed rather
 * than allowed to exhaust the host. Bounded by observation — a build died and
 * left the Docker daemon unresponsive at 2.3 GiB free.
 */
export const ABORT_FLOOR_BYTES = 3 * 1024 ** 3;
/** Margin over the observed peak when proposing a future requirement. */
export const PEAK_MARGIN = 1.5;
const GIB = 1024 ** 3;

export function freeBytes(path = process.cwd()) {
  const s = statfsSync(path);
  return s.bavail * s.bsize;
}

/**
 * Watches free space for the duration of a build.
 *
 * @param {object} o
 * @param {number} o.intervalMs      sampling period
 * @param {number} o.hardFloorBytes  abort threshold
 * @param {Function} o.onFloorBreach called once, when free space crosses it
 */
export function startSampler({ path = process.cwd(), intervalMs = 5_000,
                               hardFloorBytes = ABORT_FLOOR_BYTES,
                               onFloorBreach = null } = {}) {
  const startedAt = Date.now();
  let initial;
  try { initial = freeBytes(path); }
  catch (e) { initial = null; }

  const state = {
    initial_free_bytes: initial,
    minimum_free_bytes_observed: initial,
    final_free_bytes: null,
    sample_count: initial === null ? 0 : 1,
    sample_errors: initial === null ? 1 : 0,
    sample_interval_seconds: intervalMs / 1000,
    floor_breached: false,
    floor_breach_free_bytes: null,
  };

  const tick = () => {
    let f;
    try { f = freeBytes(path); }
    catch { state.sample_errors++; return; }
    state.sample_count++;
    if (state.minimum_free_bytes_observed === null || f < state.minimum_free_bytes_observed) {
      state.minimum_free_bytes_observed = f;
    }
    if (!state.floor_breached && f < hardFloorBytes) {
      state.floor_breached = true;
      state.floor_breach_free_bytes = f;
      if (onFloorBreach) onFloorBreach(f);
    }
  };

  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    sample: tick,
    stop() {
      clearInterval(timer);
      try { state.final_free_bytes = freeBytes(path); } catch { state.sample_errors++; }
      return summarise(state, (Date.now() - startedAt) / 1000);
    },
  };
}

/**
 * Turn raw samples into the record. `peak` and `net` are named so they cannot be
 * mistaken for one another, and a run that could not be measured says so rather
 * than reporting a comfortable zero.
 */
export function summarise(state, durationSeconds) {
  const { initial_free_bytes: init, minimum_free_bytes_observed: min,
          final_free_bytes: fin, sample_count, sample_errors } = state;

  // Expected samples for the elapsed time. A sampler that stopped ticking looks
  // exactly like a build that used no disk, so the shortfall is the signal.
  const expected = Math.max(1, Math.floor(durationSeconds / state.sample_interval_seconds));
  let sampling_status = 'ok';
  if (init === null || sample_count === 0) sampling_status = 'failed';
  else if (sample_errors > 0 || sample_count < Math.max(2, expected * 0.5)) sampling_status = 'degraded';

  const measurable = init !== null && min !== null;
  return {
    schema: 'banzami-build-disk/v1',
    initial_free_bytes: init,
    minimum_free_bytes_observed: min,
    final_free_bytes: fin,
    // peak = initial - MINIMUM observed. Never initial - final.
    peak_consumed_bytes: measurable ? Math.max(0, init - min) : null,
    net_consumed_bytes: measurable && fin !== null ? Math.max(0, init - fin) : null,
    build_duration_seconds: Math.round(durationSeconds * 10) / 10,
    sample_interval_seconds: state.sample_interval_seconds,
    sample_count,
    sample_errors,
    sampling_status,
    floor_breached: state.floor_breached,
    floor_breach_free_bytes: state.floor_breach_free_bytes,
    abort_floor_bytes: ABORT_FLOOR_BYTES,
    requirement_floor_bytes: REQUIREMENT_FLOOR_BYTES,
    // Only a trustworthy measurement may inform a future requirement, and even
    // then it can only ever RAISE it — the floor is not negotiable downward.
    usable_for_calibration: sampling_status === 'ok' && measurable,
  };
}

/**
 * The requirement a measurement proposes: enough to run the whole build without
 * ever reaching the abort floor, and never below the policy minimum.
 *
 *     max(REQUIREMENT_FLOOR, ABORT_FLOOR + peak × margin)
 *
 * The second term is what was missing. `max(FLOOR, peak × margin)` returned the
 * floor itself for any peak under 5.3 GiB, so the gate approved a start whose
 * own consumption would cross the line the guard watches.
 */
export function proposedRequirementBytes(summary) {
  if (!summary?.usable_for_calibration) return REQUIREMENT_FLOOR_BYTES;
  // A record may claim to be usable and still be corrupt. Trusting the flag
  // alone yields NaN here, and NaN compares false against every threshold —
  // a requirement that silently permits any build.
  const peak = summary.peak_consumed_bytes;
  if (!Number.isFinite(peak) || peak < 0) return REQUIREMENT_FLOOR_BYTES;
  return Math.max(REQUIREMENT_FLOOR_BYTES, ABORT_FLOOR_BYTES + Math.ceil(peak * PEAK_MARGIN));
}

export const gib = (b) => (b === null || b === undefined ? null : Math.round((b / GIB) * 100) / 100);
