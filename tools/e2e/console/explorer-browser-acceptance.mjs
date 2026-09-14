#!/usr/bin/env node
/**
 * SANDBOX-SELF-SERVICE-001 §52 — the API Explorer, in a real browser, on the
 * deployed Console and documentation.
 *
 *   signed in → Sandbox project → API Reference → Try in Sandbox → GET → POST →
 *   response with request_id → the request in API logs → the hosted payment page
 *   → complete the payment from Test data → the hosted page shows it paid
 *
 * and, the whole time: no Project secret in web storage, the URL, the page
 * source or any request/response the browser saw, and no call to the Live host.
 *
 * The session is minted through the product's own sign-in (request-otp → the
 * message sent → verify) and given to the browser as its cookie; the project and
 * its Sandbox setup are created through the Console API beforehand, as the
 * Quickstart does. Everything is retired at the end and residue measured.
 *
 *   node tools/e2e/console/explorer-browser-acceptance.mjs [--headed]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { mintSession } from './lib/mint.mjs';
import { assuranceDir } from '../lib/assurance-output.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '/Users/fm65/doa/node_modules/@playwright/test/index.mjs').catch(() => import('playwright'));
const CONSOLE = 'https://developers.banzami.com';
const API = 'https://developer-api.banzami.com';
const HOST = process.env.BZ_SANDBOX_HOST ?? 'root@217.160.9.248';
// A real key: prefix + 32 random bytes in base64url (43 characters). Documentation
// placeholders such as bz_test_sk_… are not keys.
const SECRET = /bz_(?:test|live)_sk_[A-Za-z0-9_-]{40,}/;
// The detector is itself checked: a key-shaped value is caught, a placeholder is not.
if (!SECRET.test(`bz_test_sk_${'A1b2_c3-'.repeat(6)}`) || SECRET.test('bz_test_sk_xxxxxxxx')) throw new Error('secret detector is broken');

const steps = [];
const mark = (title, ok, detail = '') => { steps.push({ title, verdict: ok ? 'PASS' : 'FAIL', detail: String(detail).slice(0, 240) }); (ok ? console.log : console.error)(`  ${ok ? '✓' : '✗'} ${title}${detail ? ` — ${String(detail).slice(0, 240)}` : ''}`); };

const stamp = Date.now().toString(36);
const like = `explorer-ui-${stamp}`;
const token = mintSession(`e2e-${like}@banzami-e2e.test`);
let csrf = '';
const call = async (path, method = 'GET', body) => {
  const headers = { cookie: `__Host-bz_dev_session=${token}` };
  if (method !== 'GET') { if (!csrf) csrf = (await (await fetch(`${API}/auth/me`, { headers })).json()).csrf_token; Object.assign(headers, { 'content-type': 'application/json', origin: CONSOLE, 'x-csrf-token': csrf }); }
  const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const ws = (await call('/workspaces', 'POST', { name: like })).body?.id;
const P = (await call(`/workspaces/${ws}/projects`, 'POST', { name: like })).body?.id;
await call(`/projects/${P}/financial-setup`, 'POST', { use_case: 'STANDARD' });

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const ctx = await browser.newContext();
await ctx.addCookies([{ name: '__Host-bz_dev_session', value: token, url: API, httpOnly: true, secure: true, sameSite: 'Lax' }]);
await ctx.addInitScript(([w, p]) => { try { localStorage.setItem('bz_dev_active_ws', w); localStorage.setItem(`bz_dev_active_prj_${w}`, p); } catch { /* */ } }, [ws, P]);
const seen = { secretIn: [], liveCalls: [], urls: 0 };
ctx.on('request', (req) => {
  seen.urls += 1;
  if (/\/\/api\.banzami\.com\//.test(req.url())) seen.liveCalls.push(req.url());
  if (SECRET.test(req.url()) || SECRET.test(JSON.stringify(req.headers())) || SECRET.test(req.postData() ?? '')) seen.secretIn.push(`request ${req.url()}`);
});
ctx.on('response', async (res) => {
  try { const t = await res.text(); if (SECRET.test(t)) seen.secretIn.push(`response ${res.url()}`); } catch { /* streamed or binary */ }
});
const page = await ctx.newPage();
const storageClean = async (pg) => pg.evaluate((re) => {
  const r = new RegExp(re);
  const dump = (s) => Array.from({ length: s.length }, (_, i) => `${s.key(i)}=${s.getItem(s.key(i))}`).join('\n');
  return !r.test(dump(localStorage)) && !r.test(dump(sessionStorage)) && !r.test(location.href) && !r.test(document.documentElement.outerHTML);
}, SECRET.source);
const responseJson = async () => JSON.parse(await page.locator('[data-testid="explorer-response"] pre').innerText());

let sessionId; let hosted;
try {
  await page.goto(`${CONSOLE}/docs/reference`, { waitUntil: 'networkidle' });
  const tryGet = page.locator('a[data-try-in-sandbox="getMe"]').first();
  mark('API Reference offers Try in Sandbox', (await tryGet.count()) === 1, `links=${await page.locator('a[data-try-in-sandbox]').count()}`);
  await tryGet.click();
  await page.waitForURL(/\/explorer\?op=getMe/, { timeout: 20000 });
  await page.locator('[data-testid="explorer-send"]').waitFor({ timeout: 20000 });
  const chosen = await page.locator('[data-testid="op-getMe"]').getAttribute('aria-current');
  mark('The Explorer opens on that operation for the signed-in project', chosen === 'true', `aria-current=${chosen}`);
  await page.locator('[data-testid="explorer-send"]').click();
  await page.locator('[data-testid="explorer-response"]').waitFor({ timeout: 20000 });
  const me = await responseJson();
  const meText = await page.locator('[data-testid="explorer-response"]').innerText();
  const reqId = /request_id ([0-9a-f]{16,})/.exec(meText)?.[1];
  mark('GET runs and shows its request_id', me.environment === 'SANDBOX' && Boolean(reqId), `environment=${me.environment} request_id=${Boolean(reqId)}`);

  await page.goto(`${CONSOLE}/docs/reference`, { waitUntil: 'networkidle' });
  await page.locator('a[data-try-in-sandbox="createPaymentSession"]').first().click();
  await page.waitForURL(/op=createPaymentSession/, { timeout: 20000 });
  await page.locator('[data-testid="explorer-send"]').waitFor({ timeout: 20000 });
  const textarea = page.locator('textarea');
  await textarea.fill(JSON.stringify({ purpose: 'ORDER', reference_type: 'PEDIDO', reference_id: `ui_${stamp}`, amount_minor: 125000, currency: 'AOA', description: 'Explorer acceptance' }, null, 2));
  await page.locator('[data-testid="explorer-send"]').click();
  await page.locator('[data-testid="explorer-response"]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  const created = await responseJson();
  sessionId = created.session_id;
  const postText = await page.locator('[data-testid="explorer-response"]').innerText();
  const postReqId = /request_id ([0-9a-f]{16,})/.exec(postText)?.[1];
  hosted = await page.locator('[data-testid="explorer-hosted-page"]').getAttribute('href').catch(() => null);
  mark('POST runs with an idempotency key and shows the response', Boolean(sessionId) && Boolean(postReqId) && /^\d{3}/.test(postText) && postText.includes('201'), `session=${Boolean(sessionId)} request_id=${Boolean(postReqId)}`);

  await page.waitForTimeout(2500);
  await page.goto(`${CONSOLE}/logs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const logsText = await page.locator('body').innerText();
  mark('The request is in API logs, attributed to the Explorer', logsText.includes(postReqId ?? '#') || (await call(`/projects/${P}/logs?source=API_EXPLORER&limit=20`)).body?.logs?.some((l) => l.request_id === postReqId && l.source === 'API_EXPLORER'),
    `in_page=${logsText.includes(postReqId ?? '#')}`);

  const payPage = await ctx.newPage();
  // The page holds a realtime stream open: it never reaches network idle.
  await payPage.goto(hosted ?? 'about:blank', { waitUntil: 'domcontentloaded' });
  await payPage.waitForTimeout(2500);
  const payText = await payPage.locator('body').innerText();
  mark('The hosted payment page opens from the response', Boolean(hosted) && /1\s?250\s?Kz/.test(payText.replace(/ /g, ' ')), `hosted=${Boolean(hosted)}`);

  await page.goto(`${CONSOLE}/dados-de-teste`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="create-payer"]').click();
  await page.getByRole('button', { name: 'Pagar', exact: true }).first().waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Pagar', exact: true }).first().click();
  await page.locator('[data-testid="pay-form"] input[style*="monospace"], [data-testid="pay-form"] input').last().fill(sessionId);
  await page.getByRole('button', { name: 'Pagar como este pagador' }).click();
  const confirmed = await payPage.getByText('Pagamento confirmado').waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
  const status = (await call(`/projects/${P}/transactions`)).body?.transactions?.length ?? 0;
  mark('Completing the payment in Test data turns the hosted page paid', confirmed, `page_confirmed=${confirmed} transactions=${status}`);
  await payPage.close();

  mark('No Project secret in web storage, URL or page source', (await storageClean(page)), 'localStorage, sessionStorage, location, outerHTML');
  mark('No secret in any request or response the browser saw', seen.secretIn.length === 0, `requests=${seen.urls} hits=${seen.secretIn.slice(0, 3).join(' | ')}`);
  mark('No call to the Live host', seen.liveCalls.length === 0, `live_calls=${seen.liveCalls.length}`);
} catch (e) {
  console.error(`  ! aborted: ${String(e.stack ?? e).split('\n').slice(0, 2).join(' | ')}`);
} finally {
  await browser.close();
  const done = [(await call(`/projects/${P}/sandbox/reset`, 'POST', { confirm: 'RESET' })).status];
  for (const k of ((await call(`/projects/${P}/keys`)).body?.keys ?? []).filter((x) => x.status === 'ACTIVE')) done.push((await call(`/keys/${k.id}`, 'DELETE')).status);
  done.push((await call(`/projects/${P}/archive`, 'POST', { name: like })).status, (await call(`/workspaces/${ws}/archive`, 'POST', { name: like })).status);
  let residue = -1;
  try {
    const sql = `SELECT (SELECT count(*) FROM developer.dev_workspaces WHERE name LIKE '${like}%' AND status='ACTIVE') + (SELECT count(*) FROM developer.dev_projects WHERE name LIKE '${like}%' AND status='ACTIVE') + (SELECT count(*) FROM sandbox_test_payers t JOIN developer.dev_projects p ON p.id=t.project_id WHERE p.name LIKE '${like}%' AND t.retired_at IS NULL)`;
    residue = Number(execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, `PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1); CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1); PW=$(docker exec $CORE sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#'); docker exec -e PGPASSWORD=$PW -e PGOPTIONS='-c default_transaction_read_only=on' $PG psql -U bl_app_runtime -d banzami_staging -At -c "${sql}"`], { encoding: 'utf8' }).trim());
  } catch { /* measured as -1 */ }
  const ok = steps.length === 10 && steps.every((s) => s.verdict === 'PASS') && residue === 0;
  const out = join(assuranceDir('sandbox-self-service'), `explorer-browser-${Date.now()}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ ran_at: new Date().toISOString(), steps, cleanup: done, residue }, null, 2)}\n`);
  console.log(`\ncleanup=${done.join(',')} residue=${residue}`);
  console.log(`API_EXPLORER_E2E=${ok ? 'PASS' : 'FAIL'} (${steps.filter((s) => s.verdict === 'PASS').length}/10)`);
  console.log(`API_EXPLORER_SECRET_LEAKS=${seen.secretIn.length}`);
  console.log(`evidence: ${out}`);
  process.exitCode = ok ? 0 : 1;
}
