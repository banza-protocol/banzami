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

/**
 * Sign in as `email` and return the raw session cookie value.
 * Creates the identity if it does not exist, exactly as a first sign-in does.
 */
export function mintSession(email) {
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
