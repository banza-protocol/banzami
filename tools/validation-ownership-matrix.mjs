#!/usr/bin/env node
/**
 * validation-ownership-matrix — can every funding-capable journey be held to
 * its declaration?
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase B3).
 *
 * Three questions, answered separately, because collapsing them is how this
 * programme kept reporting progress it did not have:
 *
 *   1. OWNERSHIP REACHABLE   does what the journey creates reach the runner?
 *   2. CLASSIFICATION        is every kind it can own classified FINANCIAL or
 *                            STRUCTURAL — never UNKNOWN?
 *   3. RESOLUTION            can each FINANCIAL kind be mapped to an
 *                            authoritative account?
 *
 * BZV-20260920-0001 would have answered "yes" to none of them and reported
 * 17 VERIFIED journeys anyway, because nothing asked.
 *
 * Static by design: it reads the code that will run, not a run. A matrix that
 * needs a FULL to compute is a matrix that cannot gate one.
 *
 *   node tools/validation-ownership-matrix.mjs [--json]
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { RESOURCE_SCOPE, scopeOf } = await import(join(ROOT, 'tools/lib/validation-resource-scope.mjs'));

/* ── the registry ────────────────────────────────────────────────────────── */

const journeys = JSON.parse(execFileSync('python3', ['-c',
  'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
  join(ROOT, 'quality/validation/journeys.yaml')], { encoding: 'utf8', maxBuffer: 1 << 24 })).journeys ?? [];

/* ── what each harness can actually own ──────────────────────────────────── */

// Ownership is REGISTERED, so the closure is scanned for registrations rather
// than for creation verbs. This is the difference between "this file mentions
// a consumer" and "this code hands a consumer over", and only the second is
// ownership. The `derivedFloor` mistake was the first one wearing the second's
// clothes.
const OWN_CALL = /\bownCreated\(\s*['"]([a-z_]+)['"]/g;
const OWN_SHELL = /\be2e_own\s+([a-z_]+)/g;
const OWN_EXPLICIT = /\be2eOwn\(\s*\w+\s*,\s*['"]([a-z_]+)['"]/g;

function closure(entry) {
  const seen = new Set(); const stack = [entry]; const out = [];
  while (stack.length) {
    const f = stack.pop();
    if (!f || seen.has(f) || !existsSync(f)) continue;
    seen.add(f);
    let src; try { src = readFileSync(f, 'utf8'); } catch { continue; }
    out.push(src);
    if (/\.m?js$/.test(f)) {
      for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) stack.push(resolvePath(dirname(f), m[1]));
    } else {
      for (const m of src.matchAll(/(?:^|\s)\.\s+[^\n]*?\/(lib\/[a-z0-9_.-]+\.sh)/g)) {
        stack.push(join(ROOT, 'tests/phase0', m[1]));
      }
    }
  }
  return out;
}

const rows = [];
for (const j of journeys) {
  const harness = j.existing_harness;
  const declared = Number(j.max_synthetic_funds_exposure_minor ?? 0);
  if (!harness) { rows.push({ id: j.journey_id, status: 'NO_HARNESS' }); continue; }
  const srcs = closure(join(ROOT, harness));
  const kinds = new Set();
  for (const src of srcs) {
    for (const re of [OWN_CALL, OWN_SHELL, OWN_EXPLICIT]) {
      for (const m of src.matchAll(re)) kinds.add(m[1]);
    }
  }
  const fundingCapable = declared > 0;
  const scopes = [...kinds].map((k) => [k, scopeOf(k)]);
  const unknownKinds = scopes.filter(([, s]) => s === 'UNKNOWN').map(([k]) => k);
  const financial = scopes.filter(([, s]) => s === 'FINANCIAL').map(([k]) => k);
  const structural = scopes.filter(([, s]) => s === 'STRUCTURAL').map(([k]) => k);

  let status;
  if (!fundingCapable) status = 'NOT_APPLICABLE';
  else if (kinds.size === 0) status = 'MISSING_MANIFEST';
  else if (unknownKinds.length) status = 'UNKNOWN';
  else if (financial.length === 0) status = 'STRUCTURAL_ONLY';
  else status = 'RESOLVABLE';

  rows.push({
    id: j.journey_id, harness, declared, fundingCapable,
    kinds: [...kinds], financial, structural, unknownKinds, status,
  });
}

/* ── report ──────────────────────────────────────────────────────────────── */

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log('\nownership & financial resolution — all 38 journeys, from current code\n');
  for (const r of rows.sort((a, b) => (a.status + a.id).localeCompare(b.status + b.id))) {
    console.log(`  ${r.status.padEnd(16)} ${r.id.padEnd(14)} ` +
      `${String(r.declared ?? 0).padStart(8)}  ` +
      `${(r.financial ?? []).join('+') || '—'}` +
      `${(r.structural ?? []).length ? ` · struct: ${r.structural.join('+')}` : ''}` +
      `${(r.unknownKinds ?? []).length ? `  ← UNCLASSIFIED: ${r.unknownKinds.join(',')}` : ''}`);
  }
  const by = {};
  for (const r of rows) by[r.status] = (by[r.status] ?? 0) + 1;
  console.log('\n  ' + Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · '));

  const blocking = rows.filter((r) => r.fundingCapable && ['MISSING_MANIFEST', 'UNKNOWN'].includes(r.status));
  console.log(blocking.length === 0
    ? '\n✓ OWNERSHIP_MATRIX: every funding-capable journey can be held to its declaration\n'
    : `\n✗ OWNERSHIP_MATRIX: ${blocking.length} funding-capable journey(s) cannot be: ` +
      `${blocking.map((b) => b.id).join(', ')}\n`);
  process.exit(blocking.length === 0 ? 0 : 1);
}
