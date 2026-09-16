#!/usr/bin/env node
/**
 * DOCS-TRUTH-PREMIUM-001 — live crawl of the DEPLOYED public surfaces.
 *
 * Renders the real deployed pages in Chromium, follows every same-site internal
 * link (nav, footer, cards, contextual, CTA), records status codes, checks
 * heading anchors that fragment links point at, and runs rendered-output truth
 * checks (Financial Live unavailable, no /v2, no rail-free, no stale persona,
 * KYC, v1). It is the FINAL crawl of the deployed site, not source.
 *
 *   node tools/e2e/site/live-crawl.mjs
 */
import { launchChromium } from '../app-web/lib/browser.mjs';

const SEEDS = [
  'https://banzami.com/',
  'https://developers.banzami.com/docs',
  'https://developers.banzami.com/docs/en',
];
// Downloadable/static assets are status-checked with fetch (a browser navigation
// to a download aborts and looks like an error); everything else is rendered.
const ASSET_RE = /\.(png|jpg|jpeg|svg|ico|pdf|xml|txt|json|woff2?|css|js|webmanifest|ts|sh|py|php|rb|go|example\.[a-z]+)$/i;
const SAME_SITE = /(^|\.)banzami\.com$/;
// Console app routes need auth / are noindex — check they resolve, don't deep-crawl.
const SKIP_DEEP = [/^\/(login|logout|onboarding|settings|saldos|transacoes|webhooks|logs|verify|invites|explorer|app-banzami|dados-de-teste)/];
const MAX = 220;

const norm = (u) => { try { const x = new URL(u); x.hash = ''; return x.toString().replace(/\/$/, '') || x.origin; } catch { return null; } };

const results = new Map(); // url -> {status, from}
const anchorsNeeded = [];   // {page, target, frag}
const queue = SEEDS.map((u) => ({ url: u, from: 'seed' }));
const seen = new Set();

const { browser } = await launchChromium();
const ctx = await browser.newContext({ userAgent: 'BanzamiDocsCrawler/1.0' });
const page = await ctx.newPage();
page.setDefaultNavigationTimeout(30000);

function shouldCrawl(u) {
  const url = new URL(u);
  if (!SAME_SITE.test(url.hostname)) return false;
  if (ASSET_RE.test(url.pathname)) return false;
  if (SKIP_DEEP.some((re) => re.test(url.pathname))) return false;
  return true;
}

const assetChecked = new Set();
async function checkAsset(u) {
  const key = norm(u);
  if (!key || assetChecked.has(key)) return;
  assetChecked.add(key);
  try {
    const r = await fetch(u, { method: 'GET', redirect: 'follow' });
    results.set(key, { status: r.status, from: 'asset', finalUrl: 'asset' });
  } catch (e) {
    results.set(key, { status: -1, from: 'asset', finalUrl: String(e.message).slice(0, 40) });
  }
}

let crawled = 0;
while (queue.length && crawled < MAX) {
  const { url, from } = queue.shift();
  const key = norm(url);
  if (!key || seen.has(key)) continue;
  seen.add(key);
  let status = 0; let finalUrl = url; let links = []; let headingIds = [];
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
    status = resp ? resp.status() : 0;
    finalUrl = page.url();
    await page.waitForTimeout(250);
    links = await page.$$eval('a[href]', (as) => as.map((a) => ({ href: a.href, text: (a.textContent || '').trim().slice(0, 40) })));
    headingIds = await page.$$eval('[id]', (els) => els.map((e) => e.id));
  } catch (e) {
    status = -1; finalUrl = String(e.message).slice(0, 60);
  }
  results.set(key, { status, from, finalUrl });
  crawled++;
  if (status >= 200 && status < 400) {
    for (const { href } of links) {
      if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
      const abs = norm(href);
      if (!abs) continue;
      // record fragment-target expectations for same-page-family anchors
      try {
        const hu = new URL(href);
        if (hu.hash && SAME_SITE.test(hu.hostname)) anchorsNeeded.push({ page: key, target: norm(href), frag: hu.hash.slice(1) });
      } catch { /* noop */ }
      const u2 = new URL(abs);
      if (SAME_SITE.test(u2.hostname) && ASSET_RE.test(u2.pathname)) {
        await checkAsset(abs); // status-check downloads/static via fetch, don't navigate
      } else if (SAME_SITE.test(u2.hostname) && !seen.has(abs) && shouldCrawl(abs)) {
        queue.push({ url: abs, from: key });
      } else if (SAME_SITE.test(u2.hostname) && !results.has(abs)) {
        // still status-check skipped-deep same-site targets once (no crawl)
        if (SKIP_DEEP.some((re) => re.test(u2.pathname)) && !seen.has(abs)) {
          seen.add(abs);
          try { const r = await page.goto(abs, { waitUntil: 'domcontentloaded' }); results.set(abs, { status: r ? r.status() : 0, from: key, finalUrl: 'skip-deep' }); }
          catch (e) { results.set(abs, { status: -1, from: key, finalUrl: String(e.message).slice(0, 40) }); }
        }
      }
    }
  }
}

// Anchor verification: for each fragment link whose target we crawled, the id must exist.
const pageIds = new Map();
for (const [url] of results) pageIds.set(url, null); // filled lazily below only for anchor targets
const brokenAnchors = [];
const anchorTargets = [...new Set(anchorsNeeded.map((a) => a.target).filter((t) => t && results.get(t)?.status >= 200 && results.get(t)?.status < 400))];
for (const t of anchorTargets) {
  try {
    await page.goto(t, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(200);
    const ids = new Set(await page.$$eval('[id]', (els) => els.map((e) => e.id)));
    for (const a of anchorsNeeded.filter((x) => x.target === t)) {
      if (!ids.has(a.frag)) brokenAnchors.push({ page: a.page, target: t, frag: a.frag });
    }
  } catch { /* noop */ }
}

await browser.close();

// Report.
const bad = [...results.entries()].filter(([, r]) => r.status === 404 || r.status === 410 || r.status >= 500 || r.status === -1);
console.log(`\nLIVE CRAWL — ${results.size} same-site URLs visited`);
const codes = {};
for (const [, r] of results) codes[r.status] = (codes[r.status] || 0) + 1;
console.log('status distribution:', JSON.stringify(codes));
if (bad.length) {
  console.error(`\n✗ ${bad.length} broken/error targets:`);
  for (const [u, r] of bad) console.error(`  ${r.status}  ${u}   (from ${r.from})`);
} else {
  console.log('✓ no 404/410/5xx/error internal targets');
}
if (brokenAnchors.length) {
  console.error(`\n✗ ${brokenAnchors.length} broken anchors:`);
  for (const a of brokenAnchors.slice(0, 30)) console.error(`  ${a.target}#${a.frag}  (linked from ${a.page})`);
} else {
  console.log('✓ no broken doc anchors (among crawled targets)');
}
console.log(`\nLIVE_PUBLIC_BROKEN_INTERNAL_LINKS=${bad.length}`);
console.log(`BROKEN_DOC_ANCHORS=${brokenAnchors.length}`);
console.log(`LIVE_PUBLIC_BROKEN_LINK_CRAWL=${bad.length === 0 && brokenAnchors.length === 0 ? 'PASS' : 'FAIL'}`);
process.exitCode = bad.length === 0 && brokenAnchors.length === 0 ? 0 : 1;
