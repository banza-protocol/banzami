/**
 * The cleanroom's signature verifier, checked before it is trusted to judge.
 *
 * F0-DP-011 rests on a receiver saying "this signature is valid". A verifier
 * that accepts everything would report a green delivery for a platform that
 * signed nothing, so the negative cases matter more than the positive one.
 *
 * The verifier is implemented independently of the operator's signer, against
 * the published contract only:
 *
 *     Banza-Signature: t=<unix>,v1=<hex hmac-sha256 of "<unix>.<body>">
 *
 * Run: node tests/ops/cleanroom-signature.test.mjs
 */
import { createHmac } from 'node:crypto';
import { verify } from '../../tools/cleanroom/signature.mjs';

let pass = 0, fail = 0;
const ok = (d) => { console.log(`  \x1b[0;32m✓\x1b[0m ${d}`); pass++; };
const no = (d, got) => { console.log(`  \x1b[0;31m✗\x1b[0m ${d} — ${got}`); fail++; };
const is = (d, c, got = '') => (c ? ok(d) : no(d, got));

const SECRET = 'whsec_test_only_not_a_real_secret';
const now = Date.now();
const ts = Math.floor(now / 1000);
const body = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'payment.succeeded' }));
const sign = (secret, t, payload) => {
  const mac = createHmac('sha256', secret);
  mac.update(`${t}.`); mac.update(payload);
  return `t=${t},v1=${mac.digest('hex')}`;
};

console.log('\n▸ a correctly signed delivery verifies');
{
  const r = verify(SECRET, sign(SECRET, ts, body), body, 300_000, now);
  is('a valid signature is accepted', r.ok === true, r.reason);
  is('the signing time is reported', typeof r.signed_at === 'string', String(r.signed_at));
}

console.log('\n▸ the cases that must NOT verify');
{
  const header = sign(SECRET, ts, body);
  const altered = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'payment.succeeded', amount: 999999 }));
  is('an altered payload fails', verify(SECRET, header, altered, 300_000, now).ok === false, 'accepted');
  is('a wrong secret fails', verify('whsec_wrong', header, body, 300_000, now).ok === false, 'accepted');
  is('a missing header fails', verify(SECRET, null, body, 300_000, now).ok === false, 'accepted');
  is('a malformed header fails', verify(SECRET, 'garbage', body, 300_000, now).ok === false, 'accepted');
  is('an unconfigured secret fails closed', verify(null, header, body, 300_000, now).ok === false, 'accepted');
  // A single flipped hex digit must not pass; length-equal comparison is the trap.
  const flipped = header.replace(/v1=(.)/, (m, c) => `v1=${c === 'a' ? 'b' : 'a'}`);
  is('a single flipped digit fails', verify(SECRET, flipped, body, 300_000, now).ok === false, 'accepted');
}

console.log('\n▸ replay protection follows the timestamp, not the payload');
{
  const old = ts - 3600;
  const header = sign(SECRET, old, body);
  const r = verify(SECRET, header, body, 300_000, now);
  is('a signature older than tolerance is rejected', r.ok === false, 'accepted');
  is('...and says why', /tolerance/.test(r.reason ?? ''), r.reason);
  // Still valid INSIDE the window: this is the platform's documented posture,
  // and the cleanroom must observe it rather than assume replay is impossible.
  const fresh = verify(SECRET, sign(SECRET, ts - 60, body), body, 300_000, now);
  is('a replay inside the window still verifies (documented posture)', fresh.ok === true, fresh.reason);
  const future = verify(SECRET, sign(SECRET, ts + 3600, body), body, 300_000, now);
  is('a future timestamp beyond tolerance is rejected', future.ok === false, 'accepted');
}

console.log('\n▸ the secret never leaves the verifier');
{
  const r = verify(SECRET, sign(SECRET, ts, body), body, 300_000, now);
  is('no field of the result contains the secret',
     !JSON.stringify(r).includes(SECRET), JSON.stringify(r));
}

console.log();
if (fail === 0) { console.log(`\x1b[0;32m✓ cleanroom signature: ${pass}/${pass + fail}\x1b[0m\n`); process.exit(0); }
console.log(`\x1b[0;31m✗ cleanroom signature: ${fail} of ${pass + fail} failed\x1b[0m\n`);
process.exit(1);
