#!/usr/bin/env node
/**
 * The Console's Configuração financeira, in a real browser, on the deployed
 * site — what a Project's owner does to get a Business, click by click.
 *
 *   node tools/e2e/console/financial-onboarding-ui.mjs [--out <dir>]
 *
 * A fresh synthetic workspace with two Projects, an OWNER and a DEVELOPER, on
 * the self-service Public Sandbox (ADR-060 — no application, no review):
 *
 *   A — the page offers the two use cases and no verification form; the
 *       DEVELOPER sees them with nothing to press; the OWNER picks "Loja,
 *       serviço ou negócio" and configures. The page shows the Project's test
 *       Business (SANDBOX_SYNTHETIC), Core holds it as the Project's own, and a
 *       reload still shows it. Cleanup retires it through Core (cleanupRun).
 *   B — the OWNER picks "Ligar um negócio que já existe" and types the consent
 *       code a synthetic existing Business issued (lower case, no dashes). The
 *       page names the Business; after a reload it shows the Business card
 *       (name · @handle · Verificado), and the binding names that Business.
 *
 * (Until SANDBOX-SELF-SERVICE-001 this harness drove the KYB application form,
 * which the Sandbox Console no longer shows; it failed at its first click.)
 *
 * Nothing on the page links to the public candidature. Screenshots go to
 * <out>; the consent code is never on one. Fixtures are retired at the end,
 * whatever happens. Nothing here moves money.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assuranceDir } from '../lib/assurance-output.mjs';
import { join } from 'node:path';
import { registerCleanup } from './lib/run-cleanup.mjs';
import { mintSession } from './lib/mint.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ?? '/Users/fm65/doa/node_modules/@playwright/test/index.mjs');

const API = process.env.DEV_API ?? 'https://developer-api.banzami.com';
const ORIGIN = 'https://developers.banzami.com';
const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';
const HERE = new URL('.', import.meta.url).pathname;
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const OUT = arg('--out', assuranceDir(`business/console-onboarding-ui-${Date.now()}`));
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
  PG="$P-postgres-1"; CORE="$P-core-api-staging"; GWC="$P-api-gateway-staging"
  PW=$(cat /root/.banzami/operator_db_url | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }
  mint(){ SECRET="$JWTSEC" V="$1" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={merchant_id:process.env.V,scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }
`;

const stamp = Date.now().toString(36);
const emailOf = (r) => `onbui-${r}-${stamp}@banzami-e2e.test`;
registerCleanup({ emailPattern: `onbui-%-${stamp}@banzami-e2e.test`, namePattern: `onbui-%${stamp}` });

const session = (email) =>
  mintSession(email);

async function call(token, path, method = 'GET', body) {
  const headers = { cookie: `__Host-bz_dev_session=${token}` };
  if (method !== 'GET') {
    const j = await (await fetch(`${API}/auth/me`, { headers })).json().catch(() => ({}));
    Object.assign(headers, { 'content-type': 'application/json', origin: ORIGIN, 'x-csrf-token': j.csrf_token ?? '' });
  }
  const r = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* */ }
  return { status: r.status, body: j };
}

let browser = null;
let business = null;

