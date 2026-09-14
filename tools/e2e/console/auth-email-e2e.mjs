#!/usr/bin/env node
/**
 * The public Developer Console sign-in, proved end to end through REAL email
 * delivery (MONEY-MODEL-001 closure §7).
 *
 * This is the authoritative authentication journey. Where general regression
 * suites now open a fixture session (developer-api's internal, Sandbox-only,
 * fixture-domain-only /internal/v1/fixture-sessions — no email), this one does
 * not: it exercises the whole real path a first-time developer takes.
 *
 *   1. request a code for a fresh fixture address;
 *   2. the provider ACCEPTED the message (the product's own sent record shows it);
 *   3. the code arrives by real delivery (read from that message, never the DB);
 *   4. verify consumes it and a session is created;
 *   5. the code is single-use (a second verify is refused);
 *   6. that session authenticates (/auth/me 200).
 *
 * No OTP is read from the database, derived, or bypassed; nothing here uses the
 * fixture-session route. The fixture address is retired afterwards.
 *
 *   node tools/e2e/console/auth-email-e2e.mjs
 */
import { execFileSync } from 'node:child_process';
import { registerCleanup } from './lib/run-cleanup.mjs';

const API = process.env.BZ_DEV_API ?? 'https://developer-api.banzami.com';
const ORIGIN = process.env.BZ_CONSOLE ?? 'https://developers.banzami.com';
const HOST = process.env.BZ_SANDBOX_HOST ?? 'root@217.160.9.248';
const stamp = Date.now().toString(36);
const email = `e2e-authmail-${stamp}@banzami-e2e.test`;
// Retire the fixture identity however this process ends.
registerCleanup({ emailPattern: `e2e-authmail-${stamp}@banzami-e2e.test` });

const steps = [];
const step = (name, ok, detail = '') => { steps.push({ name, ok, detail }); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const post = async (path, body, cookie) => {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  let j = null; try { j = await r.json(); } catch { /* none */ }
  return { status: r.status, headers: r.headers, json: j };
};

// The provider's own record of the message it sent to this address: its id and
// the six digits, read on the Sandbox host where the key is a docker secret.
// The key never travels and is never printed; only the code and the accepted
// flag come back.
function sentMessage(address, notBefore) {
  const remote = `
set -eu
DEV=$(docker ps --format '{{.Names}}' | grep developer-api | head -1)
K=$(docker exec "$DEV" sh -c 'cat /run/secrets/resend_api_key')
LIST=$(curl -s -H "Authorization: Bearer $K" 'https://api.resend.com/emails?limit=50')
ID=$(printf '%s' "$LIST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const m=(JSON.parse(s).data||[]).find(e=>(e.to||[]).includes(process.argv[1]));process.stdout.write(m?m.id:"")}catch(e){}})' '${address}')
[ -n "$ID" ] && curl -s -H "Authorization: Bearer $K" "https://api.resend.com/emails/$ID"
true
`;
  for (let i = 0; i < 20; i += 1) {
    const out = execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, 'sh', '-s'], { input: remote, encoding: 'utf8', maxBuffer: 1 << 24 }).trim();
    if (out) {
      let m = null; try { m = JSON.parse(out); } catch { /* none */ }
      const when = new Date(m?.created_at ?? 0).getTime();
      const code = /(?:^|[^0-9])(\d{6})(?![0-9])/.exec(`${m?.text ?? ''}\n${m?.html ?? ''}`)?.[1];
      // last_event "delivered"/"sent" both mean the provider accepted it.
      if (code && when >= notBefore - 120000) return { code, accepted: !!m?.id, lastEvent: m?.last_event ?? '' };
    }
    execFileSync('perl', ['-e', 'select(undef,undef,undef,3)']);
  }
  return null;
}

let failed = false;
try {
  const started = Date.now();

  let req = await post('/auth/request-otp', { email });
  for (let a = 0; req.status === 429 && a < 10; a += 1) {
    execFileSync('perl', ['-e', 'select(undef,undef,undef,30)']);
    req = await post('/auth/request-otp', { email });
  }
  step('request-otp accepted', req.status === 200, `http=${req.status}`);

  const msg = sentMessage(email, started);
  step('provider accepted the message', !!msg?.accepted, msg ? `last_event=${msg.lastEvent}` : 'no message found');
  step('a 6-digit code arrived by real delivery', !!msg?.code);
  if (!msg?.code) throw new Error('no code delivered');

  const ver = await post('/auth/verify', { email, code: msg.code });
  const token = ((ver.headers.getSetCookie?.() ?? []).map((c) => /__Host-bz_dev_session=([^;]+)/.exec(c)?.[1]).find(Boolean)) ?? '';
  step('verify consumed the code and created a session', ver.status === 200 && !!token, `http=${ver.status}`);

  const reuse = await post('/auth/verify', { email, code: msg.code });
  step('the code is single-use', reuse.status !== 200, `reuse http=${reuse.status}`);

  const me = await fetch(`${API}/auth/me`, { headers: { cookie: `__Host-bz_dev_session=${token}` } });
  step('the session authenticates (/auth/me)', me.status === 200, `http=${me.status}`);
} catch (e) {
  step('run completed', false, e.message);
}

failed = steps.some((s) => !s.ok);
console.log(`\nPUBLIC_DEVELOPER_EMAIL_AUTH_E2E=${failed ? 'FAIL' : 'PASS'} (${steps.filter((s) => s.ok).length}/${steps.length})`);
process.exit(failed ? 1 : 0);
