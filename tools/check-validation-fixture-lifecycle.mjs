#!/usr/bin/env node
/**
 * check-validation-fixture-lifecycle — every disposable resource a journey
 * creates has a declared owner and a guaranteed retirement.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * This replaces a guard that asked one question of one file:
 *
 *     source contains /auth\/register/  =>  source must contain retireConsumer
 *
 * It never applied to proof 14, which registers through the UI, or to proof 04,
 * whose registration lives three files away inside lib/deeplink-pay.mjs. Those
 * two leaked a 1 000 000 minor grant per registration for months, and the
 * accepted GOLDEN run left 2 650 000 behind while reporting every journey PASS.
 *
 * So the question is asked of the whole import closure, of both API and UI
 * primitives, and about the EXCEPTION path — because the runs that leak are the
 * runs that failed.
 *
 * FAIL CLOSED. A journey whose lifecycle cannot be established is UNKNOWN, and
 * UNKNOWN blocks acceptance readiness. "We could not tell" is not "it is fine".
 *
 *   node tools/check-validation-fixture-lifecycle.mjs [--table]
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (n) => JSON.parse(execFileSync('python3', [
  '-c', 'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
  join(repo, `quality/validation/${n}.yaml`)], { encoding: 'utf8', maxBuffer: 1 << 24 }));

/** The Sandbox grants this to every consumer that registers. */
const REGISTRATION_GRANT_MINOR = 1_000_000;

/**
 * Every file a harness can reach. Node imports and shell `source` alike — a
 * creation primitive one file deeper is still this journey's creation.
 */
