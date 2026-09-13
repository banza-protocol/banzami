#!/usr/bin/env node
/**
 * The DOCS-PROD-001 conformance matrix has exactly the spec's 82 sections, and
 * its totals are counted, not typed.
 *
 *   PASS + NOT_APPLICABLE = 82   is the only green state
 *   DOCS_PROD_001_GAPS           every row that is anything else
 *
 *   node tools/check-docs-prod-001-matrix.mjs
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.BZ_DOCS_ROOT ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const spec = readFileSync(join(ROOT, 'docs/quality/DOCS_PROD_001_SPEC.md'), 'utf8');
const matrix = readFileSync(join(ROOT, 'docs/quality/DOCS_PROD_001_CONFORMANCE.md'), 'utf8');
const sections = [...spec.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => ({ n: Number(m[1]), t: m[2].trim() }));
const rows = [...matrix.matchAll(/^\| (\d+) \| (.+?) \| ([A-Z_]+) \| (.*) \|$/gm)].map((m) => ({ n: Number(m[1]), t: m[2].trim(), v: m[3], e: m[4].trim() }));
const VERDICTS = new Set(['PASS', 'NOT_APPLICABLE', 'PENDING_REVIEW_CEREMONY', 'FAIL']);
const problems = [];

if (sections.length !== 82) problems.push(`the spec has ${sections.length} sections, not 82`);
if (rows.length !== sections.length) problems.push(`the matrix has ${rows.length} rows for ${sections.length} sections`);
sections.forEach((s, i) => {
  const r = rows[i];
  if (!r) return;
  if (r.n !== s.n || r.t !== s.t) problems.push(`row ${i}: "§${r.n} ${r.t}" is not "§${s.n} ${s.t}"`);
  if (!VERDICTS.has(r.v)) problems.push(`§${r.n}: unknown verdict ${r.v}`);
  if (r.e.length < 20) problems.push(`§${r.n}: no evidence`);
  if (r.v === 'NOT_APPLICABLE' && !/because|optional|would|not offered|no /i.test(r.e)) problems.push(`§${r.n}: NOT_APPLICABLE without a reason`);
});
const count = (v) => rows.filter((r) => r.v === v).length;
const pass = count('PASS'), na = count('NOT_APPLICABLE');
const gaps = rows.filter((r) => r.v !== 'PASS' && r.v !== 'NOT_APPLICABLE');

console.log(`DOCS_PROD_001_MATRIX_ROWS=${rows.length}`);
console.log(`DOCS_PROD_001_PASS=${pass}`);
console.log(`DOCS_PROD_001_NOT_APPLICABLE=${na}`);
console.log(`DOCS_PROD_001_PASS_PLUS_NA=${pass + na} (must be 82)`);
console.log(`DOCS_PROD_001_GAPS=${gaps.length}${gaps.length ? ` — ${gaps.map((g) => `§${g.n} ${g.v}`).join(', ')}` : ''}`);
for (const p of problems) console.error(`  ✗ ${p}`);
if (problems.length) process.exit(2);
process.exit(gaps.length === 0 && pass + na === 82 ? 0 : 1);
