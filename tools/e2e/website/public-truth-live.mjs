#!/usr/bin/env node
/**
 * PUBLIC-TRUTH-001 §57–58 — the DEPLOYED banzami.com, read the way a visitor
 * reads it.
 *
 * The source gate (tools/check-public-site-truth.mjs) proves what the code
 * says. This proves what arrives through Cloudflare: that no mailto was
 * rewritten into /cdn-cgi/l/email-protection, that every public page has its
 * canonical and the Sandbox/Live status, that the sitemap and security.txt are
 * served, that www redirects, and — in a real browser at 1440, 1280, tablet and
 * 390 px — that nothing overflows sideways, the environment status is visible
 * and every same-site link resolves.
 *
 *   node tools/e2e/website/public-truth-live.mjs            # http + browser
 *   node tools/e2e/website/public-truth-live.mjs http       # http only
 *
 * Screenshots go to the assurance directory, outside the worktree.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assuranceDir } from '../lib/assurance-output.mjs';

const ORIGIN = 'https://banzami.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const mode = process.argv[2] ?? 'all';

// The page list is the site's own (apps/website/lib/public-pages.ts).
const pagesSrc = readFileSync(new URL('../../../apps/website/lib/public-pages.ts', import.meta.url), 'utf8');
const MARKETING_PAGES = [...pagesSrc.matchAll(/path:\s*'([^']+)'/g)].map((m) => ({ path: m[1] }));

const results = [];
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`  ✗ ${name} — ${e.message}`);
  }
};
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
const get = async (url, init = {}) => {
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}ptcb=${Date.now()}`, { headers: { 'user-agent': UA }, redirect: 'manual', ...init });
  return { res, text: res.status < 300 ? await res.text() : '' };
};

console.log('HTTP — through Cloudflare, as a browser');
let emailRewrites = 0;
for (const { path } of MARKETING_PAGES) {
  await step(`GET ${path}`, async () => {
    const { res, text } = await get(`${ORIGIN}${path}`);
    must(res.status === 200, `status ${res.status}`);
    const rewrites = (text.match(/\/cdn-cgi\/l\/email-protection/g) ?? []).length;
    emailRewrites += rewrites;
    must(rewrites === 0, `${rewrites} mailto link(s) rewritten by Cloudflare`);
    const canonical = (text.match(/<link rel="canonical" href="([^"]+)"/) ?? [])[1];
    const want = path === '/' ? [`${ORIGIN}`, `${ORIGIN}/`] : [`${ORIGIN}${path}`];
    must(want.includes(canonical), `canonical ${canonical}`);
    must(/Financial Live/.test(text) && /indispon[ií]vel/.test(text), 'no Financial Live status in the HTML');
    for (const bad of ['DISPONÍVEL NA', 'Em breve', 'waitlist', 'Multicaixa Express integrado', 'instantaneamente', '/v1/business/']) {
      must(!text.includes(bad), `still says "${bad}"`);
    }
    return `canonical ok, ${(text.match(/href="mailto:/g) ?? []).length} mailto intact`;
  });
}
await step('sitemap.xml lists every public page', async () => {
  const { res, text } = await get(`${ORIGIN}/sitemap.xml`);
  must(res.status === 200 && /application\/xml/.test(res.headers.get('content-type') ?? ''), `status ${res.status}`);
  for (const { path } of MARKETING_PAGES) must(text.includes(`<loc>${ORIGIN}${path}</loc>`), `missing ${path}`);
  must(!/\/docs|\/login/.test(text), 'lists a docs or Console URL');
  return `${MARKETING_PAGES.length} URLs`;
});
await step('security.txt is served', async () => {
  const { res, text } = await get(`${ORIGIN}/.well-known/security.txt`);
  must(res.status === 200 && /^Contact: mailto:security@banzami\.com$/m.test(text) && /^Expires: /m.test(text), `status ${res.status}`);
});
await step('www redirects to the apex', async () => {
  const res = await fetch('https://www.banzami.com/faq', { headers: { 'user-agent': UA }, redirect: 'manual' });
  must([301, 308].includes(res.status) && (res.headers.get('location') ?? '').startsWith('https://banzami.com/faq'), `${res.status} → ${res.headers.get('location')}`);
});
await step('the documentation stays canonical on developers.banzami.com', async () => {
  const { res, text } = await get('https://developers.banzami.com/docs');
  must(res.status === 200 && !/\/cdn-cgi\/l\/email-protection/.test(text), `status ${res.status}`);
});
console.log(`PUBLIC_EMAIL_OBFUSCATION_BROKEN=${emailRewrites}`);

if (mode !== 'http') {
  console.log('\nBROWSER — 1440, 1280, tablet, 390');
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '/Users/fm65/doa/node_modules/@playwright/test/index.mjs').catch(() => import('playwright'));
  const out = join(assuranceDir('public-truth-website'), 'screens');
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const widths = [['1440', 1440, 900], ['1280', 1280, 800], ['tablet', 768, 1024], ['390', 390, 844]];
  const links = new Set();
  for (const [label, width, height] of widths) {
    const ctx = await browser.newContext({ viewport: { width, height }, userAgent: UA, isMobile: width < 768, hasTouch: width < 768 });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    for (const { path } of MARKETING_PAGES) {
      await step(`${label} ${path}`, async () => {
        consoleErrors.length = 0;
        const res = await page.goto(`${ORIGIN}${path}`, { waitUntil: 'networkidle' });
        must(res?.status() === 200, `status ${res?.status()}`);
        const m = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          banner: document.querySelector('[role="status"]')?.textContent ?? '',
          h1: document.querySelector('h1')?.textContent?.trim() ?? '',
          mailto: [...document.querySelectorAll('a[href^="mailto:"]')].length,
          protectedLinks: [...document.querySelectorAll('a[href*="email-protection"]')].length,
          links: [...document.querySelectorAll('a[href]')].map((a) => a.href),
        }));
        must(m.overflow <= 1, `page scrolls sideways by ${m.overflow}px`);
        must(/SANDBOX/.test(m.banner) && /Financial Live/.test(m.banner) || width <= 440, `banner "${m.banner}"`);
        must(m.h1.length > 0, 'no h1');
        must(m.protectedLinks === 0, `${m.protectedLinks} obfuscated mailto`);
        const csp = consoleErrors.filter((e) => /Content Security Policy|Refused to/.test(e));
        must(csp.length === 0, `CSP errors: ${csp[0]}`);
        for (const l of m.links) if (/^https:\/\/(banzami\.com|developers\.banzami\.com)\//.test(l)) links.add(l.split('#')[0]);
        await page.screenshot({ path: join(out, `${label}${path === '/' ? '-home' : path.replaceAll('/', '-')}.png`), fullPage: false });
        return `h1 "${m.h1.slice(0, 40)}"`;
      });
    }
    await ctx.close();
  }
  await browser.close();

  console.log('\nLINKS — every same-site link the pages render');
  let broken = 0;
  for (const l of [...links].sort()) {
    const res = await fetch(l, { headers: { 'user-agent': UA }, redirect: 'manual' });
    const okStatus = res.status < 400 || (res.status === 405);
    if (!okStatus) { broken += 1; console.log(`  ✗ ${res.status} ${l}`); }
  }
  results.push({ name: 'links', ok: broken === 0 });
  console.log(`PUBLIC_SITE_LINKS_CHECKED=${links.size}`);
  console.log(`PUBLIC_SITE_BROKEN_LINKS=${broken}`);
  console.log(`screenshots: ${out}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\nPUBLIC_TRUTH_LIVE_STEPS=${results.length}`);
console.log(`PUBLIC_TRUTH_LIVE_FAILED=${failed}`);
console.log(`PUBLIC_TRUTH_LIVE=${failed ? 'FAIL' : 'PASS'}`);
process.exit(failed ? 1 : 0);
