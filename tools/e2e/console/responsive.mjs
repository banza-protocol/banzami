#!/usr/bin/env node
/**
 * Does the Console survive the screens people actually use it on?
 *
 * Not a screenshot gallery. The failures this catches are the ones that make a
 * page unusable rather than ugly:
 *
 *   * the body scrolls sideways — the classic symptom of a table or a code
 *     block that refuses to be narrower than its content. On a phone that hides
 *     half of every row behind a gesture nobody knows to make.
 *   * a control is smaller than a fingertip. 24px is the WCAG 2.2 minimum for a
 *     touch target; below it a person taps the wrong thing.
 *   * content is wider than the viewport, which is the same defect measured on
 *     the element rather than the document.
 *   * the navigation disappears at a narrow width with nothing in its place.
 *
 * Wide content is allowed to scroll INSIDE its own container — that is the
 * correct answer for a table of transactions. What is not allowed is the page
 * itself scrolling, so the check is on the document, and any horizontally
 * scrollable descendant is reported rather than failed.
 *
 * Screenshots are written beside the run so a person can look; the assertions
 * are what fails the suite.
 *
 *   BZ_SESSION=... node tools/e2e/console/responsive.mjs [--out DIR]
 */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ?? '/Users/fm65/doa/node_modules/@playwright/test/index.mjs');
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assuranceDir } from '../lib/assurance-output.mjs';

const ORIGIN = 'https://developers.banzami.com';
const ROUTES = ['/dashboard', '/saldos', '/transacoes', '/api-keys', '/webhooks', '/logs', '/settings', '/settings/workspace', '/go-live'];

// The four the product is actually met on: a wide desktop, the laptop most
// developers carry, a tablet, and a phone.
const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-375', width: 375, height: 812 },
];

// Outside the worktree by default. A screenshot of a deployed page is a fact
// ABOUT a revision, not part of it — writing it into the source tree makes the
// verification dirty the thing it just verified (tools/e2e/lib/assurance-output.mjs).
const outArg = process.argv.indexOf('--out');
const OUT = outArg > -1 ? process.argv[outArg + 1] : assuranceDir('console-responsive');

let pass = 0, fail = 0;
const notes = [];
const ok = (m) => { pass += 1; console.log(`  ✓ ${m}`); };
const bad = (m) => { fail += 1; console.error(`  ✗ ${m}`); };

import { requireLiveSession, assertAuthenticatedShell } from './lib/require-session.mjs';

const session = process.env.BZ_SESSION;
if (!session) { console.error('BZ_SESSION is required'); process.exit(2); }
await requireLiveSession(session);

const browser = await chromium.launch();
const results = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  // The cookie must reach BOTH hosts. It was set only for the API host while
  // every page is served from the Console host, so the browser sent nothing
  // with the document request and every route rendered the LOGIN page. Three
  // sweeps reported green against a screen that has no product on it.
  await ctx.addCookies([
    { name: '__Host-bz_dev_session', value: session, url: 'https://developer-api.banzami.com', httpOnly: true, secure: true, sameSite: 'None' },
    { name: '__Host-bz_dev_session', value: session, url: 'https://developers.banzami.com',    httpOnly: true, secure: true, sameSite: 'None' },
  ]);
  const page = await ctx.newPage();

  for (const route of ROUTES) {
    await page.goto(ORIGIN + route, { waitUntil: 'networkidle' });
    await assertAuthenticatedShell(page, `${vp.name} ${route}`);
    const m = await page.evaluate((w) => {
      const d = document.documentElement;
      // Elements wider than the viewport, and the ones that scroll sideways on
      // purpose (a table in its own overflow container is fine).
      const wide = [];
      const scrollers = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width > w + 1 && r.height > 0) wide.push(el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''));
        const style = getComputedStyle(el);
        if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth) {
          scrollers.push(el.tagName.toLowerCase());
        }
      }
      // Touch targets: visible, interactive, and smaller than a fingertip.
      //
      // Inline links inside flowing text are exempt, and that is not a
      // concession — WCAG 2.5.8 carves them out explicitly, because padding a
      // link in the middle of a sentence to 24px breaks the sentence. The
      // exemption is decided by the computed display, not by a name list, so it
      // cannot quietly grow to cover a button somebody made small.
      const small = [];
      for (const el of document.querySelectorAll('button, a[href], input, select, [role="button"], [role="switch"], [role="menuitem"]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden') continue;
        const inlineInText = el.tagName === 'A' && style.display === 'inline';
        if (inlineInText) continue;
        if (r.height < 24 || r.width < 24) {
          small.push((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40));
        }
      }
      return {
        docScrollWidth: d.scrollWidth,
        clientWidth: d.clientWidth,
        wide: [...new Set(wide)].slice(0, 6),
        scrollers: [...new Set(scrollers)],
        small: [...new Set(small)].slice(0, 8),
        navLinks: document.querySelectorAll('nav a, aside a').length,
      };
    }, vp.width);

    const slug = route.replace(/\//g, '_').replace(/^_/, '');
    const shot = join(OUT, `${vp.name}${slug ? '-' + slug : ''}.png`);
    await page.screenshot({ path: shot, fullPage: false });

    const overflows = m.docScrollWidth > m.clientWidth + 1;
    results.push({ viewport: vp.name, route, ...m, screenshot: shot, overflows });

    if (overflows) {
      bad(`${vp.name} ${route}: the page scrolls sideways (${m.docScrollWidth} > ${m.clientWidth})${m.wide.length ? ' — widest: ' + m.wide.join(', ') : ''}`);
    } else {
      ok(`${vp.name} ${route}: no horizontal page scroll`);
    }
    if (m.small.length) {
      bad(`${vp.name} ${route}: ${m.small.length} control(s) under 24px — ${m.small.join(' | ')}`);
    }
    if (m.navLinks === 0) {
      bad(`${vp.name} ${route}: no navigation links are present`);
    }
    if (m.scrollers.length) {
      // Reported, never failed: a table that scrolls inside its own container is
      // the correct answer to content wider than a phone.
      notes.push(`${vp.name} ${route}: wide content scrolls inside ${m.scrollers.join(', ')} — allowed`);
    }
  }
  await ctx.close();
}
await browser.close();

if (notes.length) {
  console.log('\nnotes (not failures)');
  for (const n of notes) console.log('  · ' + n);
}

writeFileSync(join(OUT, 'responsive.json'), JSON.stringify({
  suite: 'Console responsive QA',
  origin: ORIGIN,
  generated_at: new Date().toISOString(),
  viewports: VIEWPORTS,
  passed: pass, failed: fail,
  results,
  notes,
}, null, 2) + '\n');

console.log(`\nCONSOLE_RESPONSIVE: PASS=${pass} FAIL=${fail}  screenshots=${OUT}`);
process.exit(fail === 0 ? 0 : 1);
