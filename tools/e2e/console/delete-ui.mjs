#!/usr/bin/env node
/**
 * SANDBOX-DELETE-001 §28–§31 §59 §60 — deleting a Project and a Workspace in the
 * deployed Console, in a browser, at the four widths the product is met on.
 *
 * A populated fixture (a Workspace and a Project with deliberately long names, a
 * Financial Setup, a key and a payment) is built through the product. At each
 * width, on Project Settings and Workspace Settings:
 *
 *   · the danger zone offers "Eliminar" — not greyed out by the activity
 *   · the page never scrolls sideways, with the dialog closed or open
 *   · the dialog is a modal named by its title, focus starts in the name field,
 *     Tab stays inside, the danger button stays disabled until the exact name is
 *     typed, Escape closes it and focus returns to the button that opened it
 *   · every control in the dialog has an accessible name and a 24px target
 *
 * Then, at 390px, the Project is deleted through the dialog (the flash says so,
 * the Project leaves the selector, its key is refused) and the Workspace after
 * it. Screenshots go beside the evidence, outside the worktree.
 *
 *   node tools/e2e/console/delete-ui.mjs
 */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ?? '/Users/fm65/doa/node_modules/@playwright/test/index.mjs');
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { assuranceDir } from '../lib/assurance-output.mjs';
import { mintSession } from './lib/mint.mjs';

const API = 'https://developer-api.banzami.com';
const GW = 'https://sandbox-api.banzami.com';
const ORIGIN = 'https://developers.banzami.com';
const OUT = assuranceDir('sandbox-delete-ui');
mkdirSync(OUT, { recursive: true });
const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
];

const results = [];
let pass = 0, fail = 0;
const check = (id, ok, detail) => {
  results.push({ id, verdict: ok ? 'PASS' : 'FAIL', detail });
  if (ok) { pass += 1; console.log(`  ✓ ${id} — ${detail}`); } else { fail += 1; console.error(`  ✗ ${id} — ${detail}`); }
};

// ── fixture, through the product ─────────────────────────────────────────────
const stamp = Date.now().toString(36) + randomBytes(2).toString('hex');
const email = `e2e-delui-${stamp}@banzami-e2e.test`;
const token = mintSession(email);
let csrf = '';
const call = async (path, method = 'GET', body) => {
  const headers = { cookie: `__Host-bz_dev_session=${token}` };
  if (method !== 'GET') {
    if (!csrf) csrf = (await (await fetch(`${API}/auth/me`, { headers })).json()).csrf_token ?? '';
    Object.assign(headers, { 'content-type': 'application/json', origin: ORIGIN, 'x-csrf-token': csrf });
  }
  const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const wsName = `Workspace de testes com um nome muito comprido para ver se cabe ${stamp}`;
const projectName = `Projeto de pagamentos com um nome igualmente comprido ${stamp}`;
const ws = (await call('/workspaces', 'POST', { name: wsName })).body?.id;
const P = (await call(`/workspaces/${ws}/projects`, 'POST', { name: projectName })).body?.id;
await call(`/projects/${P}/financial-setup`, 'POST', { use_case: 'STANDARD' });
const key = await call(`/projects/${P}/keys`, 'POST', { kind: 'SECRET', name: 'ui', scopes: ['identity:read', 'payment_sessions:write', 'sandbox:write', 'sandbox:read'] });
const secret = key.body?.secret ?? '';
const gw = (path, method = 'GET', body, extra = {}) => fetch(GW + path, { method, headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json', ...extra }, body: body ? JSON.stringify(body) : undefined });
const payer = await (await gw('/v1/sandbox/test-payers', 'POST', {}, { 'Idempotency-Key': `ui_${stamp}_p` })).json();
const sess = await (await gw('/v1/payment-sessions', 'POST', { purpose: 'ORDER', reference_type: 'PEDIDO', reference_id: `ui_${stamp}`, amount_minor: 12000, currency: 'AOA' }, { 'Idempotency-Key': `ui_${stamp}_s` })).json();
const paid = await gw(`/v1/sandbox/test-payers/${payer.id}/payments`, 'POST', { payment_session_id: sess.session_id }, { 'Idempotency-Key': `ui_${stamp}_pay` });
check('POPULATED_FIXTURE', Boolean(ws && P) && key.status === 201 && paid.status === 200, `workspace, project, Financial Setup, key ${key.status}, payment ${paid.status}`);

// ── the sweep ────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const measure = (page, w) => page.evaluate((width) => {
  const d = document.documentElement;
  const dlg = document.querySelector('[role="dialog"]');
  const controls = dlg ? [...dlg.querySelectorAll('button, input, a[href]')] : [];
  const unnamed = controls.filter((el) => !((el.textContent ?? '').trim() || el.getAttribute('aria-label') || (el.id && document.querySelector(`label[for="${el.id}"]`)))).length;
  const small = controls.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.height < 24 || r.width < 24); }).length;
  return { overflow: d.scrollWidth > d.clientWidth + 1, scroll: d.scrollWidth, width, unnamed, small };
}, w);

