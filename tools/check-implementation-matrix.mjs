#!/usr/bin/env node
/**
 * The implementation matrix, against the tree it describes.
 *
 * Four items were VALIDATED on evidence that pointed into apps/dashboard, an
 * application that had been deleted. That is the worst state an item can be in:
 * it still reads VALIDATED, and nothing behind it can be opened. Nobody noticed
 * because nothing had ever checked that an evidence reference resolves.
 *
 * The first version of this gate found the same problem in twenty more places
 * and REPORTED them, on the reasoning that failing on somebody else's mess makes
 * a gate unrunnable. That reasoning was wrong in a specific way: a finding that
 * is printed and not enforced is a finding that survives every future run. The
 * gate now FAILS on all of it, and the twenty were resolved rather than muted.
 *
 * What it holds:
 *
 *   · no item names a RETIRED SURFACE as current evidence. Prose that says a
 *     surface was retired is the record of the retirement, not a claim that it
 *     exists, so only evidence refs and revalidation globs are read;
 *   · every evidence reference SHAPED LIKE A REPOSITORY PATH resolves — for
 *     every item, retired ones included. Most evidence here is narrative (an SQL
 *     result, a latency figure, a cross-repo spec, a live URL) and a checker
 *     that treated prose as a path reported 139 dead references on its first
 *     run, none of them real. Only what claims to be a path is checked as one;
 *   · every item has at least one evidence reference. An item with none asserts
 *     a status on nothing;
 *   · a VALIDATED item declares no gap and carries no blocking issue. Those two
 *     are the item telling you, in its own words, that it is not what its status
 *     says;
 *   · a RETIRED item carries retirement evidence — something that records the
 *     withdrawal, not merely something that still opens. Otherwise RETIRED
 *     becomes the bin every awkward item gets swept into;
 *   · every status is one the matrix actually uses.
 *
 * Every one of these is FAIL, not a note. The only thing this file prints
 * without failing is the count of what passed.
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

const refsOf = (it) => (it.evidence ?? []).map((e) => (typeof e === 'string' ? e : e.ref)).filter(Boolean);
const isRetired = (it) => it.status === 'RETIRED';

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

// ── every path-shaped reference resolves, in every item ──────────────────────
//
// Retired items included. A retired item still has to say WHY it was retired,
// and evidence that cannot be opened says nothing at all.
{
  const dead = [];
  let checked = 0, narrative = 0;
  for (const it of MATRIX.items) {
    for (const ref of refsOf(it)) {
      if (!looksLikePath(ref)) { narrative += 1; continue; }
      checked += 1;
      if (!resolves(ref)) dead.push(`${it.id} (${it.status}) → ${ref}`);
    }
  }
  dead.length
    ? fail(`IMPLEMENTATION_MATRIX_DEAD_EVIDENCE_REFERENCES = ${dead.length} in ${new Set(dead.map((d) => d.split(' ')[0])).size} item(s)`, dead.join('\n      '))
    : pass(`IMPLEMENTATION_MATRIX_DEAD_EVIDENCE_REFERENCES = 0 (${checked} path references resolved; ${narrative} narrative references not treated as paths)`);
}

// ── every item cites something ───────────────────────────────────────────────
{
  const empty = MATRIX.items.filter((it) => refsOf(it).length === 0).map((it) => `${it.id} (${it.status}): no evidence at all`);
  empty.length
    ? fail(`IMPLEMENTATION_MATRIX_MISSING_EVIDENCE = ${empty.length}`, empty.join('\n      '))
    : pass(`IMPLEMENTATION_MATRIX_MISSING_EVIDENCE = 0 — every item cites at least one thing`);
}

// ── a VALIDATED item declares no gap and no blocker ──────────────────────────
//
// These were two separate findings and are one rule: an item whose own fields
// say "this is not done" while its status says VALIDATED is lying in the only
// field anybody reads.
{
  const gapped = [], blocked = [];
  for (const it of MATRIX.items) {
    if (it.status !== 'VALIDATED') continue;
    const gaps = (it.evidence ?? []).filter((e) => typeof e === 'object' && e.type === 'gap');
    if (gaps.length) gapped.push(`${it.id}: VALIDATED while declaring a gap — ${gaps.map((g) => g.label).join(', ')}`);
    for (const b of it.blockingIssues ?? []) blocked.push(`${it.id}: ${String(b).slice(0, 140)}`);
  }
  gapped.length
    ? fail(`IMPLEMENTATION_MATRIX_VALIDATED_WITH_UNMET_CRITERION = ${gapped.length}`, gapped.join('\n      '))
    : pass('IMPLEMENTATION_MATRIX_VALIDATED_WITH_UNMET_CRITERION = 0 — no VALIDATED item declares a gap of its own');
  blocked.length
    ? fail(`IMPLEMENTATION_MATRIX_VALIDATED_WITH_BLOCKERS = ${blocked.length}`, blocked.join('\n      '))
    : pass('IMPLEMENTATION_MATRIX_VALIDATED_WITH_BLOCKERS = 0 — no VALIDATED item carries a blocking issue');
}

// ── a RETIRED item says why it was retired ───────────────────────────────────
//
// Not merely "has evidence that opens". A retirement has a record — the repair
// log entry, the superseding decision, the test that keeps the route unmounted,
// the history entry that moved it — and without one, RETIRED is just a status
// somebody typed. This is the rule that stops RETIRED becoming the place
// awkward items go to stop being counted.
{
  const RETIREMENT = /retir|withdraw|supersed|removed|replaced|gone|410|unmounted|RA-\d+|SEC-\d+|decommission/i;
  const thin = [];
  for (const it of MATRIX.items) {
    if (!isRetired(it)) continue;
    const says = (it.evidence ?? []).some((e) => {
      const text = typeof e === 'string' ? e : `${e.type ?? ''} ${e.label ?? ''} ${e.ref ?? ''}`;
      return RETIREMENT.test(text);
    }) || RETIREMENT.test(String(it.requirement ?? ''));
    if (!says) thin.push(`${it.id}: RETIRED with no evidence of the retirement itself`);
  }
  thin.length
    ? fail(`IMPLEMENTATION_MATRIX_RETIRED_WITHOUT_RETIREMENT_EVIDENCE = ${thin.length}`, thin.join('\n      '))
    : pass(`IMPLEMENTATION_MATRIX_RETIRED_WITHOUT_RETIREMENT_EVIDENCE = 0 (${MATRIX.items.filter(isRetired).length} retired item(s), each recording its own withdrawal)`);
}

// ── every status is one the matrix uses ──────────────────────────────────────
{
  const odd = MATRIX.items.filter((i) => !VALID_STATUS.includes(i.status)).map((i) => `${i.id}: ${i.status ?? '(none)'}`);
  odd.length
    ? fail(`IMPLEMENTATION_MATRIX_UNRESOLVED_ITEMS = ${odd.length}`, odd.join('\n      '))
    : pass(`IMPLEMENTATION_MATRIX_UNRESOLVED_ITEMS = 0 (${[...new Set(MATRIX.items.map((i) => i.status))].sort().join(', ')})`);
}

// ── the gates, named ─────────────────────────────────────────────────────────
console.log('');
console.log('MATRIX_DEAD_EVIDENCE_GATE=FAIL_CLOSED');
console.log('MATRIX_MISSING_EVIDENCE_GATE=FAIL_CLOSED');
console.log('MATRIX_VALIDATED_WITH_BLOCKERS_GATE=FAIL_CLOSED');
console.log('MATRIX_VALIDATED_WITH_UNMET_CRITERION_GATE=FAIL_CLOSED');
console.log('MATRIX_RETIRED_EVIDENCE_GATE=FAIL_CLOSED');
console.log('MATRIX_STATUS_ENUM_GATE=FAIL_CLOSED');

if (failures) { console.error(`\n✗ ${failures} matrix failure(s)`); process.exit(1); }
console.log('\n✓ every item cites something that can still be opened and checked');
