#!/usr/bin/env node
/**
 * A Business App session, end to end, on the deployed Sandbox — the calls the
 * app makes, over public HTTPS, for a synthetic Business.
 *
 *   node tools/e2e/business/business-app-session-e2e.mjs [--out <dir>]
 *
 * Two synthetic Businesses (ACTIVE, @handle, AOA wallet, KYB approved through
 * the Sandbox fixture route). A is given what approval gives a Business — a
 * login without a PIN and a single-use activation token (stored hashed) — and
 * activates through the public activation API, as its owner does from the
 * email link. Then, as the app:
 *
 *   activation  the link validates, sets the PIN once, and cannot be used again;
 *               the retired claim route sets nothing (410).
 *   sign-in     a wrong PIN and an unknown @ are refused alike (no enumeration);
 *               the right PIN opens a session: 15-minute access token and a
 *               refresh token that lasts the sign-in (30 days).
 *   core        profile (verified), wallet, balance 0 (a real zero, not a
 *               failure), history (empty list).
 *   renewal     the refresh token is exchanged once for a new pair; the old one
 *               presented again is reuse — refused, and the whole sign-in with
 *               it (the new pair dies too).
 *   sign-out    ends the session: its refresh token no longer renews; sign-out
 *               with a token that means nothing still answers 204.
 *   authority   a suspended Business cannot renew; A's token cannot read B's
 *               profile, wallet or balance.
 *
 * The PIN and the activation token are generated here, sent in request bodies
 * (the token's hash over ssh stdin), and never printed.
 * Fixtures are suspended at the end whatever happens. Nothing moves money.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const GW = process.env.GW_API ?? 'https://sandbox-api.banzami.com';
const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const OUT = arg('--out', join(process.cwd(), `evidence/assurance/business/business-app-session-${Date.now()}`));
mkdirSync(OUT, { recursive: true });

const steps = [];
const rec = (name, ok, note = '') => {
  steps.push({ step: name, ok: Boolean(ok), note: String(note).slice(0, 300) });
  console.log(`  ${ok ? '\x1b[0;32m✓\x1b[0m' : '\x1b[0;31m✗\x1b[0m'} ${name}${note ? ` — ${note}` : ''}`);
};
const ssh = (s, input) => execFileSync('ssh', [REMOTE, s], { encoding: 'utf8', maxBuffer: 1 << 24, input });
const PRE = `
  set -uo pipefail
  P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
  PG="$P-postgres-1"; CORE="$P-core-api-staging"; GWC="$P-api-gateway-staging"
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }
  JWTSEC=$(docker exec "$GWC" sh -c 'cat /run/secrets/jwt_secret')
  mint(){ SECRET="$JWTSEC" V="$1" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={merchant_id:process.env.V,scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }
`;

const stamp = Date.now().toString(36);
const PIN = String(randomInt(100000, 999999));
const ACTIVATION = randomBytes(32).toString('base64url');
let fixtures = [];

async function http(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';
  const r = await fetch(`${GW}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* 204 */ }
  return { status: r.status, body: j, code: j?.code ?? j?.error?.code };
}
const login = (handle, pin) => http('/v1/merchant/auth/token', { method: 'POST', body: { handle, pin } });
const refresh = (rt) => http('/v1/merchant/auth/refresh', { method: 'POST', body: { refresh_token: rt } });
const logout = (rt) => http('/v1/merchant/auth/logout', { method: 'POST', body: { refresh_token: rt } });

function makeBusiness(tag, withPin) {
  const handle = `bas${tag}${stamp}`.slice(0, 30);
  const out = ssh(`${PRE}
    ROOT=$(mint 00000000-0000-0000-0000-000000000001)
    M=$(printf '{"name":"Sessao ${tag.toUpperCase()} ${stamp}","email":"bas-${tag}-${stamp}@projects.banzami.test"}' | docker exec -i "$GWC" curl -s -X POST http://localhost:8080/v1/merchants -H "Authorization: Bearer $ROOT" -H 'Content-Type: application/json' --data @- | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).id||"")}catch{}})')
    T=$(mint "$M")
    docker exec "$GWC" curl -s -o /dev/null -X POST http://localhost:8080/v1/wallets -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"currency":"AOA"}'
    docker exec "$CORE" curl -s -o /dev/null -X POST http://localhost:8081/internal/v1/sandbox/business-readiness -H 'Content-Type: application/json' -d "{\\"merchant_id\\":\\"$M\\",\\"handle\\":\\"${handle}\\"}"
    ${withPin ? `read -r TOKHASH
    q "insert into merchant_app_credentials (merchant_id, environment, handle) values ('$M', 'SANDBOX', '${handle}')" >/dev/null
    q "insert into merchant_activation_tokens (id, merchant_id, environment, token_hash, expires_at)
       values (gen_random_uuid(), '$M', 'SANDBOX', '$TOKHASH', now() + interval '15 minutes')" >/dev/null
    C=$(q "select count(*) from merchant_app_credentials where merchant_id='$M' and pin_hash is null and activated_at is null")` : 'C=none'}
    printf '%s|%s' "$M" "$C"`, withPin ? `${createHash('sha256').update(ACTIVATION).digest('hex')}\n` : '').trim();
  const [merchant, claim] = out.split('|');
  fixtures.push(merchant);
  return { merchant, handle, claim };
}