async function dialogChecks(page, vp, route, buttonName, typedName) {
  await page.goto(ORIGIN + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const button = page.getByRole('button', { name: buttonName, exact: true });
  const offered = (await button.count()) > 0 && await button.first().isEnabled();
  const closed = await measure(page, vp.width);
  check(`${vp.name}${route} DELETE_OFFERED`, offered && !closed.overflow, `button enabled=${offered} overflow=${closed.overflow} (${closed.scroll}/${vp.width})`);
  if (!offered) return;
  await button.first().scrollIntoViewIfNeeded();
  await button.first().focus();
  await button.first().click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const label = await dialog.getAttribute('aria-labelledby');
  const title = label ? await page.locator(`[id="${label}"]`).textContent() : '';
  const field = dialog.locator('input');
  const confirm = dialog.getByRole('button', { name: buttonName, exact: true });
  const focusInField = await field.evaluate((el) => el === document.activeElement);
  const disabledEmpty = await confirm.isDisabled();
  await field.fill(typedName.slice(0, -1));
  const disabledWrong = await confirm.isDisabled();
  await field.fill(typedName);
  const enabledRight = await confirm.isEnabled();
  // Tab from the last control wraps to the first.
  await confirm.focus();
  await page.keyboard.press('Tab');
  const trapped = await dialog.evaluate((el) => el.contains(document.activeElement));
  const open = await measure(page, vp.width);
  await page.screenshot({ path: join(OUT, `${vp.name}${route.replace(/\//g, '_')}-dialog.png`) });
  check(`${vp.name}${route} DIALOG_A11Y`,
    (await dialog.getAttribute('aria-modal')) === 'true' && /Eliminar/.test(title ?? '') && focusInField && trapped && open.unnamed === 0 && open.small === 0,
    `modal named "${(title ?? '').slice(0, 40)}…" focus_in_field=${focusInField} tab_trapped=${trapped} unnamed=${open.unnamed} small=${open.small}`);
  check(`${vp.name}${route} STRONG_CONFIRMATION`, disabledEmpty && disabledWrong && enabledRight, `empty=${disabledEmpty ? 'disabled' : 'ENABLED'} wrong=${disabledWrong ? 'disabled' : 'ENABLED'} exact=${enabledRight ? 'enabled' : 'DISABLED'}`);
  check(`${vp.name}${route} DIALOG_FITS`, !open.overflow, `overflow=${open.overflow} (${open.scroll}/${vp.width})`);
  await page.keyboard.press('Escape');
  const gone = (await page.getByRole('dialog').count()) === 0;
  const focusBack = await page.evaluate((name) => document.activeElement?.textContent?.trim() === name, buttonName);
  check(`${vp.name}${route} ESCAPE_RETURNS_FOCUS`, gone && focusBack, `closed=${gone} focus_on_opener=${focusBack}`);
}

const cookie = (url) => ({ name: '__Host-bz_dev_session', value: token, url, httpOnly: true, secure: true, sameSite: 'None' });
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  await ctx.addCookies([cookie(API), cookie(ORIGIN)]);
  const page = await ctx.newPage();
  await dialogChecks(page, vp, '/settings', 'Eliminar projeto', projectName);
  await dialogChecks(page, vp, '/settings/workspace', 'Eliminar workspace', wsName);

  if (vp.name === 'mobile-390') {
    // The real thing, through the dialog.
    await page.goto(`${ORIGIN}/settings`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Eliminar projeto', exact: true }).click();
    await page.getByRole('dialog').locator('input').fill(projectName);
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar projeto', exact: true }).click();
    const flash = await page.getByText(/Projeto eliminado\./).first().textContent({ timeout: 15000 }).catch(() => '');
    await page.screenshot({ path: join(OUT, `${vp.name}-project-deleted.png`) });
    const keyAfter = (await gw('/v1/me')).status;
    const listed = ((await call(`/workspaces/${ws}/projects?include_archived=true`)).body?.projects ?? []).some((x) => x.id === P);
    check('UI_PROJECT_DELETE', /Projeto eliminado\./.test(flash ?? '') && keyAfter === 401 && !listed, `flash="${(flash ?? '').trim()}" key=${keyAfter} listed=${listed}`);

    await page.goto(`${ORIGIN}/settings/workspace`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Eliminar workspace', exact: true }).click();
    await page.getByRole('dialog').locator('input').fill(wsName);
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar workspace', exact: true }).click();
    const wflash = await page.getByText(/Workspace eliminado\./).first().textContent({ timeout: 15000 }).catch(() => '');
    await page.screenshot({ path: join(OUT, `${vp.name}-workspace-deleted.png`) });
    const wsListed = ((await call('/workspaces')).body?.workspaces ?? []).some((x) => x.id === ws);
    const after = await measure(page, vp.width);
    check('UI_WORKSPACE_DELETE', /Workspace eliminado\./.test(wflash ?? '') && !wsListed && !after.overflow, `flash="${(wflash ?? '').trim()}" listed=${wsListed} overflow=${after.overflow}`);
  }
  await ctx.close();
}
await browser.close();

// Whatever an aborted run left: deleted through the product.
const left = await call(`/workspaces/${ws}`);
if (left.status === 200) await call(`/workspaces/${ws}`, 'DELETE', { name: left.body?.name });

writeFileSync(join(OUT, 'delete-ui.json'), `${JSON.stringify({ ran_at: new Date().toISOString(), origin: ORIGIN, viewports: VIEWPORTS, pass, fail, results }, null, 2)}\n`);
console.log(`\nSANDBOX_DELETE_UI: PASS=${pass} FAIL=${fail}`);
console.log(`SANDBOX_DELETE_A11Y=${fail === 0 ? 'PASS' : 'FAIL'}`);
console.log(`evidence: ${OUT}`);
process.exit(fail === 0 ? 0 : 1);
