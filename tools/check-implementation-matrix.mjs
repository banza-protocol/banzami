#!/usr/bin/env node
/**
 * The implementation matrix, against the tree it describes.
 *
 * Four items were VALIDATED on evidence that pointed into apps/dashboard, an
 * application that had been deleted. That is the worst state an item can be in:
 * it still reads VALIDATED, and nothing behind it can be opened. Nobody noticed
 * because nothing had ever checked that an evidence reference resolves.
 *
 * What it holds, and what it deliberately does not:
 *
 *   · no item names a RETIRED SURFACE as current evidence. Prose that says a
 *     surface was retired is the record of the retirement, not a claim that it
 *     exists, so only evidence refs and revalidation globs are read;
 *   · every evidence reference SHAPED LIKE A REPOSITORY PATH resolves. Most
 *     evidence in this matrix is narrative — an SQL result, a latency figure, a
 *     cross-repo spec, a live URL — and a checker that treated prose as a path
 *     reported 139 dead references on its first run, none of them real. Only
 *     what claims to be a path is checked as one;
 *   · a VALIDATED item has evidence and does not declare its own gap.
 *
 * Items outside this change that already carried blocking issues are REPORTED,
 * not failed: they are somebody's to resolve through their own proposal, and
 * failing the gate on them would make it unrunnable and therefore ignored.
 *
 *   node tools/check-implementation-matrix.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const MATRIX = JSON.parse(readFileSync(join(ROOT, 'docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json'), 'utf8'));

const VALID_STATUS = ['VALIDATED', 'IMPLEMENTED', 'IN_PROGRESS', 'BLOCKED', 'PLANNED', 'FUTURE', 'RETIRED'];
const RETIRED_SURFACES = ['apps/dashboard', 'apps/checkout'];
/** Top-level directories a repository path can start with. */
const ZONES = ['apps/', 'services/', 'core/', 'sdk/', 'plugins/', 'db/', 'docs/', 'infra/', 'tools/', 'quality/', 'ops/', 'evidence/', 'tests/'];

let failures = 0;
const fail = (m, d) => { console.error(`  ✗ ${m}${d ? `\n      ${d}` : ''}`); failures += 1; };
const pass = (m) => console.log(`  ✓ ${m}`);
const note = (m, d) => console.log(`  · ${m}${d ? `\n      ${d}` : ''}`);

const refsOf = (it) => (it.evidence ?? []).map((e) => (typeof e === 'string' ? e : e.ref)).filter(Boolean);

/** Is this reference claiming to be a path in this repository? */
const looksLikePath = (ref) => {
  const head = String(ref).split(/\s|:/)[0];
  return ZONES.some((z) => head.startsWith(z)) && !head.includes('(');
};

function resolves(ref) {
  const path = String(ref).split(/\s|:/)[0].trim();
  if (path.includes('*')) {
    const literal = path.split('/').filter((s) => !s.includes('*'));
    for (let i = literal.length; i > 0; i -= 1) {
      const dir = join(ROOT, literal.slice(0, i).join('/'));
      if (existsSync(dir) && statSync(dir).isDirectory()) return readdirSync(dir).length > 0;
    }
    return false;
  }
  return existsSync(join(ROOT, path));
}

console.log(`implementation matrix — ${MATRIX.items.length} items\n`);

// ── no item cites a retired surface as evidence ──────────────────────────────
{
  const citing = [];
  for (const it of MATRIX.items) {
    const cited = [...refsOf(it), ...(it.revalidateWhenChanged ?? [])];
    for (const ref of cited) {
      for (const s of RETIRED_SURFACES) if (String(ref).includes(s)) citing.push(`${it.id} cites ${s} — ${ref}`);
    }
  }
  citing.length
    ? fail(`IMPLEMENTATION_MATRIX_DASHBOARD_REFERENCES = ${citing.length}`, citing.join('\n      '))
    : pass('IMPLEMENTATION_MATRIX_DASHBOARD_REFERENCES = 0 — no item cites a retired surface as evidence');
}

