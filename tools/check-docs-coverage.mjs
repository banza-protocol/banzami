#!/usr/bin/env node
/**
 * The DOCS-PROD-001 *_COMPLETE counters, derived — never written down.
 *
 * A counter like DOCS_WEBHOOKS_COMPLETE=PASS used to be a line someone typed in
 * a report. Here it is computed: the spec section names the items (for example
 * "endpoint lifecycle; signing secret; delivery activity; disable/re-enable;
 * rotation; retries; troubleshooting"), the manifest says what the published
 * documentation has to contain for each one, in Portuguese and English, and the
 * counter is PASS only when every item is present in both.
 *
 * It fails three ways, all on purpose:
 *   COVERAGE_UNMAPPED   the spec lists an item the manifest does not map
 *   COVERAGE_INVENTED   the manifest cites text the spec section does not contain
 *   COVERAGE_MISSING    the documentation does not say what an item requires
 *
 *   node tools/check-docs-coverage.mjs              # the source tree
 *   node tools/check-docs-coverage.mjs --deployed   # developers.banzami.com
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COVERAGE } from './docs/coverage-manifest.mjs';

const ROOT = process.env.BZ_DOCS_ROOT ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DEPLOYED = process.argv.includes('--deployed');
const DOCS_URL = process.env.BZ_DOCS ?? 'https://developers.banzami.com';
const spec = readFileSync(join(ROOT, 'docs/quality/DOCS_PROD_001_SPEC.md'), 'utf8');

const section = (n) => {
  const a = spec.indexOf(`\n## ${n}. `);
  return a < 0 ? '' : spec.slice(a, spec.indexOf('\n## ', a + 5));
};
const oneLine = (t) => t.replace(/\n(?!\n)/g, ' ').replace(/[ ]+/g, ' ');

/** The items a spec section enumerates, as the spec writes them. */
function specItems(n, heading) {
  const t = oneLine(section(n));
  const out = new Set();
  if (heading) {
    const m = new RegExp(`${heading.replace(/[/]/g, '\\/')} — ([^.]+)\\.`).exec(t);
    if (m) for (const x of m[1].split(/;\s*/)) out.add(x.trim());
    return out;
  }
  for (const m of t.matchAll(/(?:Explain clearly|Explain|Cover|Document(?: exactly| states)?|Document):\s*([^.]+)\./g)) {
    for (const x of m[1].split(/;\s*/)) if (!/`/.test(x)) out.add(x.trim());
  }
  return out;
}

async function corpus() {
  if (DEPLOYED) {
    const routes = ['/docs', '/docs/get-started', '/docs/console', '/docs/guides', '/docs/reference', '/docs/sdk', '/docs/testing', '/docs/trust', '/docs/doa', '/docs/glossary', '/docs/changelog', '/docs/artifacts'];
    const get = async (p) => (await fetch(DOCS_URL + p)).text();
    const pt = (await Promise.all(routes.map(get))).join('\n');
    const en = (await Promise.all(routes.map((r) => get(r.replace('/docs', '/docs/en'))))).join('\n');
    // The rendered HTML carries entities and tags where the source has JSX; the
    // manifest patterns are written against the source, so normalise the few
    // that differ.
    const norm = (h) => h.replace(/<!-- -->/g, '').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    return { pt: norm(pt), en: norm(en) };
  }
  const dir = join(ROOT, 'apps/website/app/developers/docs');
  const read = (f) => readFileSync(join(dir, f), 'utf8');
  const shared = ['reference.tsx', 'ErrorCatalogue.tsx', 'CapabilityCards.tsx'].map(read).join('\n');
  return { pt: `${read('content-pt.tsx')}\n${shared}`, en: `${read('content-en.tsx')}\n${shared}` };
}

const raw = await corpus();
// Judged on the text a reader sees: tags gone, JSX spacers and entities
// resolved, whitespace collapsed — so a line break or a <strong> in the source
// can neither hide an item nor fake one.
const plain = (s) => s.replace(/raw=\{`([\s\S]*?)`\}/g, (_, code) => `>${code.replace(/[<>]/g, ' ')}<`).replace(/\{' '\}/g, ' ').replace(/<[^>]+>/g, '').replace(/&rsquo;/g, '’').replace(/&apos;|&#39;/g, "'").replace(/\s+/g, ' ');
const pt = plain(raw.pt);
const en = plain(raw.en);
let failures = 0;
const results = {};
console.log(`DOCS-PROD-001 coverage — ${DEPLOYED ? DOCS_URL : 'source tree'}\n`);

for (const [counter, def] of Object.entries(COVERAGE)) {
  const sec = oneLine(section(def.section));
  const problems = [];
  const mapped = new Set(def.items.map((i) => i.spec.replace(/\n/g, ' ')));
  // Every item the spec enumerates for this heading must be mapped.
  for (const item of specItems(def.section, def.heading)) {
    if (counter === 'DOCS_CONSOLE_COMPLETE' || def.heading) {
      if (!mapped.has(item)) problems.push(`UNMAPPED: the spec lists "${item}"`);
    } else if (!mapped.has(item) && def.items.some((i) => specItems(def.section, null).has(i.spec))) {
      problems.push(`UNMAPPED: the spec lists "${item}"`);
    }
  }
  for (const item of def.items) {
    const phrase = item.spec.replace(/\n/g, ' ');
    if (!sec.includes(phrase)) problems.push(`INVENTED: §${def.section} does not contain "${phrase}"`);
    const inPt = item.pt.test(pt);
    const inEn = item.en.test(en);
    if (!inPt || !inEn) problems.push(`MISSING: "${phrase}" — ${!inPt ? 'PT' : ''}${!inPt && !inEn ? ' + ' : ''}${!inEn ? 'EN' : ''} does not say ${!inPt ? item.pt : item.en}`);
  }
  results[counter] = { problems, items: def.items.length };
}
for (const [counter, def] of Object.entries(COVERAGE)) {
  const own = results[counter].problems;
  const inherited = (def.includes ?? []).filter((c) => results[c].problems.length > 0);
  const pass = own.length === 0 && inherited.length === 0;
  if (!pass) failures += 1;
  console.log(`  ${pass ? '✓' : '✗'} ${counter} — ${results[counter].items} item(s)${def.includes ? ` + ${def.includes.length} included counter(s)` : ''}`);
  for (const p of own) console.error(`      ${p}`);
  for (const c of inherited) console.error(`      INCLUDED: ${c} is not complete`);
  results[counter].verdict = pass ? 'PASS' : 'FAIL';
}

console.log('');
for (const [counter, r] of Object.entries(results)) console.log(`${counter}=${r.verdict}`);
const total = Object.values(results).reduce((n, r) => n + r.problems.length, 0);
console.log(`DOCS_COVERAGE_PROBLEMS=${total}`);
if (failures) { console.error(`\n✗ ${failures} coverage counter(s) are not complete`); process.exit(1); }
console.log('\n✓ every *_COMPLETE counter is derived from the spec and satisfied in both languages');
