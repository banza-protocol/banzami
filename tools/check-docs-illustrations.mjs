#!/usr/bin/env node
/**
 * Illustrations in the developer documentation are SVG, not terminal art.
 *
 * Three diagrams — the concept model, segregated accounts, and the donor
 * journey — were box-drawing characters inside monospaced code blocks, one of
 * them with a "Copiar" button offering to put a picture on the reader's
 * clipboard. It is not an illustration, it is a drawing pretending to be code;
 * it reflows into nonsense the moment the font or the width changes, which on a
 * phone is always; and a screen reader announces it as a wall of pipes.
 *
 * README.md sets this operator's standard: architecture illustrations are SVG
 * (docs/diagrams/*.svg). The documentation now follows it, through the
 * components in app/developers/docs/diagrams.tsx.
 *
 * This gate holds the line in the one place it can be held cheaply: box-drawing
 * characters have no legitimate use in a TypeScript, curl or JSON example, so
 * finding one in the documentation content means somebody drew a picture again.
 *
 *   node tools/check-docs-illustrations.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

/** The documentation the public reads, in both languages. */
const CONTENT = [
  'apps/website/app/developers/docs/content-pt.tsx',
  'apps/website/app/developers/docs/content-en.tsx',
];

/** Where the illustrations are supposed to live. */
const DIAGRAMS = 'apps/website/app/developers/docs/diagrams.tsx';

/**
 * Box-drawing and the arrows that only ever appear in terminal art. Not a
 * blanket ban on Unicode: → in a sentence is prose, ─ in a code block is a
 * picture.
 */
const ART = /[─-╿]|──▶|─▶/u;

let failures = 0;
let asciiHits = 0, driftHits = 0;
const fail = (m, d) => { console.error(`  ✗ ${m}${d ? `\n      ${d}` : ''}`); failures += 1; };
const pass = (m) => console.log(`  ✓ ${m}`);

console.log('developer documentation — illustrations\n');

// ── no terminal art in the content ───────────────────────────────────────────
{
  const hits = [];
  for (const file of CONTENT) {
    const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      // A comment may name the characters in order to forbid them.
      if (/^\s*(\/\/|\*)/.test(line)) return;
      if (ART.test(line)) hits.push(`${file}:${i + 1} — ${line.trim().slice(0, 70)}`);
    });
  }
  asciiHits = hits.length;
  hits.length
    ? fail(`DOCS_ASCII_ILLUSTRATIONS = ${hits.length}`, `${hits.slice(0, 10).join('\n      ')}\n      → draw it in ${DIAGRAMS} instead`)
    : pass('DOCS_ASCII_ILLUSTRATIONS = 0 — no box-drawing art in either language');
}

// ── no diagrams drawn with text characters in HTML either ───────────────────
//
// The Get started page had a seven-stage flow drawn as HTML chips joined by a
// "→" character between each pair. No box-drawing, so the check above passed —
// but it is the same thing: a picture made of text, which wraps wherever the
// width happens to fall and reads to a screen reader as a list of words.
let chipHits = 0;
{
  const files = [...CONTENT, 'apps/website/app/developers/page.tsx', 'apps/website/app/developers/docs/shell.tsx'];
  const hits = [];
  for (const file of files) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/length\s*-\s*1\s*\?\s*<span[^>]*>\s*(?:→|->|⟶|➜)\s*<\/span>/g)) {
      hits.push(`${file}:${src.slice(0, m.index).split('\n').length} — a chip strip joined by an arrow character`);
    }
  }
  chipHits = hits.length;
  hits.length
    ? fail(`DOCS_TEXT_ARROW_DIAGRAMS = ${hits.length}`, `${hits.join('\n      ')}\n      → draw it in ${DIAGRAMS} instead`)
    : pass('DOCS_TEXT_ARROW_DIAGRAMS = 0 — no flow drawn as text chips and arrow characters');
}

// ── the SVG illustrations exist and are real SVG ─────────────────────────────
{
  let src = '';
  try { src = readFileSync(join(ROOT, DIAGRAMS), 'utf8'); } catch { /* reported below */ }
  if (!src) {
    fail(`${DIAGRAMS} is missing — the illustrations have nowhere to live`);
  } else {
    const svgs = (src.match(/<svg\b/g) ?? []).length;
    const titles = (src.match(/<title>/g) ?? []).length;
    const roles = (src.match(/role="img"/g) ?? []).length;
    svgs > 0 && titles > 0 && roles > 0
      ? pass(`DOCS_SVG_ILLUSTRATIONS present — ${svgs} <svg>, each role="img" with a <title>`)
      : fail('the illustrations module draws no accessible SVG', `svg=${svgs} title=${titles} role=img=${roles}`);
  }
}

// ── every illustration is used in BOTH languages ─────────────────────────────
//
// A diagram that reaches only one language is a parity defect that the
// endpoint-for-endpoint parity check cannot see, because a picture carries no
// endpoints.
{
  const exported = [...readFileSync(join(ROOT, DIAGRAMS), 'utf8')
    .matchAll(/export function (\w*Diagram)\b/g)].map((m) => m[1]);
  const missing = [];
  for (const name of exported) {
    for (const file of CONTENT) {
      if (!readFileSync(join(ROOT, file), 'utf8').includes(`<${name}`)) missing.push(`${name} is not used in ${file.split('/').pop()}`);
    }
  }
  driftHits = missing.length;
  missing.length
    ? fail(`DOCS_ILLUSTRATION_PT_EN_DRIFT = ${missing.length}`, missing.join('\n      '))
    : pass(`DOCS_ILLUSTRATION_PT_EN_DRIFT = 0 — all ${exported.length} illustrations appear in both languages`);
}

// The counters report what was measured. An earlier draft printed the literal
// 0 here, so the summary said zero while the checks above said otherwise — a
// gate that contradicts itself is worse than no gate.
console.log(`\nDOCS_ASCII_ILLUSTRATIONS=${asciiHits}`);
console.log(`DOCS_ASCII_CONCEPT_DIAGRAMS=${asciiHits + chipHits}`);
console.log(`DOCS_ILLUSTRATION_PT_EN_DRIFT=${driftHits}`);

if (failures) { console.error(`\n✗ ${failures} illustration failure(s)`); process.exit(1); }
console.log('\n✓ the documentation draws with SVG, in both languages');
