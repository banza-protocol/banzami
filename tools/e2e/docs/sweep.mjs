#!/usr/bin/env node
/**
 * The public documentation, as a reader meets it.
 *
 * The content audit (tools/e2e/docs/audit.mjs) checks whether the pages tell the
 * truth. This checks whether they can be used: at four widths, with a keyboard,
 * by someone who cannot see them, and by someone whose browser is not a 1440px
 * desktop.
 *
 * The two failures it exists for, both of which the product itself once had:
 *
 *   a control too small to hit — text-only links with no padding, whose clickable
 *     box is as tall as the type, ~13px against a 24px minimum;
 *   a page that scrolls sideways — a wide table or code block that pushes the
 *     whole document instead of scrolling inside its own container. On a phone
 *     that makes the page feel broken before a word of it is read.
 *
 *   node tools/e2e/docs/sweep.mjs [--origin https://developers.banzami.com]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { assuranceDir } from '../lib/assurance-output.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ?? '/Users/fm65/doa/node_modules/@playwright/test/index.mjs');

const argv = process.argv.slice(2);
const ORIGIN = argv.includes('--origin') ? argv[argv.indexOf('--origin') + 1] : 'https://developers.banzami.com';

const AREAS = ['', '/get-started', '/console', '/sdk', '/guides', '/doa', '/reference', '/testing', '/trust', '/artifacts', '/changelog', '/glossary'];
const ROUTES = [...AREAS.map((a) => `/docs${a}`), ...AREAS.map((a) => `/docs/en${a}`)];

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'tablet-834', width: 834, height: 1112 },
  { name: 'mobile-390', width: 390, height: 844 },
];

/** WCAG 2.2 target size (minimum). */
const MIN_TARGET = 24;

let pass = 0, fail = 0;
const rows = [];
const ok = (m) => { pass += 1; console.log(`  ✓ ${m}`); };
const bad = (m) => { fail += 1; console.error(`  ✗ ${m}`); };

const browser = await chromium.launch();
const consoleErrors = [];
const badResponses = [];

