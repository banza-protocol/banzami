/**
 * Peak disk measurement, and the ways it can lie.
 *
 * The metric that decides whether a build survives is the PEAK it reaches, not
 * what it leaves behind. Two release builds measured 2.80 and 3.09 GiB net while
 * free space dipped roughly 3.9 GiB below where it started. Calibrating from net
 * would have set the requirement under the real need — the exact failure the
 * calibration exists to prevent.
 *
 * The second half of this file is about a subtler failure: a sampler that stops
 * ticking produces a small, plausible, entirely fictional peak. Silence must
 * never read as "this build was cheap".
 *
 * No test fills a filesystem. Free space is injected.
 *
 * Run: node tests/ops/build-disk-sampling.test.mjs
 */
import { REQUIREMENT_FLOOR_BYTES, ABORT_FLOOR_BYTES, PEAK_MARGIN, gib, proposedRequirementBytes, summarise }
  from '../../tools/release/disk-sampler.mjs';

let pass = 0, fail = 0;
const ok = (d) => { console.log(`  \x1b[0;32m✓\x1b[0m ${d}`); pass++; };
const no = (d, got) => { console.log(`  \x1b[0;31m✗\x1b[0m ${d} — ${got}`); fail++; };
const is = (d, c, got = '') => (c ? ok(d) : no(d, got));
const G = 1024 ** 3;

/** A finished sampler run, without a filesystem. */
const run = ({ init, min, fin, samples = 20, errors = 0, interval = 5, floor = false, floorAt = null }) =>
  summarise({
    initial_free_bytes: init, minimum_free_bytes_observed: min, final_free_bytes: fin,
    sample_count: samples, sample_errors: errors, sample_interval_seconds: interval,
    floor_breached: floor, floor_breach_free_bytes: floorAt,
  }, samples * interval);

console.log('\n▸ peak is initial − minimum, never initial − final');
{
  // The real shape: dipped to 3.9 GiB consumed, gave most of it back.
  const s = run({ init: 12.69 * G, min: 8.79 * G, fin: 9.60 * G });
  is('peak reflects the dip', Math.abs(gib(s.peak_consumed_bytes) - 3.9) < 0.05, `${gib(s.peak_consumed_bytes)}`);
  is('net reflects what was left behind', Math.abs(gib(s.net_consumed_bytes) - 3.09) < 0.05, `${gib(s.net_consumed_bytes)}`);
  is('peak exceeds net', s.peak_consumed_bytes > s.net_consumed_bytes, 'peak <= net');
}
{
  // A build that frees nothing: the two coincide, and that is legitimate.
  const s = run({ init: 20 * G, min: 15 * G, fin: 15 * G });
  is('peak equals net when nothing is reclaimed',
     s.peak_consumed_bytes === s.net_consumed_bytes, `${gib(s.peak_consumed_bytes)} vs ${gib(s.net_consumed_bytes)}`);
}
{
  // A transient spike fully recovered would be invisible to a net-only metric.
  const s = run({ init: 20 * G, min: 6 * G, fin: 20 * G });
  is('a fully recovered spike is still counted', gib(s.peak_consumed_bytes) === 14, `${gib(s.peak_consumed_bytes)}`);
  is('...while net reports zero', s.net_consumed_bytes === 0, `${gib(s.net_consumed_bytes)}`);
}
{
  const s = run({ init: 20 * G, min: 19.98 * G, fin: 19.99 * G });
  is('a very small peak is measured, not rounded away', s.peak_consumed_bytes > 0, '0');
}

console.log('\n▸ a requirement may rise on evidence, never fall');
{
  const small = run({ init: 20 * G, min: 19 * G, fin: 19.5 * G });   // 1 GiB peak
  is('a small peak cannot lower the floor',
     proposedRequirementBytes(small) === REQUIREMENT_FLOOR_BYTES, `${gib(proposedRequirementBytes(small))}`);
  const large = run({ init: 40 * G, min: 15 * G, fin: 30 * G });     // 25 GiB peak
  is('a large peak raises the requirement above the floor',
     proposedRequirementBytes(large) === ABORT_FLOOR_BYTES + Math.ceil(25 * G * PEAK_MARGIN),
     `${gib(proposedRequirementBytes(large))}`);
  is('the margin is applied over the peak',
     proposedRequirementBytes(large) > large.peak_consumed_bytes, 'no margin');
}

console.log('\n▸ a dead sampler must not look like a cheap build');
{
  const s = run({ init: 20 * G, min: 20 * G, fin: 20 * G, samples: 0 });
  is('zero samples is failed, not ok', s.sampling_status === 'failed', s.sampling_status);
  is('a failed run cannot calibrate', s.usable_for_calibration === false, 'usable');
  is('and proposes only the floor', proposedRequirementBytes(s) === REQUIREMENT_FLOOR_BYTES, `${gib(proposedRequirementBytes(s))}`);
}
{
  // Sampler died early: 3 samples where ~120 were due.
  const s = summarise({ initial_free_bytes: 20 * G, minimum_free_bytes_observed: 19.9 * G,
                        final_free_bytes: 12 * G, sample_count: 3, sample_errors: 0,
                        sample_interval_seconds: 5, floor_breached: false, floor_breach_free_bytes: null }, 600);
  is('too few samples for the duration is degraded', s.sampling_status === 'degraded', s.sampling_status);
  is('a degraded run cannot calibrate', s.usable_for_calibration === false, 'usable');
}
{
  const s = run({ init: 20 * G, min: 14 * G, fin: 18 * G, errors: 4 });
  is('sampling errors degrade the run', s.sampling_status === 'degraded', s.sampling_status);
}
{
  const s = run({ init: null, min: null, fin: null, samples: 0 });
  is('an unreadable filesystem yields null peak, not zero', s.peak_consumed_bytes === null, `${s.peak_consumed_bytes}`);
  is('...and a failed status', s.sampling_status === 'failed', s.sampling_status);
}

