#!/usr/bin/env node
/**
 * The Portuguese and English documentation have the same shape, page by page.
 *
 * Endpoint parity said the two languages agreed, and they did — about
 * endpoints. Meanwhile English Guides had no "Where the money lands" section at
 * all, English Get started had no capability cards, no DOA summary and no
 * account of what a key prefix means, English webhooks never said rotation is
 * immediate, and Portuguese webhooks never said to verify before parsing. Each
 * was a paragraph a reader in one language got and a reader in the other did
 * not. A picture had wandered from Guides to the DOA page in one language only.
 *
 * So this compares each page function (PtGuides ↔ EnGuides, …) element by
 * element: headings, code blocks, tables, callouts, list items, paragraphs and
 * every illustration by name, in order. A count that differs is a section that
 * exists in one language only; the aligned diff says where.
 *
 *   node tools/check-docs-pt-en-structure.mjs
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.BZ_DOCS_ROOT ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIR = 'apps/website/app/developers/docs';

const split = (src, prefix) => {
  const out = {};
  const ms = [...src.matchAll(new RegExp(`export function ${prefix}(\\w+)\\(`, 'g'))];
  ms.forEach((m, i) => { out[m[1]] = src.slice(m.index, i + 1 < ms.length ? ms[i + 1].index : src.length); });
  return out;
};
const pt = split(readFileSync(join(ROOT, DIR, 'content-pt.tsx'), 'utf8'), 'Pt');
const en = split(readFileSync(join(ROOT, DIR, 'content-en.tsx'), 'utf8'), 'En');

const TAGS = /<(H2|H3|CodeBlock|table|Callout|LI|P|UL|ol|CapabilityCards|ErrorCatalogue|ResourceReference|\w+Diagram)[\s>/]/g;
const tokens = (s) => [...s.matchAll(TAGS)].map((m) => ({ t: m[1], at: s.slice(m.index, m.index + 90).replace(/\s+/g, ' ') }));

/** Aligned difference by longest common subsequence of element kinds. */
function diff(a, b) {
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) L[i][j] = a[i].t === b[j].t ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i].t === b[j].t) { i += 1; j += 1; } else if (L[i + 1][j] >= L[i][j + 1]) { out.push(`PT only: ${a[i].at}`); i += 1; } else { out.push(`EN only: ${b[j].at}`); j += 1; }
  }
  while (i < n) out.push(`PT only: ${a[i++].at}`);
  while (j < m) out.push(`EN only: ${b[j++].at}`);
  return out;
}

console.log('developer documentation — Portuguese and English, page by page\n');
let drift = 0;
const pages = [...new Set([...Object.keys(pt), ...Object.keys(en)])];
for (const p of pages) {
  if (!pt[p] || !en[p]) { console.error(`  ✗ ${p} exists only in ${pt[p] ? 'Portuguese' : 'English'}`); drift += 1; continue; }
  const d = diff(tokens(pt[p]), tokens(en[p]));
  if (d.length) {
    drift += d.length;
    console.error(`  ✗ ${p}: ${d.length} element(s) in one language only`);
    for (const x of d.slice(0, 12)) console.error(`      ${x}`);
  } else {
    console.log(`  ✓ ${p} — ${tokens(pt[p]).length} elements, same order in both`);
  }
}

// Illustrations specifically: the same diagrams, on the same page.
let diagramDrift = 0;
for (const p of pages) {
  const names = (s) => [...(s ?? '').matchAll(/<(\w+Diagram)\b/g)].map((m) => m[1]).join(',');
  if (names(pt[p]) !== names(en[p])) { diagramDrift += 1; console.error(`  ✗ ${p}: diagrams PT [${names(pt[p])}] ≠ EN [${names(en[p])}]`); }
}

console.log(`\nDOCS_PT_EN_PAGES=${pages.length}`);
console.log(`DOCS_PT_EN_STRUCTURE_DRIFT=${drift}`);
console.log(`DOCS_DIAGRAM_PT_EN_PARITY=${diagramDrift === 0 ? 'PASS' : 'FAIL'}`);
if (drift || diagramDrift) { console.error('\n✗ the two languages do not have the same documentation'); process.exit(1); }
console.log('\n✓ every page has the same sections, examples and illustrations in both languages');
