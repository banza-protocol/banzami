#!/usr/bin/env node
/**
 * DOCS-TRUTH-PREMIUM-001 — live evidence: SEO/OG/canonical, machine discovery,
 * status-code parity, and external-link classification of the DEPLOYED site.
 *   node tools/e2e/site/live-evidence.mjs
 */
const M = 'https://banzami.com';
const D = 'https://developers.banzami.com';
// Note: "Segurança" is a section anchor (/produto#seguranca), not a standalone
// route, so the security content is audited as part of /produto.
const PAGES = [`${M}/`, `${M}/produto`, `${M}/comerciantes`, `${M}/developers`, `${M}/seguranca`, `${M}/sobre`, `${M}/suporte`, `${D}/docs`, `${D}/docs/en`];
const pick = (html, re) => (html.match(re)?.[1] ?? '').trim();
const meta = (html, prop) => pick(html, new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'))
  || pick(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));

let fail = 0;
const externals = new Map();

console.log('=== SEO / OG / canonical ===');
const titles = new Map();
for (const url of PAGES) {
  let html; try { html = await (await fetch(url)).text(); } catch (e) { console.log(`  ✗ ${url} fetch ${e.message}`); fail = 1; continue; }
  const title = pick(html, /<title[^>]*>([^<]*)<\/title>/i);
  const desc = meta(html, 'description');
  const canon = pick(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const ogT = meta(html, 'og:title'); const ogD = meta(html, 'og:description'); const ogImg = meta(html, 'og:image');
  const issues = [];
  if (!title) issues.push('no-title');
  if (!desc) issues.push('no-description');
  if (!canon) issues.push('no-canonical');
  if (!ogT || !ogD) issues.push('no-og');
  if (titles.has(title)) issues.push(`dup-title(${titles.get(title)})`); else titles.set(title, url);
  // collect external links — ANCHOR links only. <link rel="preconnect|dns-prefetch|
  // stylesheet"> are resource hints, not navigable links, so they are not part of
  // a broken-link audit (a preconnect to a font ORIGIN legitimately 404s on GET).
  for (const m of html.matchAll(/<a\b[^>]+href=["'](https?:\/\/[^"']+)["']/gi)) {
    const h = m[1];
    try { if (!/(^|\.)banzami\.com/.test(new URL(h).hostname)) externals.set(h.split('#')[0], url); } catch { /* bad url */ }
  }
  // Security-superlative check (§42): the security section (/produto#seguranca)
  // must use concrete controls, never marketing absolutes.
  if (url.endsWith('/produto')) {
    if (/military[- ]grade|unbreakable|zero risk|100%\s*(secure|seguro)|impenetr[áa]vel|inquebr[áa]vel|risco zero/i.test(html)) {
      console.log('  ✗ /produto -> security superlative found'); fail = 1;
    }
  }
  // OG image resolves?
  let ogOk = 'n/a';
  if (ogImg) { try { const r = await fetch(ogImg, { method: 'GET' }); ogOk = r.status; if (r.status !== 200) issues.push(`og-image-${r.status}`); } catch { issues.push('og-image-fail'); } }
  if (issues.length) { console.log(`  ✗ ${url} -> ${issues.join(' ')} (og-img=${ogOk})`); fail = 1; }
  else console.log(`  ✓ ${url}  title="${title.slice(0, 40)}" canon=${canon ? 'y' : 'n'} og=y img=${ogOk}`);
}

console.log('\n=== machine discovery ===');
for (const [path, must] of [['/robots.txt', /sitemap/i], ['/sitemap.xml', /banzami\.com/], ['/llms.txt', /banzami/i], ['/.well-known/security.txt', /contact/i]]) {
  try {
    const r = await fetch(`${M}${path}`); const t = await r.text();
    const ok = r.status === 200 && must.test(t);
    console.log(`  ${ok ? '✓' : '✗'} ${path} ${r.status}`); if (!ok) fail = 1;
  } catch (e) { console.log(`  ✗ ${path} ${e.message}`); fail = 1; }
}

console.log('\n=== status-code parity (documented public contracts) ===');
const checks = [
  ['GET', 'https://sandbox-api.banzami.com/consumer/v1/me/wallet/balance', [401], 'auth-required'],
  ['POST', 'https://sandbox-api.banzami.com/consumer/v1/me/realtime', [405], 'no-write-verb'],
  ['GET', 'https://sandbox-api.banzami.com/consumer/v1/me/realtime', [401], 'realtime-auth'],
  ['GET', 'https://sandbox-api.banzami.com/v1/public/proofs/BZM-NOPE-NOPE-NOPE-NOPE-NOPE-NOPE', [404], 'invalid-proof'],
  ['GET', 'https://developer-api.banzami.com/health', [200, 404], 'dev-api-reachable'],
];
for (const [m, u, ok, name] of checks) {
  try { const r = await fetch(u, { method: m }); const good = ok.includes(r.status); console.log(`  ${good ? '✓' : '✗'} ${name} ${m} -> ${r.status} (want ${ok})`); if (!good) fail = 1; }
  catch (e) { console.log(`  ✗ ${name} ${e.message}`); fail = 1; }
}

console.log('\n=== external links ===');
let stale = 0;
for (const [href, from] of externals) {
  let cls = 'VALID';
  try {
    const r = await fetch(href, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(12000) });
    if (r.status === 404 || r.status === 410) { cls = 'STALE'; stale++; }
    else if (r.status >= 500 || r.status === 403 || r.status === 429) cls = 'TEMPORARILY_UNAVAILABLE';
  } catch { cls = 'TEMPORARILY_UNAVAILABLE'; }
  const mark = cls === 'STALE' ? '✗' : (cls === 'VALID' ? '✓' : '·');
  console.log(`  ${mark} [${cls}] ${href}  (from ${from.replace(M, '').replace(D, 'docs')})`);
}
console.log(`\nKNOWN_STALE_EXTERNAL_LINKS=${stale}`);
if (stale) fail = 1;
console.log(`\nLIVE_EVIDENCE=${fail === 0 ? 'PASS' : 'FAIL'}`);
process.exitCode = fail;