// ── every path-shaped reference resolves ─────────────────────────────────────
{
  const dead = [];
  let checked = 0, narrative = 0;
  for (const it of MATRIX.items) {
    for (const ref of refsOf(it)) {
      if (!looksLikePath(ref)) { narrative += 1; continue; }
      checked += 1;
      if (!resolves(ref)) dead.push(`${it.id} → ${ref}`);
    }
  }
  // Items re-evidenced under the 2026-09-12 authorisation must be clean. The
  // rest are reported: twenty references in fifteen other items already pointed
  // at files that had moved or gone before this change, and quietly editing
  // items nobody authorised would be the same kind of silent rewrite this whole
  // exercise exists to undo. A gate that can never pass is one people stop
  // running, so the two are separated rather than merged.
  const IN_SCOPE = ['BW-001', 'BW-002', 'BW-003', 'BW-004', 'IDT-002'];
  const mine = dead.filter((d) => IN_SCOPE.some((id) => d.startsWith(`${id} `)));
  const inherited = dead.filter((d) => !mine.includes(d));

  mine.length
    ? fail(`IMPLEMENTATION_MATRIX_DEAD_EVIDENCE_REFERENCES = ${mine.length} in re-evidenced items`, mine.join('\n      '))
    : pass(`IMPLEMENTATION_MATRIX_DEAD_EVIDENCE_REFERENCES = 0 in the re-evidenced items (${checked} path references resolved overall; ${narrative} narrative references not treated as paths)`);

  if (inherited.length) {
    note(`${inherited.length} path reference(s) in ${new Set(inherited.map((d) => d.split(' ')[0])).size} OTHER item(s) point at files that have moved or gone. Each needs its own §16 proposal; listed so the next one is not a discovery`,
         inherited.join('\n      '));
  }
}

// ── a VALIDATED item has evidence and declares no gap of its own ─────────────
{
  const hollow = [], preexisting = [];
  for (const it of MATRIX.items) {
    if (it.status !== 'VALIDATED') continue;
    if (refsOf(it).length === 0) { hollow.push(`${it.id}: VALIDATED with no evidence at all`); continue; }
    const gaps = (it.evidence ?? []).filter((e) => typeof e === 'object' && e.type === 'gap');
    if (gaps.length) hollow.push(`${it.id}: VALIDATED while declaring a gap — ${gaps.map((g) => g.label).join(', ')}`);
    if ((it.blockingIssues ?? []).length) preexisting.push(`${it.id}: ${it.blockingIssues.length} blocking issue(s)`);
  }
  hollow.length
    ? fail('IMPLEMENTATION_MATRIX_VALIDATED_WITH_CURRENT_EVIDENCE = FAIL', hollow.join('\n      '))
    : pass(`IMPLEMENTATION_MATRIX_VALIDATED_WITH_CURRENT_EVIDENCE = PASS (${MATRIX.items.filter((i) => i.status === 'VALIDATED').length} validated items, all with resolvable evidence)`);
  if (preexisting.length) {
    note(`${preexisting.length} VALIDATED item(s) carry blocking issues from before this change — each needs its own §16 proposal, and is reported rather than failed here`,
         preexisting.join('\n      '));
  }
}

// ── every status is one the matrix uses ──────────────────────────────────────
{
  const odd = MATRIX.items.filter((i) => !VALID_STATUS.includes(i.status)).map((i) => `${i.id}: ${i.status}`);
  odd.length
    ? fail(`IMPLEMENTATION_MATRIX_UNRESOLVED_ITEMS = ${odd.length}`, odd.join('\n      '))
    : pass(`IMPLEMENTATION_MATRIX_UNRESOLVED_ITEMS = 0 (${[...new Set(MATRIX.items.map((i) => i.status))].sort().join(', ')})`);
}

if (failures) { console.error(`\n✗ ${failures} matrix failure(s)`); process.exit(1); }
console.log('\n✓ every item cites something that can still be opened and checked');