console.log('\n▸ the hard floor is a live boundary, not just a preflight one');
{
  const s = run({ init: 12 * G, min: 2.7 * G, fin: 3.1 * G, floor: true, floorAt: 2.7 * G });
  is('a breach during the build is recorded', s.floor_breached === true, 'not recorded');
  is('the breaching value is kept', gib(s.floor_breach_free_bytes) === 2.7, `${gib(s.floor_breach_free_bytes)}`);
  is('the abort floor travels with the record', s.abort_floor_bytes === ABORT_FLOOR_BYTES, `${gib(s.abort_floor_bytes)}`);
  is('so does the start minimum, so a reader can tell them apart',
     s.requirement_floor_bytes === REQUIREMENT_FLOOR_BYTES, `${gib(s.requirement_floor_bytes)}`);
}
{
  const s = run({ init: 14 * G, min: 8.4 * G, fin: 9 * G });
  is('approaching without crossing is not a breach', s.floor_breached === false, 'breached');
  is('and remains usable for calibration', s.usable_for_calibration === true, s.sampling_status);
}

console.log('\n▸ historical calibration that cannot be trusted');
{
  // A corrupt or absent record must fall back to the floor, never to zero.
  const corrupt = [null, undefined, {}, { peak_consumed_bytes: 5 * G },
                   { usable_for_calibration: true },                        // claims usable, no peak
                   { usable_for_calibration: true, peak_consumed_bytes: NaN },
                   { usable_for_calibration: true, peak_consumed_bytes: -1 }];
  const bad = corrupt.filter((c) => proposedRequirementBytes(c) !== REQUIREMENT_FLOOR_BYTES);
  is('every corrupt or missing calibration falls back to the floor', bad.length === 0,
     bad.map((b) => JSON.stringify(b)).join(' | '));
  const first = run({ init: 30 * G, min: 25 * G, fin: 27 * G });
  is('a first-ever build still produces a usable record', first.usable_for_calibration === true, first.sampling_status);
}

console.log('\n▸ the two floors answer different questions and must stay compatible');
{
  // These were ONE constant, and that made the gate approve builds the guard was
  // certain to kill — a release build passed at 11.07 GiB free, consumed its 3.24
  // GiB peak, crossed the floor at 7.84 and was aborted seventeen minutes in.
  is('the abort floor is below the start minimum',
     ABORT_FLOOR_BYTES < REQUIREMENT_FLOOR_BYTES,
     `abort ${gib(ABORT_FLOOR_BYTES)} >= start ${gib(REQUIREMENT_FLOOR_BYTES)}`);
  is('the abort floor sits above the free space where a build actually died (2.3 GiB)',
     ABORT_FLOOR_BYTES > 2.3 * G, `${gib(ABORT_FLOOR_BYTES)}`);

  // The invariant that was missing: start at the requirement, consume the peak,
  // and you must still be clear of the abort floor.
  for (const peakGiB of [0.5, 3.24, 4, 8]) {
    const s = run({ init: 20 * G, min: (20 - peakGiB) * G, fin: (20 - peakGiB) * G, samples: 200 });
    const required = proposedRequirementBytes(s);
    is(`a ${peakGiB} GiB build starting at its requirement never reaches the abort floor`,
       required - peakGiB * G > ABORT_FLOOR_BYTES,
       `required ${gib(required)} − peak ${peakGiB} = ${gib(required - peakGiB * G)} <= abort ${gib(ABORT_FLOOR_BYTES)}`);
  }
}

console.log('\n▸ the schema cannot confuse peak with net');
{
  const s = run({ init: 12 * G, min: 8 * G, fin: 10 * G });
  const keys = Object.keys(s);
  is('both are present and separately named',
     keys.includes('peak_consumed_bytes') && keys.includes('net_consumed_bytes'), keys.join(','));
  is('the minimum observed is recorded', keys.includes('minimum_free_bytes_observed'), keys.join(','));
  is('sampling provenance travels with the numbers',
     ['sample_count', 'sample_interval_seconds', 'sampling_status', 'build_duration_seconds'].every((k) => keys.includes(k)),
     keys.join(','));
  is('the schema is versioned', s.schema === 'banzami-build-disk/v1', s.schema);
}

console.log();
if (fail === 0) { console.log(`\x1b[0;32m✓ build disk sampling: ${pass}/${pass + fail}\x1b[0m\n`); process.exit(0); }
console.log(`\x1b[0;31m✗ build disk sampling: ${fail} of ${pass + fail} failed\x1b[0m\n`);
process.exit(1);
