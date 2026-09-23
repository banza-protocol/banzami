#!/usr/bin/env node
/**
 * An empty limiter is a reading, not an absence of one.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001).
 *
 * On 2026-09-23 every application-submit entry had aged out of the 24h window.
 * The scan returned zero buckets and RUNNER_IP_FREE_SLOTS reported "the limiter
 * has no record of this machine" — closing the owner gate at the exact moment
 * the resource was maximally available. Thirty free slots read as UNKNOWN.
 *
 * The distinction this file holds:
 *
 *   a scan that FAILED          → unknown, and unknown closes
 *   a scan that returned NOTHING → a definite answer: nothing was spent
 *
 * The limiter is the authority on what it will refuse, and a limiter with no
 * key for an address allows the whole window. Modelling it as unknown makes the
 * gate disagree with the thing it is modelling.
 *
 *   node tools/check-validation-limiter-reading.selftest.mjs
 */
import { runnerBucket, vmBucket, SUBMIT_LIMIT } from './lib/validation-capacity.mjs';

let failures = 0;
const check = (t, ok, d = '') => { if (ok) return console.log(`  ✓ ${t}`); console.log(`  ✗ ${t}${d ? `\n      ${d}` : ''}`); failures++; };

console.log('\napplication-submit limiter — an empty window is a reading\n');

const VM = '217.160.9.248';
const vmRow = (used) => ({ ip: VM, used, free: SUBMIT_LIMIT - used, nextFreeAt: null, isVM: true });
const otherRow = (ip, used) => ({ ip, used, free: SUBMIT_LIMIT - used, nextFreeAt: null, isVM: false });

/* ── the runner's bucket ─────────────────────────────────────────────────── */

{
  const r = runnerBucket([]);
  check('an empty scan derives zero spent and the whole window free',
    r && r.used === 0 && r.free === SUBMIT_LIMIT, JSON.stringify(r));
  check('…and marks itself unobserved, so the derivation stays visible',
    r.observed === false,
    'the address is only CONFIRMED once something is spent from it');
}

check('buckets that are ALL the VM\'s still leave this machine at zero',
  runnerBucket([vmRow(7)]).used === 0,
  'no non-VM key means no non-VM address submitted, this machine included');

{
  const r = runnerBucket([otherRow('1.2.3.4', 6)]);
  check('one non-VM bucket is this machine\'s, and is observed',
    r.used === 6 && r.free === SUBMIT_LIMIT - 6 && r.observed === true, JSON.stringify(r));
}

check('several non-VM buckets resolve to the BUSIEST, which is the conservative one',
  runnerBucket([otherRow('1.2.3.4', 6), otherRow('5.6.7.8', 11)]).used === 11,
  'picking the least-used would authorise against slots that may not be ours');

check('a derived reading never claims more free than the limit allows',
  runnerBucket([]).free <= SUBMIT_LIMIT && runnerBucket([vmRow(30)]).free <= SUBMIT_LIMIT);

/* ── and the VM's, whose treatment this now matches ──────────────────────── */

{
  const v = vmBucket([]);
  check('the VM bucket already derived zero from an empty scan',
    v && v.used === 0 && v.free === SUBMIT_LIMIT && v.observed === false,
    'the two sides of the same limiter must not disagree about what silence means');
}
check('an observed VM bucket reports what it actually holds',
  vmBucket([vmRow(4)]).used === 4 && vmBucket([vmRow(4)]).observed === true);
check('more than one unidentified non-VM bucket leaves the VM genuinely UNKNOWN',
  vmBucket([otherRow('1.2.3.4', 1), otherRow('5.6.7.8', 2)]) === null,
  'that is the shape where the reading really cannot be made');

/* ── the property, stated once ───────────────────────────────────────────── */

check('a successful scan never produces a null runner bucket',
  [[], [vmRow(1)], [otherRow('a', 1)], [otherRow('a', 1), otherRow('b', 2)]]
    .every((b) => runnerBucket(b) !== null),
  'null is reserved for a measurement that did not happen; a failed scan throws');

console.log(failures === 0
  ? `\n✓ VALIDATION_LIMITER_READING=PASS\n`
  : `\n✗ VALIDATION_LIMITER_READING=FAIL (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