for (const vp of VIEWPORTS) {
  console.log(`\n── ${vp.name} ──`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${vp.name}: ${m.text().slice(0, 160)}`); });
  page.on('response', (r) => { if (r.status() >= 500) badResponses.push(`${vp.name} ${r.status()} ${r.url().slice(0, 100)}`); });

  for (const route of ROUTES) {
    const res = await page.goto(ORIGIN + route, { waitUntil: 'networkidle' }).catch(() => null);
    if (!res || res.status() >= 400) { bad(`${vp.name} ${route}: http ${res ? res.status() : 'no response'}`); continue; }
    await page.waitForTimeout(250);

    const m = await page.evaluate((min) => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const controls = [...document.querySelectorAll('a[href], button, [role="button"], summary')].filter(vis);

      // A wide element is fine inside a container that scrolls; it is a defect
      // only when it pushes the document.
      const widest = [...document.querySelectorAll('table, pre')]
        .filter(vis)
        .filter((el) => {
          // The element ITSELF may be the scroller — CodeBlock puts
          // overflowX:auto on the <pre>. Checking only ancestors reported every
          // code block on every page as unescaped, which is how this sweep's
          // first run buried one real overflow under forty false ones.
          let p = el;
          while (p && p !== document.body) {
            const o = getComputedStyle(p).overflowX;
            if (o === 'auto' || o === 'scroll') return false;
            p = p.parentElement;
          }
          return el.scrollWidth > document.documentElement.clientWidth;
        })
        .map((el) => `${el.tagName.toLowerCase()} ${el.scrollWidth}px`);

      return {
        lang: document.documentElement.lang,
        docScrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        unescapedWide: widest,
        unnamed: controls.filter((el) => !(el.getAttribute('aria-label') || el.textContent || '').trim()).length,
        dead: controls.filter((el) => el.tagName === 'A' && ['', '#'].includes(el.getAttribute('href') || '')).length,
        tooSmall: controls
          .filter((el) => { const r = el.getBoundingClientRect(); return r.height < min || r.width < min; })
          // A link inside a paragraph is exempt: WCAG excludes targets whose
          // position is determined by the flow of the text around them.
          .filter((el) => !el.closest('p, li, td'))
          .map((el) => {
            const r = el.getBoundingClientRect();
            return `${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)} ${Math.round(r.width)}x${Math.round(r.height)}`;
          }),
        headingJumps: (() => {
          const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(vis)
            .map((h) => Number(h.tagName[1]));
          const jumps = [];
          for (let i = 1; i < levels.length; i += 1) {
            if (levels[i] - levels[i - 1] > 1) jumps.push(`h${levels[i - 1]} → h${levels[i]}`);
          }
          return jumps;
        })(),
        firstFocusable: (() => {
          const el = document.querySelector('a[href], button');
          return el ? (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40) : null;
        })(),
      };
    }, MIN_TARGET);

    // Structure and naming are language- and width-independent; check once.
    if (vp.name === 'desktop-1440') {
      const expected = route.startsWith('/docs/en') ? /^en(-[A-Za-z]{2})?$/ : /^pt(-[A-Za-z]{2})?$/;
      expected.test(m.lang) ? ok(`${route}: declares lang="${m.lang}"`) : bad(`${route}: lang="${m.lang}" on a ${route.startsWith('/docs/en') ? 'English' : 'Portuguese'} page`);
      m.unnamed === 0 ? ok(`${route}: every control has a name`) : bad(`${route}: ${m.unnamed} control(s) with no accessible name`);
      m.dead === 0 ? ok(`${route}: no link goes nowhere`) : bad(`${route}: ${m.dead} link(s) to "" or "#"`);
      m.headingJumps.length === 0 ? ok(`${route}: heading levels do not skip`) : bad(`${route}: heading level skipped — ${m.headingJumps.join(', ')}`);
      m.firstFocusable ? ok(`${route}: the first focusable control is "${m.firstFocusable}"`) : bad(`${route}: nothing focusable`);
    }

    const overflows = m.docScrollWidth > m.clientWidth + 1;
    overflows ? bad(`${vp.name} ${route}: the page scrolls sideways (${m.docScrollWidth} > ${m.clientWidth})`)
              : ok(`${vp.name} ${route}: no horizontal page scroll`);
    m.unescapedWide.length === 0 || ok(`${vp.name} ${route}: wide content scrolls inside its own container`);
    m.unescapedWide.length && bad(`${vp.name} ${route}: wide content with no scrolling container — ${m.unescapedWide.join(', ')}`);
    m.tooSmall.length === 0 ? ok(`${vp.name} ${route}: every standalone control is at least ${MIN_TARGET}px`)
                            : bad(`${vp.name} ${route}: ${m.tooSmall.length} control(s) under ${MIN_TARGET}px — ${m.tooSmall.slice(0, 3).join(' | ')}`);

    rows.push({ viewport: vp.name, route, ...m });
  }
  await ctx.close();
}
await browser.close();

consoleErrors.length === 0 ? ok('no browser console errors') : bad(`${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 3).join(' | ')}`);
badResponses.length === 0 ? ok('no 5xx') : bad(`${badResponses.length} 5xx: ${badResponses.slice(0, 3).join(' | ')}`);

const out = join(assuranceDir('docs-sweep'), `docs-sweep-${Date.now()}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ suite: 'developer documentation sweep', origin: ORIGIN, viewports: VIEWPORTS, routes: ROUTES, pass, fail, rows, consoleErrors, badResponses }, null, 2)}\n`);
console.log(`\nDOCS_SWEEP: PASS=${pass} FAIL=${fail}`);
console.log(`DOCS_ACCESSIBILITY=${fail === 0 ? 'PASS' : 'FAIL'} · DOCS_RESPONSIVE=${fail === 0 ? 'PASS' : 'FAIL'}`);
console.log(`evidence: ${out}`);
process.exit(fail === 0 ? 0 : 1);