async function main() {
  console.log(`\n▸ Business App session — ${GW}\n`);
  const A = makeBusiness('a', true);
  const B = makeBusiness('b', false);
  rec('two synthetic Businesses; A approved-shaped: a login with no PIN yet, and an activation link', A.merchant && B.merchant && A.claim === '1',
    `${A.merchant.slice(0, 8)} ${B.merchant.slice(0, 8)}`);

  // ── activation ─────────────────────────────────────────────────────────────
  const before = await login(A.handle, PIN);
  rec('before activation the Business cannot sign in', before.status === 401, `${before.status}`);
  const valid = await http('/v1/merchant/activation/validate', { method: 'POST', body: { token: ACTIVATION } });
  rec('the activation link validates and names the Business', valid.status === 200 && valid.body?.valid === true && String(valid.body?.handle ?? '').includes(A.handle),
    `${valid.status} ${JSON.stringify(valid.body ?? {}).slice(0, 120)}`);
  const done = await http('/v1/merchant/activation/complete', { method: 'POST', body: { token: ACTIVATION, pin: PIN } });
  rec('the owner sets the PIN through it', [200, 201, 204].includes(done.status), `${done.status}`);
  const twice = await http('/v1/merchant/activation/complete', { method: 'POST', body: { token: ACTIVATION, pin: '135790' } });
  rec('the link cannot be used again', twice.status === 410 && twice.code === 'TOKEN_USED', `${twice.status} ${twice.code}`);

  // ── sign-in ────────────────────────────────────────────────────────────────
  const wrong = await login(A.handle, PIN === '111111' ? '222222' : '111111');
  const unknown = await login(`nobody${stamp}`.slice(0, 30), PIN);
  rec('a wrong PIN and an unknown @ get the same refusal', wrong.status === 401 && unknown.status === 401 && wrong.code === unknown.code,
    `${wrong.status} ${wrong.code} / ${unknown.status} ${unknown.code}`);
  const s1 = await login(A.handle, PIN);
  const access1 = s1.body?.token, r1 = s1.body?.refresh_token;
  const accessMin = s1.body ? (new Date(s1.body.expires_at) - Date.now()) / 60000 : 0;
  const refreshDays = s1.body ? (new Date(s1.body.refresh_expires_at) - Date.now()) / 86400000 : 0;
  rec('the right PIN opens a session: ~15-minute access, ~30-day sign-in', s1.status === 200 && access1 && r1
    && accessMin > 13 && accessMin <= 15.5 && refreshDays > 29 && refreshDays <= 30.1,
    `${s1.status} ${s1.code ?? ''} access ${accessMin.toFixed(1)} min, sign-in ${refreshDays.toFixed(1)} d; fields=${Object.keys(s1.body ?? {}).join(',')}`);

  // ── the core journey ───────────────────────────────────────────────────────
  const me = await http(`/v1/merchants/${A.merchant}`, { token: access1 });
  rec('home: the Business\'s own profile, verified', me.status === 200 && me.body?.id === A.merchant && me.body?.verified === true,
    `${me.status} verified=${me.body?.verified}`);
  const wallet = await http('/v1/wallets', { token: access1 });
  const walletId = wallet.body?.id ?? wallet.body?.wallet_id;
  rec('its wallet', wallet.status === 200 && walletId, `${wallet.status} ${String(walletId).slice(0, 8)}`);
  const bal = await http(`/v1/wallets/${walletId}/balance`, { token: access1 });
  rec('balance: a real 0 Kz, not an error', bal.status === 200 && bal.body?.available_minor === 0 && bal.body?.currency === 'AOA',
    `${bal.status} available=${bal.body?.available_minor} ${bal.body?.currency}`);
  const hist = await http('/v1/transactions', { token: access1 });
  const items = hist.body?.data ?? hist.body?.transactions ?? hist.body?.items ?? (Array.isArray(hist.body) ? hist.body : null);
  rec('history: an empty list', hist.status === 200 && Array.isArray(items) && items.length === 0, `${hist.status} ${Array.isArray(items) ? items.length : typeof hist.body}`);

  // ── renewal and reuse ──────────────────────────────────────────────────────
  const s2 = await refresh(r1);
  const r2 = s2.body?.refresh_token;
  rec('the refresh token is exchanged for a new pair', s2.status === 200 && s2.body?.token && r2 && r2 !== r1, `${s2.status}`);
  const again = await http(`/v1/merchants/${A.merchant}`, { token: s2.body?.token });
  rec('the renewed access token works', again.status === 200);
  const claim = await http('/v1/merchant/auth/claim', { method: 'POST', token: s2.body?.token, body: { handle: A.handle, pin: '135790' } });
  rec('the retired claim route sets nothing, even for a signed-in Business', claim.status === 410 && claim.code === 'PIN_SET_BY_ACTIVATION', `${claim.status} ${claim.code}`);
  const reuse = await refresh(r1);
  rec('the old refresh token presented again is refused', reuse.status === 401 && reuse.code === 'SESSION_ENDED', `${reuse.status} ${reuse.code}`);
  const afterReuse = await refresh(r2);
  rec('…and the reuse ended the whole sign-in: the new pair is dead too', afterReuse.status === 401, `${afterReuse.status} ${afterReuse.code}`);

  // ── sign-out ───────────────────────────────────────────────────────────────
  const s3 = await login(A.handle, PIN);
  const out3 = await logout(s3.body?.refresh_token);
  const dead3 = await refresh(s3.body?.refresh_token);
  rec('sign-out ends the session: its refresh token no longer renews', s3.status === 200 && out3.status === 204 && dead3.status === 401,
    `logout ${out3.status}, refresh ${dead3.status}`);
  const junk = await logout(`bzs_${'0'.repeat(40)}`);
  rec('sign-out with a token that means nothing still answers 204 (nothing to learn)', junk.status === 204, `${junk.status}`);

  // ── authority ──────────────────────────────────────────────────────────────
  const aOnB = await http(`/v1/merchants/${B.merchant}`, { token: s3.body?.token });
  const bWallet = ssh(`${PRE} q "select id from wallets where merchant_id='${B.merchant}' limit 1"`).trim();
  const aOnBBal = await http(`/v1/wallets/${bWallet}/balance`, { token: s3.body?.token });
  const aOnBWallet = await http(`/v1/wallets/${bWallet}`, { token: s3.body?.token });
  const leaked = [aOnB, aOnBBal, aOnBWallet].some((r) => r.status === 200);
  rec('A\'s token reads nothing of B: profile, wallet, balance', !leaked && bWallet,
    `${aOnB.status} ${aOnBWallet.status} ${aOnBBal.status}`);

  const s4 = await login(A.handle, PIN);
  ssh(`${PRE}
    T=$(mint "${A.merchant}")
    docker exec "$GWC" curl -s -o /dev/null -X POST http://localhost:8080/v1/merchants/${A.merchant}/suspend -H "Authorization: Bearer $T"`);
  const suspended = await refresh(s4.body?.refresh_token);
  rec('a suspended Business cannot renew its session', s4.status === 200 && suspended.status === 401 && suspended.code === 'SESSION_ENDED',
    `${suspended.status} ${suspended.code}`);

  const reasons = ssh(`${PRE} q "select coalesce(revoked_reason,'LIVE')||':'||count(*) from merchant_app_sessions where merchant_id='${A.merchant}' group by 1 order by 1"`).trim().split('\n');
  rec('the database records why each session ended', ['REUSE_DETECTED', 'SIGNED_OUT', 'BUSINESS_NOT_ACTIVE'].every((r) => reasons.some((x) => x.startsWith(r))),
    reasons.join(' '));
  const plaintext = ssh(`${PRE} q "select count(*) from merchant_app_sessions where merchant_id='${A.merchant}' and refresh_token_hash like 'bzs_%'"`).trim();
  rec('refresh tokens are stored only as hashes', plaintext === '0', `plaintext rows=${plaintext}`);
}

function cleanup() {
  for (const m of fixtures.filter(Boolean)) {
    try {
      ssh(`${PRE}
        T=$(mint "${m}")
        docker exec "$GWC" curl -s -o /dev/null -X POST http://localhost:8080/v1/merchants/${m}/suspend -H "Authorization: Bearer $T"`);
    } catch { /* best effort; fixtures are synthetic */ }
  }
}

try {
  await main();
} catch (e) {
  rec('harness completed', false, e.message);
} finally {
  cleanup();
}
const failed = steps.filter((s) => !s.ok);
const report = { schema: 'banzami-business-app-session-e2e/v1', gateway: GW, ran_at: new Date().toISOString(),
  steps, pass: steps.length - failed.length, fail: failed.length, verdict: failed.length ? 'FAIL' : 'PASS' };
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`\n  ${report.verdict}  ${report.pass}/${steps.length}   ${OUT}\n`);
process.exit(failed.length ? 1 : 0);
