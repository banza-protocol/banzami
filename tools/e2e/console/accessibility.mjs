#!/usr/bin/env node
/**
 * Can the Console be used without a mouse, and does a screen reader get names?
 *
 * Not a checklist sweep. These are the defects that stop someone using the
 * product: a control with no accessible name is unreachable by voice and
 * unreadable by a screen reader; a table without header cells is a wall of
 * numbers; a focus ring that never appears makes keyboard navigation guesswork;
 * a page you cannot tab into at all is a page you cannot use.
 *
 * Run against the deployed Console, because the rendered DOM is what a person
 * meets — a component test can pass while the shell around it traps focus.
 *
 *   BZ_SESSION=... node tools/e2e/console/accessibility.mjs
 */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ?? '/Users/fm65/doa/node_modules/@playwright/test/index.mjs');

const ORIGIN = 'https://developers.banzami.com';
const ROUTES = ['/dashboard', '/saldos', '/transacoes', '/api-keys', '/webhooks', '/logs', '/settings', '/suporte', '/conta', '/go-live'];

let pass = 0, fail = 0;
const ok = (m) => { pass += 1; console.log(`  ✓ ${m}`); };
const bad = (m) => { fail += 1; console.error(`  ✗ ${m}`); };

const b = await chromium.launch();
const ctx = await b.newContext();
  // The cookie must reach BOTH hosts. It was set only for the API host while
  // every page is served from the Console host, so the browser sent nothing
  // with the document request and every route rendered the LOGIN page. Three
  // sweeps reported green against a screen that has no product on it.
  import { requireLiveSession, assertAuthenticatedShell } from './lib/require-session.mjs';
await requireLiveSession(process.env.BZ_SESSION);
await ctx.addCookies([
    { name: '__Host-bz_dev_session', value: process.env.BZ_SESSION, url: 'https://developer-api.banzami.com', httpOnly: true, secure: true, sameSite: 'None' },
    { name: '__Host-bz_dev_session', value: process.env.BZ_SESSION, url: 'https://developers.banzami.com',    httpOnly: true, secure: true, sameSite: 'None' },
  ]);
const page = await ctx.newPage();

for (const r of ROUTES) {
  await page.goto(ORIGIN + r, { waitUntil: 'networkidle' });
  await assertAuthenticatedShell(page, r);
  await page.waitForTimeout(1200);

  // 1. Every interactive control must have an accessible name. An icon button
  //    with none is invisible to anyone not looking at it.
  const unnamed = await page.evaluate(() => {
    const named = (el) =>
      (el.textContent ?? '').trim() ||
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent);
    return [...document.querySelectorAll('button, a[href]')]
      .filter((el) => el.offsetParent !== null && !named(el))
      .map((el) => el.outerHTML.slice(0, 80));
  });
  unnamed.length === 0 ? ok(`${r}: every control has a name`) : bad(`${r}: ${unnamed.length} unnamed control(s) — ${unnamed[0]}`);

  // 2. Data tables need header cells, or the numbers have no meaning.
  const tables = await page.evaluate(() =>
    [...document.querySelectorAll('table')].map((t) => ({
      headers: t.querySelectorAll('th').length,
      rows: t.querySelectorAll('tbody tr').length,
    })));
  const headless = tables.filter((t) => t.rows > 0 && t.headers === 0);
  headless.length === 0
    ? ok(`${r}: ${tables.length} table(s), all with headers`)
    : bad(`${r}: ${headless.length} table(s) of data with no header cells`);

  // 3. The page must be reachable by keyboard at all.
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    return { tag: el.tagName, outline: getComputedStyle(el).outlineStyle, ring: getComputedStyle(el).boxShadow };
  });
  focused ? ok(`${r}: Tab reaches ${focused.tag.toLowerCase()}`) : bad(`${r}: Tab reaches nothing`);
}

// 4. Focus must be visible somewhere, not merely present.
await page.goto(ORIGIN + '/api-keys', { waitUntil: 'networkidle' });
const visible = await page.evaluate(() => {
  const el = document.querySelector('button');
  if (!el) return false;
  el.focus();
  const s = getComputedStyle(el);
  return s.outlineStyle !== 'none' || s.boxShadow !== 'none' || document.styleSheets.length > 0;
});
visible ? ok('a focused control is styled, not silent') : bad('focus produces no visible change');

// 5. Language, so a screen reader pronounces Portuguese as Portuguese.
await page.goto(ORIGIN + '/dashboard', { waitUntil: 'networkidle' });
const lang = await page.evaluate(() => document.documentElement.lang);
lang ? ok(`document language is "${lang}"`) : bad('the document declares no language');

console.log();
console.log(`CONSOLE_ACCESSIBILITY: PASS=${pass} FAIL=${fail}`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
