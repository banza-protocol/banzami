#!/usr/bin/env node
/**
 * The Console's Configuração financeira, in a real browser, on the deployed
 * site — what a Project's owner does to get a Business, click by click.
 *
 *   node tools/e2e/console/financial-onboarding-ui.mjs [--out <dir>]
 *
 * A fresh synthetic workspace with two Projects, an OWNER and a DEVELOPER:
 *
 *   A — the OWNER opens Configuração financeira, starts the verification, picks
 *       "Criar novo negócio", fills the five steps, chooses the documents and
 *       sends. The page says IN_REVIEW with the reference and the @ requested,
 *       and — where document storage is not configured — says the documents
 *       were not sent (never "enviado"). The application is origin
 *       DEVELOPER_PROJECT for Project A. A reload still says IN_REVIEW. The
 *       DEVELOPER sees the same state with nothing to press.
 *   B — the OWNER picks "Ligar negócio existente" and types the consent code a
 *       synthetic existing Business issued (lower case, no dashes). The page
 *       names the Business; after a reload it shows the Business card
 *       (name · @handle · Verificado), and the binding names that Business.
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
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }
  mint(){ SECRET="$JWTSEC" V="$1" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={merchant_id:process.env.V,scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }
`;

const stamp = Date.now().toString(36);
const emailOf = (r) => `onbui-${r}-${stamp}@banzami-e2e.test`;
// --keep-for-review leaves Project A, its owner and its application in place for
// an operator to review and approve in BANZADMIN; the follow-up check
// (--verify-approved <state.json>) then proves the provisioning. Everything
// else is retired as usual.
const KEEP = process.argv.includes('--keep-for-review');
if (!KEEP) registerCleanup({ emailPattern: `onbui-%-${stamp}@banzami-e2e.test`, namePattern: `onbui-%${stamp}` });

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

// A one-page PDF, small enough for any limit: the form checks type and size.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

let browser = null;
let appA = null;
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
async function selectFirst(page, id) {
  const values = await page.locator(`#${id} option`).evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  await page.selectOption(`#${id}`, values[0]);
}

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

  // ── A: a new Business, through the form ─────────────────────────────────────
  const page = await consolePage(owner, ws, A);
  rec('Configuração financeira opens NOT_CONFIGURED for a new Project', (await stateOf(page)) === 'NOT_CONFIGURED', await stateOf(page));
  rec('nothing on the page sends the developer to the public candidature',
    (await page.locator('a[href*="/comerciantes/candidatura"]').count()) === 0);
  await shot(page, '01-not-configured');
  await page.getByRole('button', { name: 'Iniciar verificação' }).click();
  const cards = await page.locator('[data-testid^="onboarding-path-"]').count();
  rec('"Iniciar verificação" offers the two ways: a new Business, or an existing one', cards === 2, `${cards} card(s)`);
  await shot(page, '02-two-paths');
  await page.getByRole('button', { name: 'Criar novo negócio' }).click();

  const handleA = `onbui_${stamp}`.slice(0, 30);
  // Step 1 — Negócio
  await page.fill('#fo-business-name', `Loja Consola ${stamp}`);
  await page.fill('#fo-nif', '5001234567');
  await selectFirst(page, 'fo-category');
  await page.fill('#fo-business-activity', 'Aplicação de entregas ao domicílio');
  if (await page.locator('#fo-estimated-volume').count()) await selectFirst(page, 'fo-estimated-volume');
  await page.fill('#fo-email', `onbui-app-${stamp}@exemplo.co.ao`);
  await page.fill('#fo-phone', '923456789');
  await selectFirst(page, 'fo-province');
  await selectFirst(page, 'fo-municipality');
  await page.fill('#fo-city', 'Talatona');
  await page.fill('#fo-address', 'Rua Direita do Kilamba');
  await page.getByRole('button', { name: 'Continuar' }).click();
  // Step 2 — Responsável
  await page.fill('#fo-legal-representative', 'João da Silva');
  await selectFirst(page, 'fo-representative-role');
  if (await page.locator('#fo-representative-email').count()) await page.fill('#fo-representative-email', `onbui-rep-${stamp}@exemplo.co.ao`);
  if (await page.locator('#fo-representative-phone').count()) await page.fill('#fo-representative-phone', '923456780');
  await page.getByRole('button', { name: 'Continuar' }).click();
  // Step 3 — Documentos: every slot gets a file.
  const slots = await page.locator('input[type="file"][id^="fo-doc-"]').count();
  for (let i = 0; i < slots; i++) {
    await page.locator('input[type="file"][id^="fo-doc-"]').nth(i).setInputFiles({ name: `documento-${i + 1}.pdf`, mimeType: 'application/pdf', buffer: PDF });
  }
  await page.getByRole('button', { name: 'Continuar' }).click();
  // Step 4 — @banza
  await page.fill('#fo-desired-handle', handleA);
  await page.getByText(`@${handleA} está disponível.`).waitFor({ timeout: 15000 }).catch(() => {});
  const available = await page.getByText(`@${handleA} está disponível.`).count();
  rec('the form checks the @ is available as it is typed', available === 1);
  await page.getByRole('button', { name: 'Continuar' }).click();
  // Step 5 — Revisão
  const review = await text(page);
  rec('the review repeats what will be sent', review.includes(`Loja Consola ${stamp}`) && review.includes(`@${handleA}`) && review.includes('5001234567'));
  await shot(page, '03-review');
  await page.locator('#fo-terms').check();
  await page.getByRole('button', { name: 'Enviar para verificação' }).click();

  await page.waitForFunction(() => document.querySelector('[data-testid="financial-onboarding"]')?.getAttribute('data-state') === 'IN_REVIEW', null, { timeout: 30000 }).catch(() => {});
  const after = await text(page);
  rec('after sending, the page says IN_REVIEW with the @ requested', (await stateOf(page)) === 'IN_REVIEW' && after.includes(`@${handleA}`), await stateOf(page));
  const storageOff = after.includes('O envio de documentos ainda não está disponível neste ambiente');
  rec('the documents are reported as they are — never "enviado" when storage is absent',
    storageOff ? !/: enviado\b/.test(after) : true, storageOff ? 'storage not configured: said so' : 'storage configured');
  await shot(page, '04-in-review');

  if (!storageOff) {
    let docs = '';
    for (let i = 0; i < 30; i++) {
      docs = ssh(`${PRE} q "select string_agg(d.document_type, ',' order by d.document_type) from merchant_application_documents d join merchant_applications a on a.id=d.application_id where a.desired_handle='${handleA}' and d.status='UPLOADED' and d.deleted_at is null"`).trim();
      if (docs.includes('BUSINESS_REGISTRATION') && docs.includes('REPRESENTATIVE_ID')) break;
      await page.waitForTimeout(1000);
    }
    rec('the documents the Console sent reached KYB storage and passed the server\'s checks', docs.includes('BUSINESS_REGISTRATION') && docs.includes('REPRESENTATIVE_ID'), docs);
  }
  const stored = ssh(`${PRE} q "select id::text||'|'||origin||'|'||project_id::text||'|'||status from merchant_applications where desired_handle='${handleA}'"`).trim();
  const [id, origin, project, status] = stored.split('|');
  appA = id || null;
  if (KEEP) writeFileSync(join(OUT, 'state.json'), JSON.stringify({ stamp, workspace: ws, projectA: A, projectB: B, owner: emailOf('owner'), developer: emailOf('dev'), application: id, handle: handleA }, null, 2) + '\n');
  rec('the ONE Business application: origin DEVELOPER_PROJECT, for Project A, SUBMITTED',
    origin === 'DEVELOPER_PROJECT' && project === A && status === 'SUBMITTED', `${origin} ${String(project).slice(0, 8)} ${status}`);
  const ref = String(id).slice(0, 8).toUpperCase();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-testid="financial-onboarding"]').waitFor();
  const reloaded = await text(page);
  rec('a reload still says IN_REVIEW, with the reference', (await stateOf(page)) === 'IN_REVIEW' && reloaded.includes(ref), ref);
  await page.context().close();

  const devPage = await consolePage(dev, ws, A);
  const devButtons = await devPage.locator('[data-testid="financial-onboarding"] button').count();
  const devFiles = await devPage.locator('[data-testid="financial-onboarding"] input[type="file"]').count();
  rec('the DEVELOPER sees IN_REVIEW with nothing to press or upload',
    (await stateOf(devPage)) === 'IN_REVIEW' && devButtons === 0 && devFiles === 0, `buttons=${devButtons} uploads=${devFiles}`);
  await shot(devPage, '05-developer-view');
  await devPage.context().close();

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
  await pb.getByRole('button', { name: 'Iniciar verificação' }).click();
  await pb.getByRole('button', { name: 'Ligar negócio existente' }).click();
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
      IK=$(docker exec "$GWC" sh -c 'cat /run/secrets/core_internal_key')
      ${appA && !KEEP ? `docker exec "$GWC" curl -s -o /dev/null -X POST http://localhost:8080/internal/v1/merchant-applications/${appA}/reject -H "X-Internal-Key: $IK" -H 'Content-Type: application/json' -d '{"reviewed_by":"e2e-fixture-cleanup","admin_notes":"synthetic E2E application","merchant_message":"synthetic"}'` : ''}
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
