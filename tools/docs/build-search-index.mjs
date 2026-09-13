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

const SLUG = {
  GetStarted: 'get-started', Concepts: 'concepts', Payments: 'payments', Webhooks: 'webhooks', Events: 'events', Refunds: 'refunds',
  Settlements: 'settlements', Receipts: 'receipts', Transfers: 'transfers', Doa: 'doa', Console: 'console', Reference: 'reference',
  Errors: 'errors', Sdk: 'sdk', Artifacts: 'artifacts', Testing: 'testing', GoingLive: 'going-live', Trust: 'trust',
  Troubleshooting: 'troubleshooting', Support: 'support', Changelog: 'changelog', Glossary: 'glossary',
};
/**
 * English terms a Portuguese reader types, for the Portuguese pages that answer
 * them. Portuguese developers search in both languages; a PT search box that
 * finds nothing for "refund" fails a reader who knows exactly what they want.
 */
const PT_ALIASES = {
  'get-started': 'quickstart|getting started|first payment',
  concepts: 'how it works|sandbox and live|minor units|idempotency|request id',
  payments: 'payment session|payment link|accept payments|qr code',
  webhooks: 'webhook|signature|verify signature|webhook secret',
  events: 'events|event reference',
  refunds: 'refund|refunds',
  settlements: 'settlement|settlements|payout|fee',
  receipts: 'receipt|receipts|proof|verify receipt',
  transfers: 'transfer|transfers|wallet account|accounts',
  doa: 'reference implementation|doa tutorial',
  console: 'console|dashboard|api keys|workspace|project',
  reference: 'api reference|endpoints',
  errors: 'errors|error codes',
  sdk: 'sdk|sdks|library',
  artifacts: 'openapi|postman',
  testing: 'testing|sandbox testing|test',
  'going-live': 'live|production|go live',
  trust: 'security|api key|rotate key|key rotation|secret',
  glossary: 'glossary|terms',
  troubleshooting: 'troubleshooting|debug|problem',
  support: 'support|help|contact',
  changelog: 'changelog|release notes',
};
const PT_SECTION_ALIASES = {
  idempotencia: 'idempotency', rotacao: 'rotate key|key rotation|rotate secret', chaves: 'api key|api keys',
  'configuracao-financeira': 'financial setup', links: 'payment link|payment links', 'criar-sessao': 'payment session|create payment session',
  formato: 'secure_v1 format', verificar: 'verify receipt', 'sandbox-live': 'sandbox and live|live',
};

