#!/usr/bin/env node
/**
 * A Developer Project gets a Business — on the deployed Sandbox, through the
 * Console's own API, as a member of the Project would.
 *
 *   node tools/e2e/business/project-onboarding-e2e.mjs [--out <dir>]
 *
 * Two synthetic Projects in a fresh synthetic workspace (an OWNER and a
 * DEVELOPER member):
 *
 *   A applies for a NEW Business. The retired one-click owner is refused; a
 *     DEVELOPER cannot apply; the OWNER's application arrives as origin
 *     DEVELOPER_PROJECT with the Project named by the session, not the body;
 *     the Project reads IN_REVIEW in the Console and on /v1/financial-setup with
 *     a Project key; a second application is refused while one is in progress.
 *   B connects an EXISTING Business with that Business's consent. A synthetic
 *     Business (ACTIVE, @handle, AOA wallet) issues a code from its own
 *     session; a wrong code, a DEVELOPER, and Project A (application in
 *     progress) are all refused; the OWNER of B connects it; B reads the
 *     Business's name, @handle and verification; the same code spent again by
 *     another Project is refused; BANZADMIN's Business view lists Project B.
 *
 * Fixture identities, Projects, the Business and the application are retired
 * at the end, whatever happens. Nothing here moves money.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerCleanup } from '../console/lib/run-cleanup.mjs';

const API = process.env.DEV_API ?? 'https://developer-api.banzami.com';
const GW = process.env.GW_API ?? 'https://sandbox-api.banzami.com';
const ORIGIN = 'https://developers.banzami.com';
const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';
const HERE = new URL('.', import.meta.url).pathname;
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const OUT = arg('--out', join(process.cwd(), `evidence/assurance/business/project-onboarding-${Date.now()}`));
mkdirSync(OUT, { recursive: true });

const steps = [];
const rec = (name, ok, note = '') => {
  steps.push({ step: name, ok: Boolean(ok), note: String(note).slice(0, 300) });
  console.log(`  ${ok ? '\x1b[0;32m✓\x1b[0m' : '\x1b[0;31m✗\x1b[0m'} ${name}${note ? ` — ${note}` : ''}`);
};
const ssh = (s) => execFileSync('ssh', [REMOTE, s], { encoding: 'utf8', maxBuffer: 1 << 24 });
const PRE = `
  set -uo pipefail
  P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
  PG="$P-postgres-1"; CORE="$P-core-api-staging"; GWC="$P-api-gateway-staging"; DEV="$P-developer-api"
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }
`;

const stamp = Date.now().toString(36);
const emailOf = (r) => `onboarding-${r}-${stamp}@banzami-e2e.test`;
registerCleanup({ emailPattern: `onboarding-%-${stamp}@banzami-e2e.test`, namePattern: `onb-%${stamp}` });

const session = (email) =>
  execFileSync('bash', [join(HERE, '../console/mint-console-session.sh'), email, '60'], { encoding: 'utf8' }).trim().split('\n').pop();

async function call(token, path, method = 'GET', body) {
  const headers = { cookie: `__Host-bz_dev_session=${token}` };
  if (method !== 'GET') {
    const me = await fetch(`${API}/auth/me`, { headers });
    const j = await me.json().catch(() => ({}));
    Object.assign(headers, { 'content-type': 'application/json', origin: ORIGIN, 'x-csrf-token': j.csrf_token ?? '' });
  }
  const r = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* */ }
  return { status: r.status, body: j };
}

