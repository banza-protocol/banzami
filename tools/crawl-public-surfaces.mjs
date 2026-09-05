// Public developer-surface crawl: every internal link reachable from the docs
// entry points must resolve, and no page may leak an internal host or a key.
const ROOTS = ['https://developers.banzami.com/docs', 'https://developers.banzami.com/docs/en',
               'https://developers.banzami.com/logs', 'https://banzami.com', 'https://pay.banzami.com'];
const seen = new Set(); const bad = []; const leaks = []; let pages = 0;
const HOSTS = ['developers.banzami.com','banzami.com','www.banzami.com','pay.banzami.com'];
async function visit(url, depth) {
  if (seen.has(url) || depth > 2 || pages > 80) return;
  seen.add(url);
  let r;
  try { r = await fetch(url, { redirect: 'follow' }); } catch (e) { bad.push([url, 'ERR ' + e.message]); return; }
  if (r.status >= 400) { bad.push([url, r.status]); return; }
  pages++;
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('text/html')) return;
  const html = await r.text();
  // Documented placeholders are runs of X — the same value-shape exemption the
  // repo's gitleaks policy uses. A real key in the same place still fails.
  if (/bz_(test|live)_(sk|pk)_(?!X{2,})[A-Za-z0-9]{8,}/.test(html)) leaks.push([url, 'key-shaped string']);
  if (/\b(?:10|172|192\.168)\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|217\.160\.9\.248|\/srv\//.test(html)) leaks.push([url, 'internal host/path']);
  for (const m of html.matchAll(/href="([^"#?]+)"/g)) {
    let href = m[1];
    if (href.startsWith('//') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    let next;
    try { next = new URL(href, url); } catch { continue; }
    if (!HOSTS.includes(next.host)) continue;
    if (/\.(png|jpg|svg|ico|webp|woff2?)$/i.test(next.pathname)) continue;
    await visit(next.origin + next.pathname, depth + 1);
  }
}
for (const r of ROOTS) await visit(r, 0);
console.log(`pages=${pages} broken=${bad.length} leaks=${leaks.length}`);
for (const b of bad.slice(0, 10)) console.log('  BROKEN', ...b);
for (const l of leaks.slice(0, 10)) console.log('  LEAK', ...l);
process.exit(bad.length + leaks.length === 0 ? 0 : 1);
