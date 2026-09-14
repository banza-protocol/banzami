/**
 * A Console session for a fixture identity, through the product's own door.
 *
 * This replaces mint-console-session.sh, which inserted a session row straight
 * into account_identity.identity_sessions — and, in one caller, inserted the
 * identity row too. Both were defended as "a bypass of email delivery and
 * nothing else", and both were writes into an authentication store to produce a
 * pass. A harness that can write itself a session is a harness that proves
 * nothing about whether anyone can sign in.
 *
 * What happens instead is what happens to a first-time developer: a code is
 * requested, the code is read from the message the product sent, the code is
 * verified, and UpsertVerifiedUser creates the identity on the way through. No
 * INSERT, no session secret, no OTP read from the database.
 *
 * Fixture addresses only — @banzami-e2e.test — so the cleanup guard that exists
 * because a real account was once deleted still governs everything minted here.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MINT = join(HERE, '..', 'mint-session.mjs');

const HOST = process.env.BZ_SANDBOX_HOST ?? 'root@217.160.9.248';

/**
 * A session for a fixture identity, without sending an email.
 *
 * For suites whose subject is NOT authentication. Each real sign-in costs the
 * provider sending quota the public Console needs; on 2026-09-14 these suites
 * spent all of it and no developer could sign in until it reset. developer-api's
 * internal `POST /internal/v1/fixture-sessions` opens a session through the same
 * store calls a verified sign-in uses — Sandbox only, @banzami-e2e.test only,
 * behind the internal key (read inside the container, never leaving it), refused
 * by the public edge, audited. No OTP is created, read or derived.
 *
 * Authentication itself is still proved through real delivery: the public
 * cleanroom and tools/e2e/console/auth-email-e2e.mjs use { realEmail: true }.
 *
 * Returns { token, csrf }.
 */
export function fixtureSession(email) {
  if (!/^[^@\s]+@banzami-e2e\.test$/.test(email)) {
    throw new Error(`refusing a fixture session for ${email} — fixture identities only (@banzami-e2e.test)`);
  }
  const remote = `DEV=$(docker ps --format '{{.Names}}' | grep developer-api | head -1); ` +
    `docker exec -i "$DEV" sh -c 'curl -s -w "\\n%{http_code}" -X POST http://localhost:8086/internal/v1/fixture-sessions ` +
    `-H "X-Internal-Key: $(cat /run/secrets/developer_internal_key)" -H "Content-Type: application/json" --data @-'`;
  const out = execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, remote], {
    input: JSON.stringify({ email }), encoding: 'utf8', maxBuffer: 1 << 20,
  }).trim();
  const status = out.split('\n').pop();
  const body = out.slice(0, out.length - status.length).trim();
  if (status !== '200') throw new Error(`fixture session for ${email}: HTTP ${status}`);
  const { session_token: token, csrf_token: csrf } = JSON.parse(body);
  if (!token || !csrf) throw new Error(`fixture session for ${email}: incomplete answer`);
  return { token, csrf };
}

/**
 * Sign in as `email` and return the raw session cookie value.
 *
 * By default a fixture session (no email sent). `{ realEmail: true }` signs in
 * through the product's own door — request a code, read the message the product
 * sent, verify — and is for suites whose subject IS authentication.
 */
export function mintSession(email, { realEmail = false } = {}) {
  if (!realEmail) {
    const { token } = fixtureSession(email);
    return token;
  }
  // mint-session.mjs deliberately keeps what it mints — its output is a session
  // that has to outlive it. Disposal is the caller's: registerCleanup on the same
  // address, which check-harness-hygiene is what holds every caller to.
  let out;
  try {
    out = execFileSync('node', [MINT, '--email', email], { encoding: 'utf8', maxBuffer: 1 << 22 });
  } catch (e) {
    // The child's own message says what went wrong — a rate limit, a 404 host, a
    // code that never arrived. Rethrowing the spawn object buries it under a
    // stack trace and pid.
    throw new Error(`could not sign in as ${email}: ${String(e.stderr ?? e.message).trim().split('\n').pop()}`);
  }
  const token = out.trim().split('\n').pop();
  if (!token) throw new Error(`mintSession(${email}) produced no token`);
  return token;
}