let business = null; // { merchant, handle }
let appA = null;
async function main() {
  console.log(`\n▸ Developer Project → Business onboarding — ${API}\n`);

  // ── identities and Projects ────────────────────────────────────────────────
  ssh(`${PRE}
    for e in ${emailOf('owner')} ${emailOf('dev')}; do
      q "insert into account_identity.identity_users (email, verified, status)
         select '$e', true, 'ACTIVE' where not exists (select 1 from account_identity.identity_users where email='$e')" >/dev/null
    done`);
  const owner = session(emailOf('owner'));
  const dev = session(emailOf('dev'));
  const ws = await call(owner, '/workspaces', 'POST', { name: `onb-ws-${stamp}` });
  const pa = await call(owner, `/workspaces/${ws.body?.id}/projects`, 'POST', { name: `onb-a-${stamp}` });
  const pb = await call(owner, `/workspaces/${ws.body?.id}/projects`, 'POST', { name: `onb-b-${stamp}` });
  const A = pa.body?.id, B = pb.body?.id;
  ssh(`${PRE}
    q "insert into developer.dev_workspace_members (workspace_id, user_id, role, accepted_at, status)
       select '${ws.body?.id}', u.id, 'DEVELOPER', now(), 'ACTIVE' from account_identity.identity_users u
        where u.email='${emailOf('dev')}'" >/dev/null`);
  rec('a fresh workspace with two Projects, an OWNER and a DEVELOPER', A && B, `${String(A).slice(0, 8)} ${String(B).slice(0, 8)}`);

  // ── a Project without a Business ───────────────────────────────────────────
  let fs = await call(owner, `/projects/${A}/financial-setup`);
  rec('a new Project is NOT_CONFIGURED, and its OWNER may act',
    fs.status === 200 && fs.body?.state === 'UNCONFIGURED' && fs.body?.onboarding?.state === 'NOT_CONFIGURED' && fs.body?.onboarding?.can_act === true,
    `${fs.body?.state}/${fs.body?.onboarding?.state}`);
  const fsDev = await call(dev, `/projects/${A}/financial-setup`);
  rec('a DEVELOPER sees the state but may not act', fsDev.status === 200 && fsDev.body?.onboarding?.can_act === false);
  const oneClick = await call(owner, `/projects/${A}/financial-setup`, 'POST');
  rec('the retired one-click owner is refused (no self-approved Business)', oneClick.status === 410 && oneClick.body?.code === 'FINANCIAL_SETUP_BY_REVIEW', `${oneClick.status} ${oneClick.body?.code}`);

  // ── A applies for a NEW Business ───────────────────────────────────────────
  const handleA = `onb_${stamp}`.slice(0, 30);
  const application = {
    desired_handle: handleA, business_name: `Loja Projeto ${stamp}`, category: 'Tecnologia', email: `app-${stamp}@exemplo.co.ao`,
    phone: '+244 923456789', nif: '5001234567', province: 'Luanda', municipality: 'Talatona', city: 'Talatona',
    address: 'Rua Direita do Kilamba', legal_representative: 'João da Silva', representative_role: 'Proprietário(a)',
    business_activity: 'Aplicação de entregas', terms_accepted: true,
    // Would be ignored: the Project and the member come from the session.
    project_id: '00000000-0000-4000-8000-000000000000', submitted_by_user_id: '00000000-0000-4000-8000-000000000000',
  };
  const devApply = await call(dev, `/projects/${A}/financial-onboarding/applications`, 'POST', application);
  rec('a DEVELOPER cannot apply for the Project', devApply.status === 403, `${devApply.status}`);
  const apply = await call(owner, `/projects/${A}/financial-onboarding/applications`, 'POST', { ...application, idempotency_key: `onb-${stamp}` });
  appA = apply.body?.application_id;
  rec('the OWNER applies: SUBMITTED', apply.status === 201 && appA, `${apply.status} ${String(appA).slice(0, 8)}`);
  const stored = ssh(`${PRE} q "select origin||'|'||project_id::text||'|'||status from merchant_applications where id='${appA}'"`).trim();
  rec('it is the ONE Business application, origin DEVELOPER_PROJECT, for THIS Project', stored === `DEVELOPER_PROJECT|${A}|SUBMITTED`, stored);
  fs = await call(owner, `/projects/${A}/financial-setup`);
  const app = fs.body?.onboarding?.application;
  rec('the Project reads IN_REVIEW with what is still due', fs.body?.onboarding?.state === 'IN_REVIEW'
    && app?.requested_handle === handleA && (app?.requirements?.currently_due ?? []).some((i) => i.code === 'BUSINESS_REGISTRATION'),
  `${fs.body?.onboarding?.state} due=${(app?.requirements?.currently_due ?? []).map((i) => i.code).join(',')}`);
  const again = await call(owner, `/projects/${A}/financial-onboarding/applications`, 'POST', { ...application, desired_handle: `${handleA}x`.slice(0, 30) });
  rec('a second application while one is in progress is refused', again.status === 409 && again.body?.code === 'APPLICATION_IN_PROGRESS', `${again.status} ${again.body?.code}`);

  // A Project key reads the same, and nothing more.
  const keyView = ssh(`${PRE}
    DEVINT=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key')
    K=$(printf '{"name":"onb-key-${stamp}","scopes":["identity:read"],"created_by":"00000000-0000-4000-8000-000000000001"}' | docker exec -i "$DEV" curl -s -X POST http://localhost:8086/internal/v1/projects/${A}/fixture-keys -H "X-Internal-Key: $DEVINT" -H 'Content-Type: application/json' --data @-)
    SECRET=$(printf '%s' "$K" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).secret||"")}catch{}})')
    KID=$(printf '%s' "$K" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).id||"")}catch{}})')
    curl -s ${GW}/v1/financial-setup -H @/dev/fd/3 3< <(printf 'Authorization: Bearer %s\\n' "$SECRET")
    docker exec "$DEV" curl -s -o /dev/null -X POST http://localhost:8086/internal/v1/fixture-keys/$KID/revoke -H "X-Internal-Key: $DEVINT"`);
  let kv = {}; try { kv = JSON.parse(keyView); } catch { /* */ }
  rec('the Project key reads onboarding IN_REVIEW and the requested @, not the application',
    kv.onboarding?.state === 'IN_REVIEW' && kv.onboarding?.requested_handle === `@${handleA}` && !keyView.includes(application.business_name) && !keyView.includes('5001234567'),
    JSON.stringify(kv.onboarding ?? kv).slice(0, 160));

  // ── an existing Business consents ──────────────────────────────────────────
  const handleB = `onbb${stamp}`.slice(0, 30);
  const made = ssh(`${PRE}
    JWTSEC=$(docker exec "$GWC" sh -c 'cat /run/secrets/jwt_secret')
    mint(){ SECRET="$JWTSEC" V="$1" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={merchant_id:process.env.V,scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }
    ROOT=$(mint 00000000-0000-0000-0000-000000000001)
    M=$(printf '{"name":"Negocio Existente ${stamp}","email":"onb-biz-${stamp}@projects.banzami.test"}' | docker exec -i "$GWC" curl -s -X POST http://localhost:8080/v1/merchants -H "Authorization: Bearer $ROOT" -H 'Content-Type: application/json' --data @- | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).id||"")}catch{}})')
    T=$(mint "$M")
    docker exec "$GWC" curl -s -o /dev/null -X POST http://localhost:8080/v1/wallets -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"currency":"AOA"}'
    docker exec "$CORE" curl -s -o /dev/null -X POST http://localhost:8081/internal/v1/sandbox/business-readiness -H 'Content-Type: application/json' -d "{\\"merchant_id\\":\\"$M\\",\\"handle\\":\\"${handleB}\\"}"
    C1=$(docker exec "$GWC" curl -s -X POST http://localhost:8080/v1/merchant/project-link-codes -H "Authorization: Bearer $T")
    C2=$(docker exec "$GWC" curl -s -X POST http://localhost:8080/v1/merchant/project-link-codes -H "Authorization: Bearer $T")
    printf '%s|%s|%s' "$M" "$C1" "$C2"`).trim();
  const [merchant, c1raw, c2raw] = made.split('|');
  business = { merchant, handle: handleB };
  let c1 = {}, c2 = {}; try { c1 = JSON.parse(c1raw); c2 = JSON.parse(c2raw); } catch { /* */ }
  rec('a synthetic existing Business issues consent codes from its own session', /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c2.code ?? ''), `${merchant?.slice(0, 8)} ${c2.code ? 'code issued' : c2raw}`);

  const oldCode = await call(owner, `/projects/${B}/financial-onboarding/link`, 'POST', { code: c1.code });
  rec('a code replaced by a newer one is refused', oldCode.status === 422 && oldCode.body?.code === 'LINK_CODE_INVALID', `${oldCode.status} ${oldCode.body?.code}`);
  const byHandle = await call(owner, `/projects/${B}/financial-onboarding/link`, 'POST', { code: `@${handleB}` });
  rec('typing the Business\'s @handle proves nothing', byHandle.status === 422, `${byHandle.status}`);
  const devLink = await call(dev, `/projects/${B}/financial-onboarding/link`, 'POST', { code: c2.code });
  rec('a DEVELOPER cannot connect a Business', devLink.status === 403, `${devLink.status}`);
  const aLink = await call(owner, `/projects/${A}/financial-onboarding/link`, 'POST', { code: c2.code });
  rec('a Project with an application in progress cannot also connect one', aLink.status === 409 && aLink.body?.code === 'APPLICATION_IN_PROGRESS', `${aLink.status} ${aLink.body?.code}`);
  const link = await call(owner, `/projects/${B}/financial-onboarding/link`, 'POST', { code: c2.code.toLowerCase() });
  rec('the OWNER connects the existing Business with its code', link.status === 200 && link.body?.business?.handle === `@${handleB}` && link.body?.business?.verified === true,
    `${link.status} ${JSON.stringify(link.body?.business ?? link.body).slice(0, 120)}`);
  fs = await call(owner, `/projects/${B}/financial-setup`);
  const bus = fs.body?.onboarding?.business;
  rec('Project B now receives into that Business — its name, @handle, verified',
    ['READY', 'BLOCKED'].includes(fs.body?.onboarding?.state) && bus?.handle === `@${handleB}` && bus?.verified === true && fs.body?.state === 'READY',
    `${fs.body?.state}/${fs.body?.onboarding?.state} ${bus?.name}`);
  const bound = ssh(`${PRE} q "select merchant_id::text from developer.dev_project_sandbox_binding where project_id='${B}' and state='ACTIVE'"`).trim();
  rec('the binding names the existing Business: nothing was created', bound === merchant, `${bound.slice(0, 8)}`);
  const wallets = ssh(`${PRE} q "select count(*) from wallets where merchant_id='${merchant}'"`).trim();
  rec('still one wallet for the Business', wallets === '1', wallets);
  const reuse = await call(owner, `/projects/${A}/financial-onboarding/link`, 'POST', { code: c2.code });
  rec('the spent code is refused to any other Project', reuse.status === 409 || reuse.status === 422, `${reuse.status} ${reuse.body?.code}`);

  const state = ssh(`${PRE}
    IK=$(docker exec "$GWC" sh -c 'cat /run/secrets/core_internal_key')
    docker exec "$GWC" curl -s http://localhost:8080/internal/v1/businesses/${merchant}/state -H "X-Internal-Key: $IK"`);
  let st = {}; try { st = JSON.parse(state).business ?? {}; } catch { /* */ }
  rec('BANZADMIN\'s Business view lists Project B', (st.projects ?? []).some((p) => p.project_id === B), `${(st.projects ?? []).length} project(s)`);
}

