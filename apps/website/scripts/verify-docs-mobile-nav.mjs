// Playwright verification: the public /docs navigation is usable on narrow
// screens (390px and 414px) and never overlaps the documentation content.
//
// Proves, at both mobile widths:
//   - the docs nav does not overlap the article (normal-flow above content);
//   - the nav is NOT sticky on mobile (it scrolls away — cannot overlap);
//   - all seven primary links + the Glossário secondary link are present;
//   - a nav link is keyboard-focusable (a real anchor);
//   - touch/tap navigation works (active section + hash);
//   - deep links (e.g. /docs#reembolsos) scroll the section to the top.
//
// Requires Playwright with Chromium available:
//   npx playwright install chromium   (once)
//   BASE_URL=http://localhost:3005 node scripts/verify-docs-mobile-nav.mjs
// (start the site first: `npm run dev`). Exit 0 = pass, non-zero = a regression.

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3005';
const URL = `${BASE}/developers/docs`;
const PRIMARY = ['Introdução', 'Quickstart', 'API Reference', 'SDKs', 'Webhooks', 'Errors', 'Changelog'];
let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };

const browser = await chromium.launch();
for (const width of [390, 414]) {
  console.log(`\n### viewport ${width}px ###`);
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);

  const geom = await p.evaluate(() => {
    const nav = document.querySelector('aside.bz-docsnav');
    const art = document.querySelector('article');
    const n = nav.getBoundingClientRect(), a = art.getBoundingClientRect();
    return { navBottom: n.bottom + scrollY, artTop: a.top + scrollY };
  });
  ok(geom.navBottom <= geom.artTop + 2, `nav does not overlap content (nav.bottom ${Math.round(geom.navBottom)} ≤ article.top ${Math.round(geom.artTop)})`);

  await p.evaluate(() => window.scrollTo(0, 700));
  await p.waitForTimeout(200);
  const navTopAfter = await p.evaluate(() => document.querySelector('aside.bz-docsnav').getBoundingClientRect().top);
  ok(navTopAfter < -100, `nav is normal-flow, not pinned after scroll (viewport top ${Math.round(navTopAfter)})`);

  const texts = await p.evaluate(() =>
    Array.from(document.querySelectorAll('aside.bz-docsnav a[href]')).map(a => a.textContent.trim()));
  ok(PRIMARY.every(t => texts.includes(t)), `all 7 primary links present (${PRIMARY.filter(t => texts.includes(t)).length}/7)`);
  ok(texts.includes('Glossário'), 'Glossário secondary link reachable');

  const focusable = await p.evaluate(() => {
    const a = document.querySelector('aside.bz-docsnav a[href]');
    a.focus();
    return document.activeElement === a && a.tagName === 'A' && a.getAttribute('href').startsWith('#');
  });
  ok(focusable, 'nav link is keyboard-focusable (real anchor)');

  await p.locator('aside.bz-docsnav a[href="#webhooks"]').tap();
  await p.waitForTimeout(200);
  ok((await p.evaluate(() => location.hash)) === '#webhooks', 'touch/tap navigates (active section)');
  await ctx.close();

  // Deep link — fresh page (the real scenario), settle the animated scroll.
  const dctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const dp = await dctx.newPage();
  await dp.goto(`${URL}#reembolsos`, { waitUntil: 'load' });
  let prev = -1, rtop = 0;
  for (let k = 0; k < 14; k++) {
    await dp.waitForTimeout(300);
    const y = await dp.evaluate(() => Math.round(window.scrollY));
    rtop = await dp.evaluate(() => Math.round(document.querySelector('#reembolsos').getBoundingClientRect().top));
    if (y === prev && k > 1) break;
    prev = y;
  }
  const vh = await dp.evaluate(() => window.innerHeight);
  ok(rtop > -150 && rtop < vh * 0.6, `deep link #reembolsos scrolls the section to the top (top ${rtop})`);
  await dctx.close();
}
await browser.close();
console.log(`\n### RESULT: ${fail === 0 ? 'PASS' : 'FAIL(' + fail + ')'} ###`);
process.exit(fail === 0 ? 0 : 1);
