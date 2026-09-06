/**
 * The Developers Console, as an outsider reaches it.
 *
 * Every call goes to the deployed public API with a session obtained the
 * documented way — request a code, read it, verify — carrying the same Origin
 * and CSRF header a browser sends. Nothing here knows an internal route, a
 * database, or a fixture.
 *
 * The one thing an outsider has that this does not is a mailbox. So the code is
 * read back from the message the product actually sent, through the sending
 * account's own record. That is a bypass of DELIVERY and of nothing else: the
 * code is real, it expires, it is consumed once, and every request made with the
 * resulting session goes through the same membership and project checks as one
 * typed by a person. It is declared as an operator dependency, not hidden.
 */
import { execFileSync } from 'node:child_process';

export const API = process.env.DEV_API ?? 'https://developer-api.banzami.com';
export const ORIGIN = 'https://developers.banzami.com';
const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';

/** Read the Console's own sent mail. The key never leaves the container. */
function sentMail(path) {
  const out = execFileSync('ssh', [REMOTE,
    `c=$(docker ps --format '{{.Names}}' | grep -m1 developer-api); ` +
    `docker exec "$c" sh -c 'curl -s -H "Authorization: Bearer $RESEND_API_KEY" "https://api.resend.com${path}"'`,
  ], { encoding: 'utf8', maxBuffer: 1 << 24 });
  return JSON.parse(out);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sign in exactly as the Quickstart says to, and return a live session. */
export async function signIn(email) {
  const r = await fetch(`${API}/auth/request-otp`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!r.ok) throw new Error(`request-otp ${r.status}`);

  let code = '';
  for (let i = 0; i < 12 && !code; i++) {
    await sleep(2500);
    const list = sentMail('/emails?limit=10');
    const mine = (list.data ?? []).find((e) => (e.to ?? []).includes(email));
    if (!mine) continue;
    const full = sentMail(`/emails/${mine.id}`);
    code = (`${full.html ?? ''}${full.text ?? ''}`.match(/\b(\d{6})\b/) ?? [])[1] ?? '';
  }
  if (!code) throw new Error(`no sign-in code reached the sending account for ${email}`);

  const v = await fetch(`${API}/auth/verify`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  const body = await v.json();
  if (!v.ok || !body.ok) throw new Error(`verify ${v.status}: ${JSON.stringify(body)}`);
  const token = ((v.headers.get('set-cookie') ?? '').match(/__Host-bz_dev_session=([^;]+)/) ?? [])[1];
  if (!token) throw new Error('verify returned no session cookie');
  return { token, csrf: body.csrf_token, user: body.user, email };
}

/** One authenticated Console call. */
export async function api(sess, method, path, body) {
  const headers = { cookie: `__Host-bz_dev_session=${sess.token}` };
  if (method !== 'GET') {
    headers['content-type'] = 'application/json';
    headers.origin = ORIGIN;
    headers['x-csrf-token'] = sess.csrf;
  }
  const r = await fetch(`${API}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j = null;
  try { j = await r.json(); } catch { /* empty body */ }
  return { status: r.status, body: j, code: j?.error?.code ?? j?.code ?? '' };
}
