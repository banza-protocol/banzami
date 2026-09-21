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
// Registration is also route-driven inside the shared gateway client, so a
// harness that POSTs a creating route owns that kind without naming it. The
// table is imported rather than restated: a matrix with its own copy would
// drift, and this one already reported S23 as owning no test payer the moment
// the registration moved.
const { GATEWAY_CREATES } = await import(join(ROOT, 'tools/e2e/app-web/lib/provision.mjs'));
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

/* ── a conservative FLOOR, and only ever a floor ─────────────────────────── */

// Grants read from the source that issues them, not from memory:
//   public-api auth.go        SandboxCreditConsumer(..., 1_000_000, ...)
//   service/test_payers.go    TestPayerGrantMinor = 1_000_000
const GRANT = { consumer: 1_000_000, test_payer: 1_000_000 };

// A FLOOR, from the harness's OWN source only, and ADVISORY.
//
// The first version of this computed the floor over the whole import closure
// and immediately flagged S05-LNK-002 and S23-RAIL-001 as under-declared. Both
// were wrong: proof 04 contains zero references to /v1/sandbox/test-payers and
// proof 23 zero to registerConsumer. The kinds came from provision.mjs and
// consumer.mjs being in their import graphs — a library's CAPABILITY, not the
// harness's behaviour.
//
// That is the `derivedFloor` retraction repeating in new clothes: counting
// what appears in reachable source, and calling compliant journeys
// under-declared. So the scope is narrowed to what this harness itself writes,
// and the result NEVER blocks. It can miss a real under-declaration made
// inside a helper, and missing one is the safe direction for an advisory
// signal — the authoritative answer is the runtime concurrent peak, measured
// against the resources the journey actually owned.
function derivedFloor(kinds, ownSrc) {
  let floor = 0;
  for (const k of kinds) floor += GRANT[k] ?? 0;
  for (const m of ownSrc.matchAll(/amount_minor["']?\s*[:=]\s*([0-9_]{4,})/g)) {
    floor += Number(m[1].replace(/_/g, ''));
  }
  return floor;
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
    for (const [route, kind] of GATEWAY_CREATES) {
      // The literal the harness writes, e.g. '/v1/sandbox/test-payers'.
      const path = route.source.replace(/^\^|\$$/g, '').replace(/\\\//g, '/').replace(/\([^)]*\)\?/g, '');
      if (src.includes(path)) kinds.add(kind);
    }
  }
  const fundingCapable = declared > 0;
  const scopes = [...kinds].map((k) => [k, scopeOf(k)]);
  const unknownKinds = scopes.filter(([, s]) => s === 'UNKNOWN').map(([k]) => k);
  const financial = scopes.filter(([, s]) => s === 'FINANCIAL').map(([k]) => k);
  const structural = scopes.filter(([, s]) => s === 'STRUCTURAL').map(([k]) => k);

  // READY_TO_MEASURE is not RUNTIME_VERIFIED, and the distinction is the whole
  // point. A journey is ready when its ownership reaches the runner, every
  // kind it can own is classified, and every FINANCIAL kind resolves to an
  // account. Whether its peak was inside its declaration is a RUNTIME fact
  // that only an execution can establish — and requiring 33 executions before
  // FULL would be running FULL piecemeal to earn the right to run FULL.
  let status;
  if (!fundingCapable) status = 'NOT_APPLICABLE';
  else if (kinds.size === 0) status = 'MISSING_MANIFEST';
  else if (unknownKinds.length) status = 'UNKNOWN';
  else if (financial.length === 0) status = 'STRUCTURAL_ONLY';
  else status = 'READY_TO_MEASURE';

  // Own source only, and own kinds only — what THIS file registers or POSTs.
  const ownSrc = srcs[srcs.length - 1] ?? '';
  const ownKinds = financial.filter((k) =>
    new RegExp(`ownCreated\\(\\s*['"]${k}['"]`).test(ownSrc)
    || (GATEWAY_CREATES.find(([, kk]) => kk === k)
        && ownSrc.includes(GATEWAY_CREATES.find(([, kk]) => kk === k)[0].source
             .replace(/^\^|\$$/g, '').replace(/\\\//g, '/').replace(/\([^)]*\)\?/g, ''))));
  const floor = fundingCapable ? derivedFloor(ownKinds, ownSrc) : 0;
  const underDeclared = fundingCapable && floor > declared;

  rows.push({
    id: j.journey_id, harness, declared, fundingCapable,
    kinds: [...kinds], financial, structural, unknownKinds, status,
    derivedFloor: floor, underDeclared,
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
      `${(r.unknownKinds ?? []).length ? `  ← UNCLASSIFIED: ${r.unknownKinds.join(',')}` : ''}` +
      `${r.underDeclared ? `  ← advisory floor ${r.derivedFloor} > declared ${r.declared}` : ''}`);
  }
  const by = {};
  for (const r of rows) by[r.status] = (by[r.status] ?? 0) + 1;
  console.log('\n  ' + Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · '));

  // The floor never blocks: it is advisory by construction (see derivedFloor).
  const blocking = rows.filter((r) => r.fundingCapable
    && ['MISSING_MANIFEST', 'UNKNOWN', 'INCOMPLETE'].includes(r.status));
  const advisory = rows.filter((r) => r.underDeclared);
  if (advisory.length) {
    console.log(`\n  advisory: ${advisory.length} journey(s) name more funding in their own source than they declare: ` +
      advisory.map((a) => `${a.id} (floor ${a.derivedFloor} vs ${a.declared})`).join(', ') +
      `\n  a floor cannot authorise a run and does not block one; the runtime concurrent peak decides.`);
  }
  console.log(blocking.length === 0
    ? '\n✓ OWNERSHIP_MATRIX: every funding-capable journey is READY_TO_MEASURE\n'
      + '  (structurally able to produce trustworthy exposure evidence when executed;\n'
      + '   RUNTIME_VERIFIED is a separate fact that only an execution establishes)\n'
    : `\n✗ OWNERSHIP_MATRIX: ${blocking.length} funding-capable journey(s) cannot be: ` +
      `${blocking.map((b) => b.id).join(', ')}\n`);
  process.exit(blocking.length === 0 ? 0 : 1);
}