async function consolePage(token, ws, project) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: '__Host-bz_dev_session', value: token, url: API, httpOnly: true, secure: true, sameSite: 'Lax' }]);
  await ctx.addInitScript(([w, p]) => {
    localStorage.setItem('bz_dev_active_ws', w);
    localStorage.setItem(`bz_dev_active_prj_${w}`, p);
  }, [ws, project]);
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/financeiro`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="financial-onboarding"]').waitFor({ timeout: 20000 });
  return page;
}
const stateOf = (page) => page.locator('[data-testid="financial-onboarding"]').getAttribute('data-state');
const text = async (page) => (await page.locator('main, body').first().innerText()).replace(/\s+/g, ' ');
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });

async function main() {
  console.log(`\n▸ Console · Configuração financeira — ${ORIGIN}\n`);

  // ── fixtures ────────────────────────────────────────────────────────────────
  // The identities come from signing in. These runs used to INSERT rows into
  // account_identity.identity_users, because the old mint script could only sign in
  // an account that already existed — a harness writing into the authentication
  // store to give itself someone to be. Verifying a code creates the identity on
  // the way through, exactly as it does for a first-time developer.
  const owner = session(emailOf('owner'));
  const dev = session(emailOf('dev'));
  const ws = (await call(owner, '/workspaces', 'POST', { name: `onbui-ws-${stamp}` })).body?.id;
  const A = (await call(owner, `/workspaces/${ws}/projects`, 'POST', { name: `onbui-a-${stamp}` })).body?.id;
  const B = (await call(owner, `/workspaces/${ws}/projects`, 'POST', { name: `onbui-b-${stamp}` })).body?.id;
  ssh(`${PRE}
    q "insert into developer.dev_workspace_members (workspace_id, user_id, role, accepted_at, status)
       select '${ws}', u.id, 'DEVELOPER', now(), 'ACTIVE' from account_identity.identity_users u
        where u.email='${emailOf('dev')}'" >/dev/null`);
  rec('a fresh workspace with two Projects, an OWNER and a DEVELOPER', ws && A && B, `${String(A).slice(0, 8)} ${String(B).slice(0, 8)}`);

  browser = await chromium.launch();

  // ── A: the Project's own test Business, by use case ────────────────────────
  const devPage = await consolePage(dev, ws, A);
  const devGo = await devPage.locator('[data-testid="sandbox-setup-go"]').count();
  const devText = await text(devPage);
  rec('the DEVELOPER sees the use cases with nothing to press',
    (await stateOf(devPage)) === 'NOT_CONFIGURED' && devGo === 0 && devText.includes('Só um Owner ou Admin'), `go_buttons=${devGo}`);
  await shot(devPage, '01-developer-view');
  await devPage.context().close();

  const page = await consolePage(owner, ws, A);
  rec('Configuração financeira opens NOT_CONFIGURED for a new Project', (await stateOf(page)) === 'NOT_CONFIGURED', await stateOf(page));
  rec('nothing on the page sends the developer to the public candidature',
    (await page.locator('a[href*="/comerciantes/candidatura"]').count()) === 0);
  const useCases = await page.locator('[data-testid^="use-case-"]').count();
  const reviewForm = await page.getByRole('button', { name: 'Iniciar verificação' }).count();
  rec('the Sandbox offers the two use cases, and no verification form', useCases === 2 && reviewForm === 0, `use_cases=${useCases} verification_buttons=${reviewForm}`);
  await shot(page, '02-use-cases');
  await page.locator('[data-testid="use-case-STANDARD"]').click();
  await page.locator('[data-testid="sandbox-setup-go"]').click();
  await page.locator('[data-testid="sandbox-business-panel"]').waitFor({ timeout: 30000 }).catch(() => {});
  const configured = await text(page);
  rec('configuring shows the Project\'s test Business, SANDBOX_SYNTHETIC',
    (await page.locator('[data-testid="sandbox-business-panel"]').count()) === 1 && configured.includes('SANDBOX_SYNTHETIC'), await stateOf(page));
  const owned = ssh(`${PRE} q "select c.kyb_status from sandbox_businesses b join merchant_compliance c on c.merchant_id=b.merchant_id where b.project_id='${A}'"`).trim();
  rec('Core holds it as Project A\'s own synthetic Business', owned === 'SANDBOX_SYNTHETIC', owned);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-testid="financial-onboarding"]').waitFor();
  rec('a reload still shows the test Business', (await page.locator('[data-testid="sandbox-business-panel"]').count()) === 1, await stateOf(page));
  await shot(page, '03-configured');
  await page.context().close();

  // ── B: an existing Business, with its consent ───────────────────────────────
  const handleB = `onbuib${stamp}`.slice(0, 30);
  const made = ssh(`${PRE}
    JWTSEC=$(docker exec "$GWC" sh -c 'cat /run/secrets/jwt_secret')
    ROOT=$(mint 00000000-0000-0000-0000-000000000001)
    M=$(printf '{"name":"Negocio Consola ${stamp}","email":"onbui-biz-${stamp}@projects.banzami.test"}' | docker exec -i "$GWC" curl -s -X POST http://localhost:8080/v1/merchants -H "Authorization: Bearer $ROOT" -H 'Content-Type: application/json' --data @- | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).id||"")}catch{}})')
    T=$(mint "$M")
    docker exec "$GWC" curl -s -o /dev/null -X POST http://localhost:8080/v1/wallets -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"currency":"AOA"}'
    docker exec "$CORE" curl -s -o /dev/null -X POST http://localhost:8081/internal/v1/sandbox/business-readiness -H 'Content-Type: application/json' -d "{\\"merchant_id\\":\\"$M\\",\\"handle\\":\\"${handleB}\\"}"
    C=$(docker exec "$GWC" curl -s -X POST http://localhost:8080/v1/merchant/project-link-codes -H "Authorization: Bearer $T")
    printf '%s|%s' "$M" "$C"`).trim();
  const [merchant, craw] = made.split('|');
  business = { merchant };
  let code = ''; try { code = JSON.parse(craw).code ?? ''; } catch { /* */ }
  rec('a synthetic existing Business issued a consent code from its own session', /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), String(merchant).slice(0, 8));

  const pb = await consolePage(owner, ws, B);
  await pb.getByRole('button', { name: 'Ligar um negócio que já existe' }).click();
  await shot(pb, '06-connect-form');
  // As a person might type it: lower case, no dashes. Not screenshotted.
  await pb.fill('#fo-link-code', code.replace(/-/g, '').toLowerCase());
  await pb.getByRole('button', { name: 'Ligar negócio' }).click();
  await pb.getByText(`Negocio Consola ${stamp}`).first().waitFor({ timeout: 20000 }).catch(() => {});
  rec('connecting names the Business that consented', (await text(pb)).includes(`Negocio Consola ${stamp}`));
  await pb.reload({ waitUntil: 'networkidle' });
  await pb.locator('[data-testid="financial-onboarding"]').waitFor();
  const bState = await stateOf(pb);
  const bText = await text(pb);
  rec('after a reload the Project shows the Business card — name · @handle · Verificado',
    ['READY', 'BLOCKED'].includes(bState) && bText.includes(`Negocio Consola ${stamp}`) && bText.includes(`@${handleB}`) && bText.includes('Verificado'),
    bState);
  await shot(pb, '07-connected');
  await pb.context().close();
  const bound = ssh(`${PRE} q "select merchant_id::text from developer.dev_project_sandbox_binding where project_id='${B}' and state='ACTIVE'"`).trim();
  rec('the binding names the existing Business: nothing was created', bound === merchant, bound.slice(0, 8));
}

function cleanup() {
  try {
    ssh(`${PRE}
      ${business?.merchant ? `JWTSEC=$(docker exec "$GWC" sh -c 'cat /run/secrets/jwt_secret')
      T=$(mint "${business.merchant}")
      docker exec "$GWC" curl -s -o /dev/null -X POST http://localhost:8080/v1/merchants/${business.merchant}/suspend -H "Authorization: Bearer $T"` : ''}
      echo ok`);
  } catch { /* the run-cleanup hook still retires identities and Projects */ }
}

try {
  await main();
} catch (e) {
  rec('harness completed', false, e.message);
} finally {
  await browser?.close().catch(() => {});
  cleanup();
}
const failed = steps.filter((s) => !s.ok);
const report = { schema: 'banzami-console-onboarding-ui-e2e/v1', origin: ORIGIN, ran_at: new Date().toISOString(),
  steps, pass: steps.length - failed.length, fail: failed.length, verdict: failed.length ? 'FAIL' : 'PASS' };
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`\n  ${report.verdict}  ${report.pass}/${steps.length}   ${OUT}\n`);
process.exit(failed.length ? 1 : 0);