function closure(rel, seen = new Set(), depth = 0) {
  const abs = join(repo, rel);
  if (seen.has(abs) || depth > 6 || !existsSync(abs)) return seen;
  seen.add(abs);
  const src = readFileSync(abs, 'utf8');
  for (const m of src.matchAll(/^\s*import\s[^'"]*['"](\.[^'"]+)['"]/gm)) {
    let p = resolve(dirname(abs), m[1]);
    if (!existsSync(p) && existsSync(`${p}.mjs`)) p += '.mjs';
    if (existsSync(p)) closure(p.replace(`${repo}/`, ''), seen, depth + 1);
  }
  for (const m of src.matchAll(/^\s*(?:\.|source)\s+.*?\/((?:lib|ops)\/[\w.-]+\.sh)/gm)) {
    for (const base of ['tests/phase0', 'tools']) {
      const p = join(repo, base, m[1]);
      if (existsSync(p)) closure(p.replace(`${repo}/`, ''), seen, depth + 1);
    }
  }
  return seen;
}

/**
 * Creation primitives. `grant` is the funded value the Sandbox attaches to one
 * use of it — a consumer registration is never free, whichever surface asks.
 */
export const CREATORS = [
  { id: 'api:auth/register',     re: /auth\/register/,                 kind: 'consumer', grant: REGISTRATION_GRANT_MINOR },
  { id: 'ui:create.submit',      re: /\bcreate\.submit\s*\(/,          kind: 'consumer', grant: REGISTRATION_GRANT_MINOR },
  { id: 'fn:registerConsumer',   re: /\bregisterConsumer\s*\(/,        kind: 'consumer', grant: REGISTRATION_GRANT_MINOR },
  { id: 'fn:provisionBusiness',  re: /\bprovisionBusiness\s*\(/,       kind: 'business', grant: 0 },
  { id: 'sh:synthetic_tenant',   re: /\bsynthetic_tenant\b\s*\w/,      kind: 'business', grant: 0 },
];

/**
 * Ownership contracts this repo actually has. Nothing is inferred by name.
 * Takes file CONTENTS so the mutation selftest can drive it on synthetic
 * sources — a guard nobody has seen fail is not a guard.
 */
export function ownershipOf(sources) {
  const src = sources.join('\n');
  // The shell contract: a manifest and a trap on EXIT/INT/TERM.
  if (/\be2e_begin\b/.test(src) && /\be2e_own\s+\w/.test(src)) return { kind: 'shell-trap', guaranteed: true };
  // The node port of it.
  if (/\be2eOwn\s*\(/.test(src) && /\b(e2eCleanup|withOwnedFixtures)\s*\(/.test(src)) {
    return { kind: 'e2e-own', guaranteed: true };
  }
  // Legacy: a retirement call, but only if it is on a path that runs when the
  // scenario throws. Cleanup on the success path is worth almost nothing.
  const inFinally = sources.some((s) =>
    /finally\s*\{[\s\S]{0,4000}?retire(Consumer|Business)\s*\(/.test(s)
    || /\.finally\s*\([\s\S]{0,1500}?(e2eCleanup|retire(Consumer|Business))\s*\(/.test(s));
  if (inFinally) return { kind: 'finally-retire', guaranteed: true };
  if (/retire(Consumer|Business)\s*\(/.test(src)) return { kind: 'retire-success-path-only', guaranteed: false };
  return { kind: 'none', guaranteed: false };
}

/** The whole decision, pure, so every branch can be mutation-proven. */
export function classify({ sources, declared }) {
  const src = sources.join('\n');
  const creators = CREATORS.filter((c) => c.re.test(src));
  const own = ownershipOf(sources);
  if (!creators.length) return { status: 'CLOSED', own: own.kind, creators: [] };
  if (typeof declared !== 'number') return { status: 'UNKNOWN', own: own.kind, creators: creators.map((c) => c.id) };
  if (!own.guaranteed) return { status: 'CLEANUP_MISSING', own: own.kind, creators: creators.map((c) => c.id) };
  return { status: 'CLOSED', own: own.kind, creators: creators.map((c) => c.id) };
}

const RUN_AS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!RUN_AS_MAIN) { /* imported for its exports */ }

const journeys = RUN_AS_MAIN ? (load('journeys').journeys ?? []).filter((j) => j.existing_harness) : [];
const rows = [];
for (const j of journeys) {
  const files = [...closure(j.existing_harness)];
  const src = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  const creators = CREATORS.filter((c) => c.re.test(src));
  const own = ownershipOf(files.map((f) => readFileSync(f, 'utf8')));
  const declared = j.max_synthetic_funds_exposure_minor;

  // Counting occurrences was tried here and is UNSOUND, so it is not a gate.
  // One logical registration appears as a call site, again in the helper that
  // wraps it and again where the primitive is defined; across a closure that
  // read three registrations for one consumer and called eight compliant
  // journeys under-declared. It is the same trap as the plan's ~ASRT column:
  // source text is not a count of what runs.
  //
  // Under-declaration is therefore checked where the answer actually exists —
  // at RUNTIME, against the ownership manifest each harness writes and against
  // the cleanup barrier's own post-journey measurement. What is sound to assert
  // HERE is the thing that does not depend on multiplicity: a resource that can
  // be created must have a retirement that runs even when the scenario throws.
  const occurrences = creators.filter((c) => c.grant > 0)
    .reduce((n, c) => n + (src.match(new RegExp(c.re.source, 'g')) ?? []).length, 0);

  let status;
  if (!creators.length) status = 'CLOSED';
  else if (typeof declared !== 'number') status = 'UNKNOWN';
  else if (!own.guaranteed) status = 'CLEANUP_MISSING';
  else status = 'CLOSED';

  rows.push({ journey: j.journey_id, harness: j.existing_harness.replace(/^tools\/e2e\/|^tests\//, ''),
    files: files.length, creators: creators.map((c) => c.id), own: own.kind,
    declared, occurrences, status });
}

if (!RUN_AS_MAIN) { /* exports only */ } 
let failures = 0;
const BAD = new Set(['CLEANUP_MISSING', 'UNDER_DECLARED', 'UNKNOWN']);
console.log('\nfixture lifecycle — every creation carries a retirement\n');
if (process.argv.includes('--table')) {
  console.log('JOURNEY        FILES OWNERSHIP            DECL   SITES~  STATUS            CREATORS');
  for (const r of rows) {
    console.log(`${r.journey.padEnd(14)} ${String(r.files).padStart(5)} ${r.own.padEnd(20)} ` +
      `${String(r.declared ?? '?').padStart(8)} ${String(r.occurrences).padStart(6)}  ${r.status.padEnd(16)} ${r.creators.join(',') || '—'}`);
  }
  console.log('');
}
for (const r of rows) {
  if (!BAD.has(r.status)) { console.log(`  ✓ ${r.journey.padEnd(14)} ${r.status}`); continue; }
  failures++;
  const why = r.status === 'CLEANUP_MISSING'
    ? `creates ${r.creators.join(', ')} with ownership "${r.own}" — nothing retires it when the scenario throws`
    : 'no funded-exposure declaration, so the lifecycle cannot be established';
  console.log(`  ✗ ${r.journey.padEnd(14)} ${r.status}\n      ${why}`);
}
console.log(`\n  ${rows.length} journey(s) · ${rows.filter((r) => !BAD.has(r.status)).length} closed · ${failures} open`);
console.log('  SITES~ is an occurrence count, shown and never asserted on: one logical');
console.log('  registration appears at the call, in the helper and at the definition.');
console.log('  Under-declaration is caught at runtime, against the ownership manifest.');
console.log(failures === 0
  ? `\n✓ VALIDATION_FIXTURE_LIFECYCLE=PASS\n`
  : `\n✗ VALIDATION_FIXTURE_LIFECYCLE=FAIL (${failures})\n`);
if (RUN_AS_MAIN) process.exit(failures === 0 ? 0 : 1);