const plain = (s) => s.replace(/<[^>]+>/g, '').replace(/\{' '\}/g, ' ').replace(/&rsquo;/g, '’').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function build() {
  const index = { pt: [], en: [] };
  const shell = read('shell.tsx');
  const reference = read('reference.tsx');
  const catalogue = JSON.parse(read('error-catalogue.json'));
  const errorsTsx = read('ErrorCatalogue.tsx');
  const events = read('events.ts');
  const symptoms = read('symptoms.ts');
  const add = (lang, kind, title, href, hint = '', alias = '') => {
    if (!index[lang].some((e) => e.t === title && e.h === href)) index[lang].push({ k: kind, t: title, h: href, ...(hint ? { d: hint } : {}), ...(alias ? { a: alias } : {}) });
  };

  for (const [lang, file, prefix, areasName] of [['pt', 'content-pt.tsx', 'Pt', 'AREAS_PT'], ['en', 'content-en.tsx', 'En', 'AREAS_EN']]) {
    const base = lang === 'pt' ? '/docs' : '/docs/en';
    const areas = shell.slice(shell.indexOf(`export const ${areasName}`), shell.indexOf('];', shell.indexOf(`export const ${areasName}`)));
    for (const m of areas.matchAll(/\{ slug: '([^']*)', label: '([^']+)', desc: '([^']+)' \}/g)) add(lang, 'page', m[2], m[1] ? `${base}/${m[1]}` : base, m[3], lang === 'pt' ? PT_ALIASES[m[1]] ?? '' : '');

    const src = read(file);
    const fns = [...src.matchAll(new RegExp(`export function ${prefix}(\\w+)\\(`, 'g'))];
    fns.forEach((f, i) => {
      const slug = SLUG[f[1]];
      if (!slug) return;
      const body = src.slice(f.index, i + 1 < fns.length ? fns[i + 1].index : src.length);
      const href = `${base}/${slug}`;
      for (const h of body.matchAll(/<H[23] id="([^"]+)">([\s\S]*?)<\/H[23]>/g)) add(lang, 'section', plain(h[2].replace(/<Badge[^>]*\/>|<Badge[\s\S]*?<\/Badge>/g, '')), `${href}#${h[1]}`, '', lang === 'pt' ? PT_SECTION_ALIASES[h[1]] ?? '' : '');
      // Steps and test scenarios are sections too: "Verify the signature before parsing" is what a reader searches for.
      for (const c of body.matchAll(/<StepCard[^>]*?\bid="([^"]+)"\s+title="([^"]+)"/g)) add(lang, 'section', c[2], `${href}#${c[1]}`);
      for (const c of body.matchAll(/<RecipeCard[^>]*?r=\{\{\s*id: '([^']+)', title: '([^']+)'/g)) add(lang, 'section', c[2], `${href}#${c[1]}`);
      // SDK methods in this page's text and in the samples it renders.
      const samples = [...body.matchAll(/raw=\{(SAMPLE_[A-Z0-9_]+)\}/g)].map((x) => {
        const d = new RegExp(`const ${x[1]}\\s*=\\s*\`((?:\\\\\`|[^\`])*)\``).exec(src);
        return d ? d[1] : '';
      }).join('\n');
      for (const m of `${body}\n${samples}`.matchAll(/\b((?:create|get|list|rotate|resolve)[A-Z]\w+|constructEvent|paymentSessionInterface)\(/g)) add(lang, 'method', m[1], href);
    });

    for (const e of reference.matchAll(/id: '(ref-[^']+)',\s*method: '(GET|POST|DELETE)',\s*path: '([^']+)'/g)) add(lang, 'endpoint', `${e[2]} ${e[3]}`, `${base}/reference#${e[1]}`);
    for (const e of catalogue.errors) add(lang, 'error', e.code, `${base}/errors#error-${e.code}`, e.meaning[lang]);
    for (const m of errorsTsx.matchAll(/status: '(\d{3}|5xx)', meaning: \{ pt: '((?:[^'\\]|\\.)+)', en: '((?:[^'\\]|\\.)+)' \}/g)) {
      add(lang, 'error', `HTTP ${m[1]}`, `${base}/errors#http-${m[1]}`, lang === 'pt' ? m[2] : m[3]);
    }
    for (const m of events.matchAll(/name: '([a-z_]+\.[a-z]+)',[\s\S]*?when: \{\s*pt: '((?:[^'\\]|\\.)+)',\s*en: '((?:[^'\\]|\\.)+)'/g)) {
      add(lang, 'event', m[1], `${base}/events#event-${m[1].replace('.', '-')}`, lang === 'pt' ? m[2] : m[3]);
    }
    for (const m of symptoms.matchAll(/id: '([a-z0-9-]+)',\s*symptom: \{ pt: '((?:[^'\\]|\\.)+)', en: '((?:[^'\\]|\\.)+)' \}/g)) {
      add(lang, 'section', lang === 'pt' ? m[2] : m[3], `${base}/troubleshooting#${m[1]}`);
    }
  }
  const glossary = read('glossary.ts');
  const TERM_ALIASES = { 'api-key': 'api key', 'chave-secreta': 'secret key', 'chave-publicavel': 'publishable key', 'configuracao-financeira': 'financial setup', 'sessao-pagamento': 'payment session', 'link-pagamento': 'payment link', reembolso: 'refund', comprovativo: 'receipt', liquidacao: 'settlement', 'unidades-menores': 'minor units', idempotencia: 'idempotency', producao: 'live|production' };
  for (const m of glossary.matchAll(/id: '([^']+)',\s*term: '([^']+)',(?:\s*code: true,)?\s*def: '([^']+)'/g)) add('pt', 'term', m[2], `/docs/glossary#glossario-${m[1]}`, m[3], TERM_ALIASES[m[1]] ?? '');
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
