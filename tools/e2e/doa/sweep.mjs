#!/usr/bin/env node
/**
 * DOA's public surface: locale, accessibility, dead controls and responsive —
 * in one pass, on the deployed site.
 *
 * The public pages need no session, which is the point of them: a donor arrives
 * as a stranger. So this sweeps what a stranger sees, and says so rather than
 * pretending it covered the signed-in product. The Console's mistake was
 * measuring a sign-in page and reporting green; the fix is not to repeat it one
 * product over.
 *
 *   node tools/e2e/doa/sweep.mjs [--campaign <slug>]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { assuranceDir } from '../lib/assurance-output.mjs';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? '/Users/fm65/doa/node_modules/@playwright/test/index.mjs'
).catch(() => import('playwright'));

const ORIGIN = 'https://www.doadoa.app';
const argv = process.argv.slice(2);
const slug = argv.includes('--campaign') ? argv[argv.indexOf('--campaign') + 1] : null;
const ROUTES = ['/', '/sobre', '/termos', '/privacidade', '/login',
                ...(slug ? [`/c/${slug}`, `/c/${slug}/doar`] : [])];

const ENGLISH = ['Owner', 'Secret', 'Delete', 'Archived', 'Settings', 'Dashboard',
                 'Sign in', 'Sign out', 'Log in', 'Log out', 'Submit', 'Retry', 'Loading'];
const ENUM = /\b[A-Z][A-Z0-9]{2,}(_[A-Z0-9]+)+\b/;

let pass = 0, fail = 0;
const rows = [];
const ok = (m) => { pass += 1; console.log(`  ✓ ${m}`); };
const bad = (m) => { fail += 1; console.error(`  ✗ ${m}`); };

const browser = await chromium.launch();
const consoleErrors = [];
const badResponses = [];

for (const vp of [{ name: 'desktop-1440', width: 1440, height: 900 }, { name: 'mobile-390', width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/status of (401|403|404|409)\b/.test(t)) return;
    consoleErrors.push(`${vp.name}: ${t.slice(0, 160)}`);
  });
  page.on('response', (r) => { if (r.status() >= 500) badResponses.push(`${vp.name} ${r.status()} ${r.url().slice(0, 100)}`); });

  for (const route of ROUTES) {
    const res = await page.goto(ORIGIN + route, { waitUntil: 'networkidle' }).catch(() => null);
    if (!res || res.status() >= 400) { bad(`${vp.name} ${route}: http ${res ? res.status() : 'no response'}`); continue; }
    await page.waitForTimeout(500);

    const m = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('a[href], button, [role="button"]')]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      return {
        text: document.body.innerText,
        lang: document.documentElement.lang,
        docScrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        unnamed: controls.filter((el) => !(el.getAttribute('aria-label') || el.textContent || '').trim()).length,
        deadLinks: controls.filter((el) => el.tagName === 'A' && ['', '#'].includes(el.getAttribute('href') || '')).length,
        disabledNoReason: controls.filter((el) =>
          (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true')
          && !el.getAttribute('title') && !el.getAttribute('aria-describedby')).length,
      };
    });

    if (vp.name === 'desktop-1440') {
      const english = ENGLISH.filter((w) => m.text.includes(w));
      english.length ? bad(`${route}: English in primary UI — ${english.join(', ')}`) : ok(`${route}: no English platform vocabulary`);
      const en = m.text.match(ENUM);
      en ? bad(`${route}: wire enum on screen — ${en[0]}`) : ok(`${route}: no raw enum on screen`);
      m.unnamed === 0 ? ok(`${route}: every control has a name`) : bad(`${route}: ${m.unnamed} control(s) with no accessible name`);
      m.deadLinks === 0 ? ok(`${route}: no link goes nowhere`) : bad(`${route}: ${m.deadLinks} dead link(s)`);
      m.disabledNoReason === 0 ? ok(`${route}: no unexplained disabled control`) : bad(`${route}: ${m.disabledNoReason} disabled with no reason`);
      // pt-PT and pt-AO are valid, more precise BCP-47 tags than bare "pt":
      // asserting equality made a correct declaration look like a defect.
      /^pt(-[A-Za-z]{2})?$/.test(m.lang) ? ok(`${route}: declares lang="${m.lang}"`) : bad(`${route}: lang="${m.lang}"`);
    }
    const overflows = m.docScrollWidth > m.clientWidth + 1;
    overflows ? bad(`${vp.name} ${route}: scrolls sideways (${m.docScrollWidth} > ${m.clientWidth})`)
              : ok(`${vp.name} ${route}: no horizontal page scroll`);
    rows.push({ viewport: vp.name, route, unnamed: m.unnamed, deadLinks: m.deadLinks, disabledNoReason: m.disabledNoReason, overflows });
  }
  await ctx.close();
}
await browser.close();

consoleErrors.length === 0 ? ok('no unexpected browser console errors') : bad(`${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 3).join(' | ')}`);
badResponses.length === 0 ? ok('no 5xx') : bad(`${badResponses.length} 5xx: ${badResponses.slice(0, 3).join(' | ')}`);

const out = join(assuranceDir('doa-sweep'), `doa-sweep-${Date.now()}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ suite: 'DOA public surface sweep', origin: ORIGIN, routes: ROUTES, pass, fail, rows, consoleErrors, badResponses }, null, 2)}\n`);
console.log(`\nDOA_PUBLIC_SWEEP: PASS=${pass} FAIL=${fail}\nevidence: ${out}\n`);
process.exit(fail === 0 ? 0 : 1);
