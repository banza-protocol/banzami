#!/usr/bin/env node
/**
 * The DOCS-PROD-001 acceptance standard is still whole.
 *
 * The standard lived only in a conversation. When that conversation was
 * compacted, the standard went with it — and a conformance run that could
 * otherwise have been finished had to stop and ask for it back, because the
 * alternative was to reconstruct 82 sections from memory and then grade the
 * product against the reconstruction. That is not an audit; it is an author
 * marking their own paper.
 *
 * So the specification is now a file, and this holds the file's shape:
 *
 *   · sections 0 through 81, all present;
 *   · none duplicated;
 *   · none renumbered into a gap.
 *
 * It deliberately checks STRUCTURE, not wording. Wording is the owner's; a gate
 * that pinned every sentence would make the standard unable to be corrected by
 * the only person entitled to correct it. What it prevents is the quiet kind of
 * loss: a section deleted because it was inconvenient, or two sections merged
 * under one number so the count still looks right.
 *
 *   node tools/check-docs-prod-001-spec.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SPEC = 'docs/quality/DOCS_PROD_001_SPEC.md';
const EXPECTED = 82; // 0 … 81

let src;
try {
  src = readFileSync(join(ROOT, SPEC), 'utf8');
} catch {
  console.error(`✗ ${SPEC} is missing — the acceptance standard has no home.`);
  console.error('  It must be recovered from the owner, not reconstructed.');
  process.exit(1);
}

/** `## 12. TITLE` — a numbered section heading, and nothing else. */
const headings = [...src.matchAll(/^## (\d{1,2})\.\s+(.+)$/gm)].map((m) => ({
  n: Number(m[1]),
  title: m[2].trim(),
}));

let failures = 0;
const fail = (m, d) => { console.error(`  ✗ ${m}${d ? `\n      ${d}` : ''}`); failures += 1; };
const pass = (m) => console.log(`  ✓ ${m}`);

console.log(`DOCS-PROD-001 specification — ${SPEC}\n`);

const seen = new Map();
for (const h of headings) seen.set(h.n, (seen.get(h.n) ?? 0) + 1);

// ── every section 0–81 is present ────────────────────────────────────────────
{
  const missing = [];
  for (let n = 0; n < EXPECTED; n += 1) if (!seen.has(n)) missing.push(n);
  missing.length
    ? fail(`DOCS_PROD_001_SPEC_MISSING_SECTIONS = ${missing.length}`, `absent: ${missing.join(', ')}`)
    : pass('DOCS_PROD_001_SPEC_MISSING_SECTIONS = 0');
}

// ── no number appears twice ──────────────────────────────────────────────────
{
  const dupes = [...seen.entries()].filter(([, c]) => c > 1).map(([n, c]) => `${n} (×${c})`);
  dupes.length
    ? fail(`DOCS_PROD_001_SPEC_DUPLICATE_SECTIONS = ${dupes.length}`, dupes.join(', '))
    : pass('DOCS_PROD_001_SPEC_DUPLICATE_SECTIONS = 0');
}

// ── nothing outside the range crept in ───────────────────────────────────────
{
  const stray = headings.filter((h) => h.n >= EXPECTED).map((h) => `${h.n}. ${h.title}`);
  stray.length
    ? fail(`${stray.length} section(s) numbered beyond 81`, stray.join('\n      '))
    : pass(`DOCS_PROD_001_SPEC_SECTIONS = ${seen.size}`);
}

// ── every section says something ─────────────────────────────────────────────
//
// A heading with no body under it is a section that was deleted without being
// removed, which is the failure this file exists to make visible.
{
  const empty = [];
  for (const h of headings) {
    const start = src.indexOf(`## ${h.n}. ${h.title}`);
    const next = src.indexOf('\n## ', start + 1);
    const body = src.slice(start, next === -1 ? undefined : next).split('\n').slice(1).join('\n').trim();
    if (body.length < 40) empty.push(`${h.n}. ${h.title} (${body.length} chars)`);
  }
  empty.length
    ? fail(`${empty.length} section(s) have no requirement text`, empty.join('\n      '))
    : pass(`every section carries its requirement text`);
}

console.log(`\nDOCS_PROD_001_SPEC_SECTIONS=${seen.size}`);
console.log(`DOCS_PROD_001_SPEC_MISSING_SECTIONS=${(() => { let m = 0; for (let n = 0; n < EXPECTED; n += 1) if (!seen.has(n)) m += 1; return m; })()}`);
console.log(`DOCS_PROD_001_SPEC_DUPLICATE_SECTIONS=${[...seen.values()].filter((c) => c > 1).length}`);

if (failures) { console.error(`\n✗ the acceptance standard is not intact`); process.exit(1); }
console.log('\n✓ sections 0–81, each present once, each with its requirement');
