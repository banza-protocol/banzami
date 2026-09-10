#!/usr/bin/env node
/**
 * After an operator approves a Business application in BANZADMIN: is the
 * Business what Banzami says it is, everywhere — and can its owner run it?
 *
 *   node tools/e2e/business/approved-business-e2e.mjs \
 *     --application <id or 8-char reference> --activation '<activation link>' \
 *     [--console-state <state.json from financial-onboarding-ui --keep-for-review>] \
 *     [--retire] [--out <dir>]
 *
 * Proves on the deployed Sandbox:
 *   review     APPROVED as PROVISIONED_NEW by a named operator (not the Sandbox
 *              auto-approval), with the approval in the operator audit trail;
 *   identity   ONE Business: ACTIVE, KYB APPROVED (the one authority), verified,
 *              the @handle it asked for owned by it and no one else, one AOA
 *              wallet, class MERCHANT (approval never promotes), priced;
 *   project    (with --console-state) the Project that applied is bound to that
 *              same Business; the Console and the Project key's
 *              /v1/financial-setup both name it;
 *   app        its owner activates from the link, signs in, reads the profile
 *              and a real 0 Kz, receives a payment (a synthetic consumer pays a
 *              link the Business made), sees the balance and the history move,
 *              renews the session, signs out and is refused afterwards.
 * --retire then suspends the Business and retires the Console fixtures.
 *
 * The PIN is generated here; the activation token and the PIN stay in request
 * bodies and are never printed. NEVER run the ssh parts under `bash -x`.
 */
import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const GW = process.env.GW_API ?? 'https://sandbox-api.banzami.com';
const DEVAPI = process.env.DEV_API ?? 'https://developer-api.banzami.com';
const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';
const HERE = new URL('.', import.meta.url).pathname;
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const APP = arg('--application');
const ACT = arg('--activation');
const CSTATE = arg('--console-state');
const RETIRE = process.argv.includes('--retire');
const OUT = arg('--out', join(process.cwd(), `evidence/assurance/business/approved-business-${Date.now()}`));
if (!APP || !ACT) { console.error('usage: --application <id> --activation <link>'); process.exit(2); }
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
  PG="$P-postgres-1"; CORE="$P-core-api-staging"; GWC="$P-api-gateway-staging"; DEV="$P-developer-api"; PUB="$P-public-api-staging"
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }
  JWTSEC=$(docker exec "$GWC" sh -c 'cat /run/secrets/jwt_secret')
  mint(){ SECRET="$JWTSEC" K="$1" V="$2" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};cl[process.env.K]=process.env.V;const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }
`;
const q = (sql) => ssh(`${PRE} q "${sql.replace(/"/g, '\\"')}"`).trim();