function cleanup() {
  try {
    ssh(`${PRE}
      IK=$(docker exec "$GWC" sh -c 'cat /run/secrets/core_internal_key')
      ${appA ? `docker exec "$GWC" curl -s -o /dev/null -X POST http://localhost:8080/internal/v1/merchant-applications/${appA}/reject -H "X-Internal-Key: $IK" -H 'Content-Type: application/json' -d '{"reviewed_by":"e2e-fixture-cleanup","admin_notes":"synthetic E2E application","merchant_message":"synthetic"}'` : ''}
      ${business?.merchant ? `JWTSEC=$(docker exec "$GWC" sh -c 'cat /run/secrets/jwt_secret')
      T=$(SECRET="$JWTSEC" V="${business.merchant}" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={merchant_id:process.env.V,scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));')
      docker exec "$GWC" curl -s -o /dev/null -X POST http://localhost:8080/v1/merchants/${business.merchant}/suspend -H "Authorization: Bearer $T"` : ''}
      echo ok`);
  } catch { /* the run-cleanup hook still retires identities and Projects */ }
}

try {
  await main();
} catch (e) {
  rec('harness completed', false, e.message);
} finally {
  cleanup();
}
const failed = steps.filter((s) => !s.ok);
const report = { schema: 'banzami-project-onboarding-e2e/v1', api: API, gateway: GW, ran_at: new Date().toISOString(),
  steps, pass: steps.length - failed.length, fail: failed.length, verdict: failed.length ? 'FAIL' : 'PASS' };
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`\n  ${report.verdict}  ${report.pass}/${steps.length}   ${OUT}\n`);
process.exit(failed.length ? 1 : 0);
