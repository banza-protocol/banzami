#!/usr/bin/env node
/**
 * Every route the Console offers, opened in a real browser against the
 * deployed site.
 *
 * Source tests say what the code contains. This says what a developer sees:
 * the page loads, it is not a 404 wearing a layout, it holds no placeholder
 * language, and it offers no anchor that goes nowhere. Then the two removed
 * surfaces are asked for by name and must be gone, because a page that stops
 * being linked is not a page that stops existing.
 *
 * The session is minted rather than typed — that bypasses email delivery and
 * nothing else; see tools/e2e/console/mint-session.mjs.
 *
 *   BZ_SESSION=$(node tools/e2e/console/mint-session.mjs | tail -1) \
 *     node tools/e2e/console/route-suite.mjs
 */
// Playwright lives in the DOA workspace on this machine; the operator repo has
// no browser dependency of its own and should not grow one for a suite that
// runs against a deployed site.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ?? '/Users/fm65/doa/node_modules/@playwright/test/index.mjs');
const ORIGIN = 'https://developers.banzami.com';
const ROUTES = ['/dashboard','/saldos','/transacoes','/api-keys','/webhooks','/logs','/settings','/settings/activity','/go-live','/suporte','/docs'];
const GONE = ['/clientes','/status'];
const b = await chromium.launch(); const ctx = await b.newContext();
await ctx.addCookies([{ name: '__Host-bz_dev_session', value: process.env.BZ_SESSION, url: 'https://developer-api.banzami.com', httpOnly: true, secure: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✓ ' + m); };
const bad = (m) => { fail++; console.log('  ✗ ' + m); };
for (const r of ROUTES) {
  const res = await page.goto(ORIGIN + r, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const dead = await page.locator('a[href="#"]:visible, a[href^="javascript:"]:visible').count();
  const placeholder = /está a ser preparada|Em breve|Coming soon|Dados ilustrativos/i.test(t);
  const notFound = /ERRO 404/.test(t);
  const unlabelled = await page.locator('button:visible:not([aria-label]):has(svg):not(:has-text(""))').count().catch(() => 0);
  if (res?.status() !== 200) bad(`${r} http ${res?.status()}`);
  else if (notFound) bad(`${r} renders 404`);
  else if (placeholder) bad(`${r} shows a placeholder`);
  else if (dead) bad(`${r} has ${dead} dead link(s)`);
  else ok(`${r} loads, real, no dead link`);
}
for (const r of GONE) {
  await page.goto(ORIGIN + r, { waitUntil: 'domcontentloaded' });
  const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  /ERRO 404/.test(t) ? ok(`${r} is gone`) : bad(`${r} still serves something`);
}
// The account control and the absence of the bell.
//
// This used to require the header to READ "Terminar sessão", because the avatar
// was a button that signed you out on the first click — labelling it was the
// honest fix available then. It is a real menu now, so the header must NOT carry
// that label (a second, unconfirmed way out is the defect this guards against)
// and the avatar must announce itself as a menu.
await page.goto(ORIGIN + '/dashboard', { waitUntil: 'networkidle' });
const header = (await page.locator('header').innerText()).replace(/\s+/g,' ');
const trigger = page.locator('header [aria-haspopup="menu"]');
const hasTrigger = await trigger.count() > 0;
const expanded = hasTrigger ? await trigger.first().getAttribute('aria-expanded') : null;
if (/Terminar sessão/.test(header)) bad('the header still offers an unconfirmed sign-out');
else if (!hasTrigger) bad('the account control does not announce itself as a menu');
else if (expanded !== 'false') bad(`the account menu opens with aria-expanded=${expanded}`);
else ok('the account control is a menu, and the header offers no bare sign-out');

// It must open, and opening it must not end the session.
await trigger.first().click();
const menu = page.locator('[role="menu"]');
if (await menu.count() === 0) bad('the account menu does not open');
else if (!/\/dashboard/.test(page.url())) bad('opening the account menu signed the person out');
else ok('the account menu opens without signing anyone out');
/Notifica/.test(header) ? bad('the bell is back') : ok('no notification bell');
console.log(`\nCONSOLE_ROUTE_SUITE: PASS=${pass} FAIL=${fail}`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