async function http(base, path, { method = 'GET', token, body, cookie, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (cookie) h.cookie = cookie;
  if (body) h['content-type'] = 'application/json';
  const r = await fetch(`${base}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* 204 */ }
  return { status: r.status, body: j, code: j?.code ?? j?.error?.code };
}

const token = (() => { try { const u = new URL(ACT); return u.searchParams.get('token') ?? u.pathname.split('/').filter(Boolean).pop(); } catch { return ACT.trim(); } })();
const PIN = String(randomInt(100000, 999999));
const stamp = Date.now().toString(36);
let merchant = null;

async function main() {
  console.log(`\n▸ approved Business — application ${APP.slice(0, 8)}\n`);

  // ── the review ─────────────────────────────────────────────────────────────
  const row = q(`select id::text||'|'||status||'|'||coalesce(resolution,'')||'|'||coalesce(reviewed_by,'')||'|'||sandbox_auto_approved||'|'||coalesce(created_merchant_id::text,'')||'|'||desired_handle||'|'||origin||'|'||coalesce(project_id::text,'')||'|'||provisioning_project_bound from merchant_applications where id::text like '${APP.toLowerCase()}%'`);
  const [appId, status, resolution, reviewer, autoApproved, mid, handle, origin, projectId, projectBound] = row.split('|');
  merchant = mid;
  rec('approved as a NEW Business by a named operator, not the Sandbox auto-approval',
    status === 'APPROVED' && resolution === 'PROVISIONED_NEW' && reviewer && reviewer !== 'e2e-fixture-cleanup' && autoApproved === 'false',
    `${status} ${resolution} origin=${origin}`);
  const audit = q(`select action||'|'||(admin_email is not null)||'|'||role from admin_audit_log where entity_id='${appId}' and action ilike '%APPROV%' order by created_at desc limit 1`);
  rec('the approval is in the operator audit trail, with the operator', /APPROV/.test(audit) && audit.split('|')[1] === 'true', audit.split('|')[0]);
  const docsViewed = q(`select count(*) from admin_audit_log where action='VIEW_KYB_DOCUMENT' and (entity_id='${appId}' or entity_id in (select id::text from merchant_application_documents where application_id='${appId}'))`);
  rec('the operator opened the documents in BANZADMIN (audited)', Number(docsViewed) > 0, `${docsViewed} document action(s)`);

  // ── the canonical Business ─────────────────────────────────────────────────
  const b = q(`select m.status||'|'||coalesce(c.kyb_status,'')||'|'||m.verified||'|'||m.business_account_type||'|'||coalesce(m.pricing_profile_id::text,'') from merchants m left join merchant_compliance c on c.merchant_id=m.id where m.id='${mid}'`);
  const [mstatus, kyb, verified, klass, profile] = b.split('|');
  rec('ONE Business: ACTIVE, KYB APPROVED, verified', mstatus === 'ACTIVE' && kyb === 'APPROVED' && verified === 'true', b);
  rec('approval did not promote it: class MERCHANT', klass === 'MERCHANT', klass);
  rec('it is priced by the operator', profile !== '', profile || 'none');
  const owners = q(`select string_agg(owner_type||':'||owner_id::text, ',') from handle_registry where handle='${handle}'`);
  rec("the @handle it asked for is its own, and no one else's", owners === `MERCHANT:${mid}`, `@${handle}`);
  const wallets = q(`select count(*)||'|'||string_agg(currency, ',') from wallets where merchant_id='${mid}'`);
  rec('one AOA wallet', wallets === '1|AOA', wallets);
  const dupes = q(`select count(*) from merchants where lower(name)=(select lower(name) from merchants where id='${mid}') and status='ACTIVE'`);
  rec('no second Business with its name', dupes === '1', dupes);

  // ── the Project that applied ───────────────────────────────────────────────
  let state = null;
  if (CSTATE) {
    state = JSON.parse(readFileSync(CSTATE, 'utf8'));
    rec('the application came from that Project', origin === 'DEVELOPER_PROJECT' && projectId === state.projectA, `${origin} ${projectId.slice(0, 8)}`);
    const bound = q(`select merchant_id::text||'|'||state from developer.dev_project_sandbox_binding where project_id='${state.projectA}' and state='ACTIVE'`);
    rec('approval bound the Project to the new Business', bound === `${mid}|ACTIVE` && projectBound === 'true', bound);
    const sess = execFileSync('bash', [join(HERE, '../console/mint-console-session.sh'), state.owner, '30'], { encoding: 'utf8' }).trim().split('\n').pop();
    const fs = await http(DEVAPI, `/projects/${state.projectA}/financial-setup`, { cookie: `__Host-bz_dev_session=${sess}` });
    const bus = fs.body?.onboarding?.business;
    rec('the Console shows that Business on the Project', ['READY', 'BLOCKED'].includes(fs.body?.onboarding?.state) && bus?.handle === `@${handle}` && bus?.verified === true,
      `${fs.body?.onboarding?.state} ${bus?.handle}`);
    const keyView = ssh(`${PRE}
      DEVINT=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key')
      K=$(printf '{"name":"approved-${stamp}","scopes":["identity:read"],"created_by":"00000000-0000-4000-8000-000000000001"}' | docker exec -i "$DEV" curl -s -X POST http://localhost:8086/internal/v1/projects/${state.projectA}/fixture-keys -H "X-Internal-Key: $DEVINT" -H 'Content-Type: application/json' --data @-)
      SECRET=$(printf '%s' "$K" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).secret||"")}catch{}})')
      KID=$(printf '%s' "$K" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).id||"")}catch{}})')
      curl -s ${GW}/v1/financial-setup -H @/dev/fd/3 3< <(printf 'Authorization: Bearer %s\\n' "$SECRET")
      docker exec "$DEV" curl -s -o /dev/null -X POST http://localhost:8086/internal/v1/fixture-keys/$KID/revoke -H "X-Internal-Key: $DEVINT"`);
    let kv = {}; try { kv = JSON.parse(keyView); } catch { /* */ }
    rec("the Project key's /v1/financial-setup names the same Business", kv.financial_identity?.handle === `@${handle}` && kv.kyb?.status === 'APPROVED',
      `${kv.financial_identity?.handle} kyb=${kv.kyb?.status} onboarding=${kv.onboarding?.state}`);
  }

  // ── the Business App ───────────────────────────────────────────────────────
  const v = await http(GW, '/v1/merchant/activation/validate', { method: 'POST', body: { token } });
  rec('the activation link from the approval validates and names the Business', v.status === 200 && v.body?.valid === true && v.body?.handle === handle, `${v.status} @${v.body?.handle}`);
  const c = await http(GW, '/v1/merchant/activation/complete', { method: 'POST', body: { token, pin: PIN } });
  rec('its owner sets the PIN', [200, 201, 204].includes(c.status), `${c.status}`);
  const s1 = await http(GW, '/v1/merchant/auth/token', { method: 'POST', body: { handle, pin: PIN } });
  const at = s1.body?.token, rt = s1.body?.refresh_token;
  rec('signs in with @handle and PIN', s1.status === 200 && at && rt, `${s1.status}`);
  const me = await http(GW, `/v1/merchants/${mid}`, { token: at });
  rec('profile: its own, verified', me.status === 200 && me.body?.id === mid && me.body?.verified === true, `verified=${me.body?.verified}`);
  const w = await http(GW, '/v1/wallets', { token: at });
  const wid = w.body?.id ?? w.body?.wallet_id;
  const bal0 = await http(GW, `/v1/wallets/${wid}/balance`, { token: at });
  rec('balance: a real 0 Kz', bal0.status === 200 && bal0.body?.available_minor === 0, `${bal0.body?.available_minor}`);

  // Receive: the Business makes a link; a synthetic consumer pays it.
  const link = await http(GW, '/v1/payment-links', { method: 'POST', token: at, body: { merchant_id: mid, wallet_id: wid, amount_minor: 3000, currency: 'AOA', description: `recebido ${stamp}` } });
  const slug = link.body?.slug;
  rec('receive: the Business creates a payment link', [200, 201].includes(link.status) && slug, `${link.status}`);
  const paid = ssh(`${PRE}
    R=$(printf '{"handle":"apb${stamp}","pin":"1357","display_name":"Pagador ${stamp}"}' | docker exec -i "$PUB" curl -s -X POST http://localhost:8083/v1/auth/register -H 'Content-Type: application/json' --data @-)
    CID=$(printf '%s' "$R" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).consumer.id||"")}catch{}})')
    CT=$(printf '%s' "$R" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).token||"")}catch{}})')
    docker exec "$GWC" curl -s -o /dev/null -X POST http://localhost:8080/v1/compliance/customers/verify -H "Authorization: Bearer $(mint customer_id "$CID")" -H 'Content-Type: application/json' -d '{"full_name":"SYN","document_type":"BILHETE_DE_IDENTIDADE","document_number":"AP${stamp}","date_of_birth":"1990-01-01","requested_level":"BASIC"}'
    docker exec "$CORE" curl -s -o /dev/null -X POST http://localhost:8081/internal/v1/consumer-wallets/test-credit -H 'Content-Type: application/json' -d "{\\"consumer_id\\":\\"$CID\\",\\"amount_minor\\":10000,\\"currency\\":\\"AOA\\"}"
    docker exec "$PUB" curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:8083/v1/payment-links/${slug}/pay -H "Authorization: Bearer $CT" -H 'Content-Type: application/json' -d '{"amount_minor":3000}'`).trim();
  rec('receive: a consumer pays it', paid === '200', paid);
  const bal1 = await http(GW, `/v1/wallets/${wid}/balance`, { token: at });
  rec('balance: the payment, to the minor unit', bal1.body?.available_minor === 3000, `${bal1.body?.available_minor}`);
  const hist = await http(GW, '/v1/merchant/wallet-payments', { token: at });
  const items = hist.body?.data ?? hist.body?.items ?? (Array.isArray(hist.body) ? hist.body : []);
  rec('history: the payment is there', hist.status === 200 && items.some((i) => Number(i.amount_minor) === 3000), `${items.length} item(s)`);

  const s2 = await http(GW, '/v1/merchant/auth/refresh', { method: 'POST', body: { refresh_token: rt } });
  rec('the session renews (new pair)', s2.status === 200 && s2.body?.refresh_token && s2.body.refresh_token !== rt);
  const out = await http(GW, '/v1/merchant/auth/logout', { method: 'POST', body: { refresh_token: s2.body?.refresh_token } });
  const dead = await http(GW, '/v1/merchant/auth/refresh', { method: 'POST', body: { refresh_token: s2.body?.refresh_token } });
  rec('sign-out ends it: the refresh token is refused afterwards', out.status === 204 && dead.status === 401, `${out.status}/${dead.status}`);
  const again = await http(GW, '/v1/merchant/auth/token', { method: 'POST', body: { handle, pin: PIN } });
  rec('and a fresh sign-in works', again.status === 200);
  if (again.body?.refresh_token) await http(GW, '/v1/merchant/auth/logout', { method: 'POST', body: { refresh_token: again.body.refresh_token } });

  if (RETIRE) {
    ssh(`${PRE}
      docker exec "$GWC" curl -s -o /dev/null -X POST http://localhost:8080/v1/merchants/${mid}/suspend -H "Authorization: Bearer $(mint merchant_id ${mid})"
      echo ok`);
    rec('retired: the fixture Business is suspended', q(`select status from merchants where id='${mid}'`) === 'SUSPENDED');
  }
}

try { await main(); } catch (e) { rec('harness completed', false, e.message); }
const failed = steps.filter((s) => !s.ok);
const report = { schema: 'banzami-approved-business-e2e/v1', application: APP, merchant, ran_at: new Date().toISOString(),
  steps, pass: steps.length - failed.length, fail: failed.length, verdict: failed.length ? 'FAIL' : 'PASS' };
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`\n  ${report.verdict}  ${report.pass}/${steps.length}   ${OUT}\n`);
process.exit(failed.length ? 1 : 0);
