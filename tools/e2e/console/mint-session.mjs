#!/usr/bin/env node
/**
 * A real Console session, minted the way a person gets one.
 *
 * The sweeps need a signed-in Console, and the only honest way in is the
 * product's own door: request a code, read the code, type the code. What made
 * that hard is that reading the code means reading an inbox — so this reads the
 * one record that is not an inbox and is not the database: the message the
 * product itself sent, from the sending account that sent it.
 *
 * Why not the database: the OTP is stored peppered and hashed, and reading or
 * writing account_identity.identity_otp_codes to get past a code is tampering
 * with an authentication record to manufacture a pass. Nothing here touches it.
 *
 * Why not the owner's mailbox: this signs in as a controlled identity at
 * @banzami-e2e.test, created by the same UpsertVerifiedUser path any first-time
 * developer takes, and disposable by the fixture-email guard afterwards. It is
 * never the owner's account.
 *
 * The provider credential never leaves the Sandbox host and is never printed:
 * the lookup runs there, reads the docker secret into the request, and returns
 * six digits.
 *
 *   node tools/e2e/console/mint-session.mjs            # prints the session token
 *   node tools/e2e/console/mint-session.mjs --email x  # a specific fixture address
 */
import { execFileSync } from 'node:child_process';

const API = process.env.BZ_DEV_API ?? 'https://developer-api.banzami.com';
const ORIGIN = process.env.BZ_CONSOLE ?? 'https://developers.banzami.com';
const HOST = process.env.BZ_SANDBOX_HOST ?? 'root@217.160.9.248';

const argv = process.argv.slice(2);
const email = argv.includes('--email')
  ? argv[argv.indexOf('--email') + 1]
  : `e2e-console-${Date.now().toString(36)}@banzami-e2e.test`;
if (!email.endsWith('@banzami-e2e.test')) {
  console.error(`refusing to sign in as ${email} — this mints fixture identities only (@banzami-e2e.test)`);
  process.exit(2);
}

const say = (m) => console.error(`  ${m}`);

// This does NOT dispose of what it mints, and that is deliberate: its whole
// output is a session for another process to use, so cleaning up on exit would
// hand back a token that is already dead. It was written the other way first,
// and every sweep given a token from it reported "the session does not
// authenticate" — correctly.
//
// Disposal belongs to whoever holds the session: callers that build fixtures
// register their own cleanup on the same address, and anything minted by hand is
// swept by tools/ops/sweep-console-fixtures.mjs, which is what keeps this from
// being the leak it would otherwise be.

async function post(path, body, cookie) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, json: await res.json().catch(() => null) };
}

/**
 * The six digits the product emailed, read on the Sandbox host.
 *
 * The Resend key is a docker secret there. It is read into the curl invocation
 * on that host and never travels, never lands in a file and never reaches this
 * process — only the code does.
 */
function codeFor(address, notBefore) {
  const remote = `
set -eu
DEV=$(docker ps --format '{{.Names}}' | grep developer-api | head -1)
K=$(docker exec "$DEV" sh -c 'cat /run/secrets/resend_api_key')
LIST=$(curl -s -H "Authorization: Bearer $K" 'https://api.resend.com/emails?limit=25')
IDS=$(printf '%s' "$LIST" | sed 's/[{,]/\\n/g' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
for id in $IDS; do
  M=$(curl -s -H "Authorization: Bearer $K" "https://api.resend.com/emails/$id")
  printf '%s' "$M" | grep -q '${address}' || continue
  printf '%s\\n' "$M"
  break
done
`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const out = execFileSync('ssh', [HOST, 'sh', '-s'], { input: remote, encoding: 'utf8', maxBuffer: 1 << 24 });
    if (out.trim()) {
      let msg = null;
      try { msg = JSON.parse(out.trim()); } catch { /* fall through */ }
      const when = new Date(msg?.created_at ?? 0).getTime();
      const hay = `${msg?.text ?? ''}\n${msg?.html ?? ''}`;
      const code = /(?:^|[^0-9])(\d{6})(?![0-9])/.exec(hay)?.[1];
      if (code && when >= notBefore - 120000) return code;
    }
    execFileSync('perl', ['-e', 'select(undef,undef,undef,3)']);
  }
  return null;
}

// Sign-in is rate-limited per IP, which is the product working. A harness that
// mints several sessions in a row will meet it, and dying there reports a
// correct refusal as a broken sweep — so it waits the window out rather than
// asking for an exemption from it.
const started = Date.now();
// The window is 15 minutes (20 requests per IP), so waiting it out means waiting
// minutes, not seconds. Sitting through it is the correct behaviour: the limit is
// the product's, and a harness is not entitled to an exemption from it.
const ATTEMPTS = 17, SLEEP = 60;
let req = await post('/auth/request-otp', { email });
for (let attempt = 0; req.status === 429 && attempt < ATTEMPTS; attempt += 1) {
  say(`rate-limited by the sign-in throttle — waiting ${SLEEP}s (${attempt + 1}/${ATTEMPTS}; the window is 15 minutes)`);
  execFileSync('perl', ['-e', `select(undef,undef,undef,${SLEEP})`]);
  req = await post('/auth/request-otp', { email });
}
if (req.status !== 200 && req.status !== 204) {
  console.error(`request-otp answered ${req.status}: ${JSON.stringify(req.json)}`);
  process.exit(1);
}
say(`requested a code for ${email}`);

const code = codeFor(email, started);
if (!code) { console.error('no message for that address reached the sending account'); process.exit(1); }
say('read the code from the message the product sent');

const ver = await post('/auth/verify', { email, code });
if (ver.status !== 200) {
  console.error(`verify answered ${ver.status}: ${JSON.stringify(ver.json)}`);
  process.exit(1);
}
const setCookie = ver.headers.getSetCookie?.() ?? [];
const token = setCookie.map((c) => /__Host-bz_dev_session=([^;]+)/.exec(c)?.[1]).find(Boolean);
if (!token) { console.error('verify succeeded but set no __Host-bz_dev_session cookie'); process.exit(1); }

const me = await fetch(`${API}/auth/me`, { headers: { cookie: `__Host-bz_dev_session=${token}` } });
if (me.status !== 200) { console.error(`the minted session does not authenticate: /auth/me ${me.status}`); process.exit(1); }
say(`signed in — /auth/me 200 for ${email}`);

say(`dispose of ${email} with: node tools/ops/sweep-console-fixtures.mjs --apply`);

process.stdout.write(token + '\n');
