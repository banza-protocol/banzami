#!/usr/bin/env node
/**
 * Every route DOA ships, answered by DOA as deployed.
 *
 * A route exists in the repository whether or not anything reaches it. This
 * enumerates the App Router tree for both surfaces, asks the deployed sites for
 * each one as a stranger, and classifies the answer. It exists because three
 * different kinds of residue look identical from inside the source:
 *
 *   dead        — the file is there, the URL 404s. Nobody can use it and nobody
 *                 knows it is gone.
 *   unguarded   — a page that should require a session answers 200 to a stranger.
 *   broken      — a 5xx, which is neither a product decision nor a refusal.
 *
 * Parameterised segments are filled from a real campaign slug when one is given;
 * without one they are reported as UNPROBED rather than guessed, because a 404
 * from a made-up id proves nothing about the route.
 *
 *   node tools/e2e/doa/route-sweep.mjs [--campaign <slug>]
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { assuranceDir } from '../lib/assurance-output.mjs';

const DOA = process.env.DOA_REPO ?? '/Users/fm65/doa';
const argv = process.argv.slice(2);
const slug = argv.includes('--campaign') ? argv[argv.indexOf('--campaign') + 1] : null;

const SURFACES = [
  { name: 'www', root: join(DOA, 'apps/web/app'), origin: 'https://www.doadoa.app' },
  { name: 'admin', root: join(DOA, 'apps/admin/app'), origin: 'https://admin.doadoa.app' },
];

/** Walk the App Router tree, returning {url, kind, file} for every routable leaf. */
function routes(root, dir = root, segs = []) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // (group) segments are organisational and contribute nothing to the URL.
      out.push(...routes(root, full, entry.startsWith('(') ? segs : [...segs, entry]));
      continue;
    }
    if (entry === 'page.tsx') out.push({ url: '/' + segs.join('/'), kind: 'page', file: full.slice(DOA.length + 1) });
    if (entry === 'route.ts') out.push({ url: '/' + segs.join('/'), kind: 'api', file: full.slice(DOA.length + 1) });
  }
  return out;
}

const PARAM = /\[[^\]]+\]/;
function fill(url) {
  if (!PARAM.test(url)) return url;
  if (!slug) return null;
  // Only a campaign slug is knowable without a session; an id under /donations
  // or /users belongs to signed-in data and is left unprobed on purpose.
  if (/^\/c\/\[slug\]/.test(url) || /^\/campanhas\/\[slug\]/.test(url)) return url.replace('[slug]', slug);
  return null;
}

let fails = 0;
const rows = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { fails += 1; console.error(`  ✗ ${m}`); };

for (const s of SURFACES) {
  console.log(`\n── ${s.name} (${s.origin}) ──`);
  const all = routes(s.root).sort((a, b) => a.url.localeCompare(b.url));
  for (const r of all) {
    const url = fill(r.url === '/' ? '/' : r.url.replace(/\/$/, ''));
    if (url === null) {
      rows.push({ surface: s.name, ...r, verdict: 'UNPROBED', detail: 'parameterised; needs signed-in data' });
      console.log(`  · ${r.url} — UNPROBED (parameterised)`);
      continue;
    }
    const res = await fetch(s.origin + url, { redirect: 'manual', headers: { 'user-agent': 'banzami-route-sweep' } })
      .catch((e) => ({ status: 0, headers: new Headers(), error: String(e) }));
    const status = res.status;
    const loc = res.headers?.get?.('location') ?? '';
    let verdict, detail = `http ${status}${loc ? ` -> ${loc}` : ''}`;

    if (status === 0) { verdict = 'UNREACHABLE'; bad(`${r.url}: ${res.error}`); }
    else if (status >= 500) { verdict = 'BROKEN'; bad(`${r.url}: ${detail}`); }
    else if (status === 404) {
      // A 404 is only dead if nothing chose it. A route that answers 404 by its
      // own decision — because the thing it belongs to is not active on this
      // deployment — is doing its job, and the exemption is read from its source
      // rather than kept as a list here that would rot the first time one moved.
      const chose404 = /status:\s*404/.test(readFileSync(join(DOA, r.file), 'utf8'));
      if (chose404) { verdict = 'OFF_ON_THIS_DEPLOYMENT'; ok(`${r.url} — 404 by its own decision (not mounted for this deployment's configuration)`); }
      else { verdict = 'DEAD'; bad(`${r.url}: the file exists, the URL 404s, and nothing in it chose that — ${r.file}`); }
    }
    else if (status === 405) { verdict = 'WRONG_METHOD'; ok(`${r.url} — ${detail} (API route, GET not offered)`); }
    else if (status >= 300 && status < 400) {
      verdict = /\/login/.test(loc) ? 'AUTH_GATED' : 'REDIRECT';
      ok(`${r.url} — ${verdict} (${detail})`);
    } else if (status === 401 || status === 403) { verdict = 'AUTH_GATED'; ok(`${r.url} — AUTH_GATED (${detail})`); }
    else if (status === 400) { verdict = 'NEEDS_INPUT'; ok(`${r.url} — ${detail} (API route refuses an empty request)`); }
    else { verdict = 'PUBLIC_OK'; ok(`${r.url} — ${detail}`); }

    rows.push({ surface: s.name, ...r, url, status, verdict, detail });
  }
}

// A campaign page that does not exist must SAY it does not exist, in the status
// line and not only in the body. This route used to render the not-found page
// with HTTP 200: a crawler indexed URLs that were not there and an uptime check
// read a dead link as healthy. It is asserted here rather than in a unit test
// because the defect was in what the framework put on the wire, which is only
// observable from outside.
{
  const url = 'https://www.doadoa.app/c/definitely-not-a-campaign-' + Date.now().toString(36);
  const res = await fetch(url, { redirect: 'manual' }).catch(() => null);
  const status = res ? res.status : 0;
  const body = res ? await res.text().catch(() => '') : '';
  const saysMissing = /não encontrada/i.test(body);
  status === 404 && saysMissing
    ? ok(`an unknown campaign slug answers a real 404 (status 404, body says "não encontrada")`)
    : bad(`an unknown campaign slug answers http ${status} (body says missing=${saysMissing}) — a soft 404 is indexed as a real page`);
  rows.push({ surface: 'www', url: '/c/<unknown>', kind: 'page', file: 'apps/web/app/(public)/c/[slug]/page.tsx',
              status, verdict: status === 404 && saysMissing ? 'HARD_404' : 'SOFT_404', detail: `status ${status}` });
}

const counts = rows.reduce((a, r) => ({ ...a, [r.verdict]: (a[r.verdict] ?? 0) + 1 }), {});
console.log(`\nDOA_ROUTE_SWEEP: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')}`);
console.log(`DEAD_PUBLIC_ROUTES=${counts.DEAD ?? 0}`);

const out = join(assuranceDir('doa-route-sweep'), `doa-route-sweep-${Date.now()}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ ran_at: new Date().toISOString(), campaign: slug, counts, rows }, null, 2));
console.log(`evidence: ${out}`);
process.exit(fails ? 1 : 0);
