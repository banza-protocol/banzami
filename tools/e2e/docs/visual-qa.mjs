#!/usr/bin/env node
/**
 * DOCS-VISUAL-DX-002 — the public Developer Documentation, looked at on the real
 * site: screenshots for a person, measurements for the gate.
 *
 * For each page × width × browser it records
 *   · a screenshot (viewport, and the first endpoint / code block when present)
 *   · document horizontal overflow (a code block may scroll inside itself; the
 *     page may not)
 *   · cumulative layout shift during load and a slow scroll
 *   · script and stylesheet bytes the page transferred
 *   · the rendered code blocks: how many, how many carry syntax tokens, and
 *     whether any token text differs from the block's copy source
 *   · every method badge's text, and every endpoint heading's method + path text
 *
 *   node tools/e2e/docs/visual-qa.mjs --label before|after [--base https://developers.banzami.com] [--browsers chromium,webkit]
 *
 * Writes <assurance>/docs-visual/<label>/report.json and the screenshots beside it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assuranceDir } from '../lib/assurance-output.mjs';

const pw = await import(process.env.PLAYWRIGHT_MODULE ?? '/Users/fm65/doa/node_modules/@playwright/test/index.mjs');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const LABEL = arg('--label', 'run');
const BASE = arg('--base', 'https://developers.banzami.com');
const BROWSERS = arg('--browsers', 'chromium').split(',');
const OUT = join(assuranceDir('docs-visual'), LABEL);
mkdirSync(OUT, { recursive: true });

export const PAGES = [
  { id: 'reference-me', path: '/docs/reference#ref-me', focus: '#ref-me' },
  { id: 'reference-payment-sessions', path: '/docs/reference#ref-ps-create', focus: '#ref-ps-create' },
  { id: 'reference-payment-links', path: '/docs/reference#ref-pl-create', focus: '#ref-pl-create' },
  { id: 'reference-delete', path: '/docs/reference#ref-pl-cancel', focus: '#ref-pl-cancel' },
  { id: 'reference-refunds', path: '/docs/reference#ref-refund-create', focus: '#ref-refund-create' },
  { id: 'reference-webhooks', path: '/docs/reference#ref-webhook-register', focus: '#ref-webhook-register' },
  { id: 'reference-realtime', path: '/docs/reference#ref-realtime-status', focus: '#ref-realtime-status' },
  { id: 'reference-en', path: '/docs/en/reference#ref-ps-create', focus: '#ref-ps-create' },
  { id: 'quickstart', path: '/docs/get-started', focus: null },
  { id: 'payments', path: '/docs/payments', focus: null },
  { id: 'webhooks-guide', path: '/docs/webhooks', focus: null },
  { id: 'errors', path: '/docs/errors', focus: null },
  { id: 'events', path: '/docs/events', focus: null },
  { id: 'doa', path: '/docs/doa', focus: null },
];
export const WIDTHS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1280', width: 1280, height: 800 },
  { name: '834', width: 834, height: 1112 },
  { name: '390', width: 390, height: 844 },
];

const results = [];
for (const browserName of BROWSERS) {
  const browserType = pw[browserName];
  if (!browserType) { console.error(`unknown browser ${browserName}`); process.exit(2); }
  let browser;
  try { browser = await browserType.launch(); } catch (e) { console.error(`  ✗ ${browserName} unavailable: ${String(e.message).split('\n')[0]}`); results.push({ browser: browserName, unavailable: true }); continue; }
  for (const vp of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    for (const page of PAGES) {
      const p = await ctx.newPage();
      await p.addInitScript(() => {
        window.__cls = 0;
        try {
          new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
            .observe({ type: 'layout-shift', buffered: true });
        } catch { /* WebKit has no layout-shift entries */ window.__cls = null; }
      });
      const url = BASE + page.path;
      await p.goto(url, { waitUntil: 'networkidle' });
      if (page.focus) await p.locator(page.focus).first().scrollIntoViewIfNeeded().catch(() => {});
      await p.waitForTimeout(600);
      // A slow scroll through the page, so late shifts are counted.
      await p.evaluate(async () => { for (let y = 0; y < Math.min(document.documentElement.scrollHeight, 30000); y += 900) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } });
      if (page.focus) await p.locator(page.focus).first().scrollIntoViewIfNeeded().catch(() => {}); else await p.evaluate(() => window.scrollTo(0, 0));
      await p.waitForTimeout(300);
      const m = await p.evaluate(() => {
        const d = document.documentElement;
        const res = performance.getEntriesByType('resource');
        const bytes = (t) => res.filter((r) => r.initiatorType === t || (t === 'script' && r.name.endsWith('.js')) || (t === 'link' && r.name.endsWith('.css'))).reduce((n, r) => n + (r.encodedBodySize || r.transferSize || 0), 0);
        const blocks = [...document.querySelectorAll('[data-code-block]')];
        const pres = [...document.querySelectorAll('#docs-content pre')];
        return {
          overflow: d.scrollWidth > d.clientWidth + 1,
          scrollWidth: d.scrollWidth,
          cls: window.__cls,
          jsBytes: bytes('script'),
          cssBytes: bytes('link'),
          preCount: pres.length,
          codeBlocks: blocks.length,
          highlighted: blocks.filter((b) => b.querySelector('[data-token]')).length,
          plainByDesign: blocks.filter((b) => b.getAttribute('data-lang') === 'text').length,
          copySourceMismatch: blocks.filter((b) => {
            const pre = b.querySelector('pre');
            return pre && b.getAttribute('data-raw-length') && String(pre.textContent.length) !== b.getAttribute('data-raw-length');
          }).length,
          methodBadges: [...document.querySelectorAll('[data-http-method]')].map((x) => x.textContent.trim()).slice(0, 60),
          endpointHeadings: [...document.querySelectorAll('[data-endpoint-heading]')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()).slice(0, 60),
        };
      });
      const shot = join(OUT, `${browserName}-${vp.name}-${page.id}.png`);
      await p.screenshot({ path: shot });
      results.push({ browser: browserName, width: vp.name, page: page.id, url, ...m, screenshot: shot });
      console.log(`  ${m.overflow ? '✗' : '✓'} ${browserName} ${vp.name} ${page.id} — overflow=${m.overflow} cls=${m.cls === null ? 'n/a' : m.cls.toFixed(4)} js=${Math.round(m.jsBytes / 1024)}KB pre=${m.preCount} blocks=${m.codeBlocks} highlighted=${m.highlighted}`);
      await p.close();
    }
    await ctx.close();
  }
  await browser.close();
}
writeFileSync(join(OUT, 'report.json'), `${JSON.stringify({ label: LABEL, base: BASE, ran_at: new Date().toISOString(), results }, null, 2)}\n`);
const measured = results.filter((r) => !r.unavailable);
console.log(`\nDOCS_VISUAL_${LABEL.toUpperCase()}: pages=${measured.length} overflow=${measured.filter((r) => r.overflow).length} max_cls=${Math.max(0, ...measured.map((r) => r.cls ?? 0)).toFixed(4)}`);
console.log(`evidence: ${OUT}`);
