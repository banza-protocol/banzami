#!/usr/bin/env node
/**
 * The documentation search index, generated from the documentation itself.
 *
 * Search has to find what a developer types: a page, a section heading, an
 * endpoint (POST /v1/refunds), an error code (PAYMENTS_UNAVAILABLE), an event
 * (payment_session.paid), an SDK method (createPaymentSession) or a glossary
 * term. None of those lists is written here — each is read from where it is
 * already authoritative — so the index cannot drift from the pages. --check
 * fails when the committed index differs from a fresh build (CI runs it).
 *
 * The index ships as a static file and is searched in the browser. Nothing a
 * reader types leaves the page.
 *
 *   node tools/docs/build-search-index.mjs          # write
 *   node tools/docs/build-search-index.mjs --check  # verify
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.BZ_DOCS_ROOT ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const DIR = join(ROOT, 'apps/website/app/developers/docs');
const OUT = join(DIR, 'search-index.json');
const read = (f) => readFileSync(join(DIR, f), 'utf8');

const SLUG = { GetStarted: 'get-started', Sdk: 'sdk', Console: 'console', Guides: 'guides', Doa: 'doa', Reference: 'reference', Testing: 'testing', Trust: 'trust', Artifacts: 'artifacts', Changelog: 'changelog', Glossary: 'glossary' };
const plain = (s) => s.replace(/<[^>]+>/g, '').replace(/\{' '\}/g, ' ').replace(/&rsquo;/g, '’').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function build() {
  const index = { pt: [], en: [] };
  const shell = read('shell.tsx');
  const reference = read('reference.tsx');
  const catalogue = JSON.parse(read('error-catalogue.json'));
  const add = (lang, kind, title, href, hint = '') => {
    if (!index[lang].some((e) => e.t === title && e.h === href)) index[lang].push({ k: kind, t: title, h: href, ...(hint ? { d: hint } : {}) });
  };

  for (const [lang, file, prefix, areasName] of [['pt', 'content-pt.tsx', 'Pt', 'AREAS_PT'], ['en', 'content-en.tsx', 'En', 'AREAS_EN']]) {
    const base = lang === 'pt' ? '/docs' : '/docs/en';
    const areas = shell.slice(shell.indexOf(`export const ${areasName}`), shell.indexOf('];', shell.indexOf(`export const ${areasName}`)));
    for (const m of areas.matchAll(/\{ slug: '([^']*)', label: '([^']+)', desc: '([^']+)' \}/g)) add(lang, 'page', m[2], m[1] ? `${base}/${m[1]}` : base, m[3]);

    const src = read(file);
    const fns = [...src.matchAll(new RegExp(`export function ${prefix}(\\w+)\\(`, 'g'))];
    fns.forEach((f, i) => {
      const slug = SLUG[f[1]];
      if (!slug) return;
      const body = src.slice(f.index, i + 1 < fns.length ? fns[i + 1].index : src.length);
      const href = `${base}/${slug}`;
      for (const h of body.matchAll(/<H3 id="([^"]+)">([\s\S]*?)<\/H3>/g)) add(lang, 'section', plain(h[2].replace(/<Badge[^>]*\/>|<Badge[\s\S]*?<\/Badge>/g, '')), `${href}#${h[1]}`);
      // SDK methods in this page's text and in the samples it renders.
      const samples = [...body.matchAll(/raw=\{(SAMPLE_[A-Z0-9_]+)\}/g)].map((x) => {
        const d = new RegExp(`const ${x[1]}\\s*=\\s*\`((?:\\\\\`|[^\`])*)\``).exec(src);
        return d ? d[1] : '';
      }).join('\n');
      for (const m of `${body}\n${samples}`.matchAll(/\b((?:create|get|list|rotate|resolve)[A-Z]\w+|constructEvent|paymentSessionInterface)\(/g)) add(lang, 'method', m[1], href);
    });

    for (const e of reference.matchAll(/id: '(ref-[^']+)',\s*method: '(GET|POST|DELETE)',\s*path: '([^']+)'/g)) add(lang, 'endpoint', `${e[2]} ${e[3]}`, `${base}/reference#${e[1]}`);
    for (const e of catalogue.errors) add(lang, 'error', e.code, `${base}/reference#error-${e.code}`, e.meaning[lang]);
    for (const ev of read(file).match(/'(payment_session|payment_link|refund|application_settlement)\.[a-z]+'/g) ?? []) {
      add(lang, 'event', ev.slice(1, -1), `${base}/guides#${lang === 'pt' ? 'eventos' : 'events'}`);
    }
  }
  const glossary = read('glossary.ts');
  for (const m of glossary.matchAll(/id: '([^']+)',\s*term: '([^']+)',(?:\s*code: true,)?\s*def: '([^']+)'/g)) add('pt', 'term', m[2], `/docs/glossary#glossario-${m[1]}`, m[3]);
  const en = read('content-en.tsx');
  const concepts = en.slice(en.indexOf('const CONCEPTS'), en.indexOf('];', en.indexOf('const CONCEPTS')));
  for (const m of concepts.matchAll(/term: '([^']+)', def: '((?:[^'\\]|\\.)+)'/g)) add('en', 'term', m[1], '/docs/en/glossary#concepts', m[2]);
  return index;
}

const fresh = `${JSON.stringify(build(), null, 1)}\n`;
if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { /* missing */ }
  const idx = JSON.parse(fresh);
  console.log(`DOCS_SEARCH_INDEX_ENTRIES_PT=${idx.pt.length} DOCS_SEARCH_INDEX_ENTRIES_EN=${idx.en.length}`);
  const kinds = (l) => [...new Set(idx[l].map((e) => e.k))].sort().join(',');
  console.log(`DOCS_SEARCH_KINDS_PT=${kinds('pt')} DOCS_SEARCH_KINDS_EN=${kinds('en')}`);
  if (current !== fresh) { console.error('✗ search-index.json is stale — run node tools/docs/build-search-index.mjs'); console.log('DOCS_SEARCH_INDEX_CURRENT=FAIL'); process.exit(1); }
  if (kinds('pt') !== 'endpoint,error,event,method,page,section,term' || kinds('pt') !== kinds('en')) { console.error('✗ the index lacks a kind a reader searches for'); process.exit(1); }
  console.log('DOCS_SEARCH_INDEX_CURRENT=PASS');
} else {
  writeFileSync(OUT, fresh);
  const idx = JSON.parse(fresh);
  console.log(`wrote ${OUT}: pt ${idx.pt.length}, en ${idx.en.length}`);
}
