#!/usr/bin/env node
/**
 * check-validation-registries.mjs — the Validation Studio registries are
 * coherent, and they reference capability truth rather than redefining it.
 *
 * quality/validation/ holds the concepts the assurance manifest has no room for
 * — actors, journeys, suites, resources. The danger is that one of them quietly
 * becomes a second capability registry: a journey that names a capability which
 * does not exist, or an actor whose credentials are pasted in rather than
 * referenced, and the "one source of truth" stops being one.
 *
 * It also holds the line that matters most before the actors exist:
 * VALIDATION_ACTORS_PROVISIONED=0. An actor with a product id recorded is an
 * actor someone created, and creating them before the Studio can own them
 * produces residue rather than infrastructure.
 *
 * Usage: node tools/check-validation-registries.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseManifest } from './assurance-manifest-lib.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
let failures = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failures += 1; };
const pass = (m) => console.log(`  ✓ ${m}`);

// python3 is already a build dependency of this repo's tooling; using a real
// YAML parser beats hand-rolling a fourth one.
const yaml = (rel) => {
  const p = resolve(ROOT, rel);
  if (!existsSync(p)) { fail(`${rel} is missing`); return null; }
  try {
    return JSON.parse(execFileSync('python3',
      ['-c', 'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)', p],
      { encoding: 'utf8', maxBuffer: 1 << 24 }));
  } catch (e) { fail(`${rel} does not parse: ${String(e.message).slice(0, 120)}`); return null; }
};

console.log('Banzami Validation Studio — registry integrity\n');

const actors = yaml('quality/validation/actors.yaml');
const journeys = yaml('quality/validation/journeys.yaml');
const suites = yaml('quality/validation/suites.yaml');
const resources = yaml('quality/validation/resources.yaml');
if (failures) { console.error('\n✗ VALIDATION_REGISTRIES=FAIL'); process.exit(1); }

// ── 1. Actors ───────────────────────────────────────────────────────────────
const roster = actors.actors ?? [];
const EXPECTED = ['C01', 'C02', 'C03', 'B01', 'B02', 'B03', 'D01', 'D02', 'A01'];
const ids = roster.map((a) => a.id);
JSON.stringify(ids) === JSON.stringify(EXPECTED)
  ? pass(`actor roster is the approved nine (${EXPECTED.join(', ')})`)
  : fail(`actor roster is ${ids.join(', ')} — the approved roster is ${EXPECTED.join(', ')}`);

if (actors.environment !== 'SANDBOX') fail(`actors.environment is ${actors.environment} — SANDBOX is the only permitted value`);
else pass('actors are Sandbox-only');

// VALIDATION_ACTORS_PROVISIONED=0 — no product id may be recorded yet.
const provisioned = roster.filter((a) => Object.values(a.product_ids ?? {}).some((v) => v !== null && v !== undefined));
provisioned.length
  ? fail(`VALIDATION_ACTORS_PROVISIONED=${provisioned.length} — ${provisioned.map((a) => a.id).join(', ')} carry product ids, but B10 has not been authorised`)
  : pass('VALIDATION_ACTORS_PROVISIONED=0');

// Credentials are references, never values. A stored PIN or seed here would be
// a secret in the repository, which is the one thing this registry must not be.
for (const a of roster) {
  for (const [name, ref] of Object.entries(a.credentials ?? {})) {
    if (typeof ref !== 'string' || !ref.startsWith('secret://banzami/validation/')) {
      fail(`${a.id}.${name} is not a secret:// reference — credentials are referenced, never stored`);
    }
  }
  if (a.handle && !/^e2e/.test(a.handle)) {
    fail(`${a.id} handle "${a.handle}" does not start with e2e — an actor must be unmistakable on a receipt and a public profile`);
  }
  if (a.email && !/@banzami-e2e\.test$/.test(a.email) && a.type !== 'operator') {
    fail(`${a.id} email "${a.email}" is outside the existing fixture domain @banzami-e2e.test`);
  }
}
if (!failures) pass('every credential is a reference; every handle is unmistakably synthetic');

// ── 2. Journeys reference capability truth, never redefine it ───────────────
const manifest = parseManifest(ROOT);
const capIds = new Set((manifest.capabilities ?? []).map((c) => c.id));
const suiteIds = new Set((suites.suites ?? []).map((s) => s.id));
const actorIds = new Set(ids);

for (const j of journeys.journeys ?? []) {
  for (const c of j.capabilities ?? []) {
    if (!capIds.has(c)) fail(`${j.journey_id} names capability ${c}, which is not in the assurance manifest`);
  }
  if (!suiteIds.has(j.suite)) fail(`${j.journey_id} names suite ${j.suite}, which is not in the suite registry`);
  for (const a of j.actors ?? []) {
    if (!actorIds.has(a)) fail(`${j.journey_id} names actor ${a}, which is not in the actor registry`);
  }
  // §106: orchestrate proven tooling rather than rebuilding it.
  if (j.existing_harness && !existsSync(resolve(ROOT, j.existing_harness))) {
    fail(`${j.journey_id} names harness ${j.existing_harness}, which does not exist`);
  }
}
pass(`${(journeys.journeys ?? []).length} journey(s) resolve to real capabilities, suites, actors and harnesses`);

// A journey registry must not carry capability status — that is the manifest's.
const FORBIDDEN_IN_JOURNEYS = ['public_status', 'implementation_status', 'deployment_gate', 'cleanup_disposition'];
for (const j of journeys.journeys ?? []) {
  for (const k of FORBIDDEN_IN_JOURNEYS) {
    if (k in j) fail(`${j.journey_id} carries ${k} — capability status belongs to the assurance manifest alone`);
  }
}
pass('no registry restates capability status');

// ── 3. Suites and resources ─────────────────────────────────────────────────
(suites.suites ?? []).length >= 21
  ? pass(`${suites.suites.length} suites registered`)
  : fail(`only ${(suites.suites ?? []).length} suites — S00..S20 plus the audit's additions are expected`);

const classes = (resources.classes ?? []).map((c) => c.class);
const NEEDED = ['disposable', 'preserved-economic-history', 'persistent-actor', 'retirable-value'];
const missingClasses = NEEDED.filter((c) => !classes.includes(c));
missingClasses.length
  ? fail(`resource registry is missing class(es): ${missingClasses.join(', ')}`)
  : pass('resource classes distinguish disposable from preserved economic history');

const preserved = (resources.classes ?? []).find((c) => c.class === 'preserved-economic-history');
preserved?.policy === 'never-delete'
  ? pass('economic history is never-delete')
  : fail('preserved-economic-history must carry policy: never-delete');

if (failures) { console.error(`\n✗ VALIDATION_REGISTRIES=FAIL (${failures})`); process.exit(1); }
console.log('\n✓ VALIDATION_ACTOR_REGISTRY_READY=PASS');
console.log('✓ VALIDATION_JOURNEY_REGISTRY_READY=PASS');
console.log('✓ VALIDATION_SUITE_REGISTRY_READY=PASS');
console.log('✓ VALIDATION_ACTORS_PROVISIONED=0');
