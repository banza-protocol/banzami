/**
 * The published webhook signature contract, verified independently.
 *
 *   Banza-Signature: t=<unix_seconds>,v1=<hex_hmac_sha256>
 *   HMAC-SHA256(secret, "<unix_seconds>." + raw_body)
 *
 * This is the half of the cleanroom receiver that JUDGES. The half that RECEIVES
 * is the deployed sink at `infra/sandbox/webhook-sink/`, reachable publicly at
 * sandbox-webhook.banzami.com/receive/<capability> — it records what arrived and
 * deliberately does not verify it, so recording and judging cannot fail together.
 *
 * Nothing here imports the operator's signer. A bug that made Banzami sign and
 * verify consistently-but-wrongly would pass its own tests and fail here, which
 * is the only reason an independent verifier is worth having.
 *
 * F0-DP-011 rests on this function saying "valid", so its negative cases matter
 * more than its positive one — see tests/ops/cleanroom-signature.test.mjs.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Verify per the published contract, implemented independently. */
export function verify(secretValue, header, rawBody, toleranceMs = 300_000, now = Date.now()) {
  if (!secretValue) return { ok: false, reason: 'no secret configured' };
  if (!header) return { ok: false, reason: 'missing Banza-Signature header' };
  const m = /^t=(\d+),v1=([0-9a-f]+)$/.exec(header.trim());
  if (!m) return { ok: false, reason: 'malformed signature header' };
  const [, tsRaw, given] = m;
  const ts = Number(tsRaw);

  const age = Math.abs(now - ts * 1000);
  if (age > toleranceMs) return { ok: false, reason: 'timestamp outside tolerance', age_ms: age };

  const mac = createHmac('sha256', secretValue);
  mac.update(`${ts}.`);
  mac.update(rawBody);
  const expected = mac.digest('hex');

  const a = Buffer.from(given, 'utf8'), b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'signature mismatch' };
  return { ok: true, signed_at: new Date(ts * 1000).toISOString(), age_ms: age };
}
