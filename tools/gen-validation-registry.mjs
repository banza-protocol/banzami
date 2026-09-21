#!/usr/bin/env node
/**
 * gen-validation-registry — compile quality/validation/*.yaml into the
 * admin-api binary.
 *
 * Banzami Validation Studio (Phase C.4).
 *
 * The registries are canonical in quality/validation/ — reviewed as code, one
 * source of truth. The control plane needs them at runtime, and it must not get
 * them by reading a file from a mounted path: a registry read from disk can
 * differ from the registry the deployed revision was reviewed at, which is
 * precisely the drift the Studio exists to detect.
 *
 * So the registries are COMPILED IN, and the generated file is checked in with
 * a drift guard (`--check`). The binary therefore carries the exact registry
 * bytes of the commit it was built from, and `RegistryDigest` is real
 * provenance rather than a claim.
 *
 * YAML is converted to JSON here so the Go side needs no YAML dependency and
 * so the digest is taken over a canonical form.
 *
 *   node tools/gen-validation-registry.mjs            # write
 *   node tools/gen-validation-registry.mjs --check    # fail if it would change
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = resolve(ROOT, 'services/admin-api/internal/validation/registry_gen.go');
const CHECK = process.argv.includes('--check');

const REGISTRIES = ['actors', 'suites', 'profiles', 'journeys', 'assurance'];

/** Sort object keys recursively so the digest depends on content, not on key order. */
const canonical = (v) => {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]));
  }
  return v;
};

const loadYaml = (name) => {
  const p = resolve(ROOT, `quality/validation/${name}.yaml`);
  if (!existsSync(p)) throw new Error(`${p} is missing`);
  return JSON.parse(execFileSync('python3',
    ['-c', 'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)', p],
    { encoding: 'utf8', maxBuffer: 1 << 24 }));
};

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

const parts = [];
const digests = [];
for (const name of REGISTRIES) {
  const json = JSON.stringify(canonical(loadYaml(name)));
  parts.push({ name, json, digest: sha(json) });
}

// Per-profile digests: a run pins the digest of the ONE profile it was prepared
// from, so editing FULL cannot change what a GOLDEN run says it ran.
const profiles = JSON.parse(parts.find((p) => p.name === 'profiles').json).profiles ?? [];
for (const prof of profiles) {
  digests.push({ id: prof.id, version: prof.version, digest: sha(JSON.stringify(canonical(prof))) });
}

/* ── the derived workspace plan ────────────────────────────────────────────
 *
 * ONE derivation, not two. The classifier that reads the harness sources lives
 * in tools/lib/validation-workspace-capacity.mjs and is the only thing that
 * knows what a run will create. Re-implementing it in Go would be a second
 * answer to "what will this cost", and the application-submit classifier
 * already proved where that ends: a plan that said 3 where the run spent 4.
 *
 * So the PLAN half is derived here and compiled in; the control plane does only
 * the live reading and the arithmetic, exactly as it already does for funds.
 */
const { planFor } = await import('../tools/validation-runner.mjs');
const { workspaceConsumption, workspaceLimits, retryReserve } =
  await import('../tools/lib/validation-workspace-capacity.mjs');

const wsLimits = workspaceLimits();
if (wsLimits.verdict !== 'READ') {
  console.error(`cannot read the workspace limits: ${wsLimits.detail}`);
  process.exit(1);
}
const workspacePlan = {};
for (const prof of profiles) {
  const reserve = retryReserve(prof.id);
  if (reserve.verdict !== 'DECLARED') {
    console.error(`profile ${prof.id} declares no workspace retry reserve ` +
                  `(quality/validation/capacity-policy.yaml): ${reserve.detail}`);
    process.exit(1);
  }
  // The barrier bound is the one the executor can deliver. Emitting BOTH keeps
  // the control plane from having to assume which applies.
  const armed = workspaceConsumption(planFor(prof.id).plan, { barrier: true });
  const bare = workspaceConsumption(planFor(prof.id).plan, { barrier: false });
  if (armed.unknown.length) {
    console.error(`profile ${prof.id}: workspace consumption is not derivable ` +
                  `(${armed.unknown.join('; ')})`);
    process.exit(1);
  }
  workspacePlan[prof.id] = [...armed.byActor.values()].map((rec) => ({
    actor: rec.kind === 'EPHEMERAL' ? '' : rec.actor,
    kind: rec.kind,
    planned: rec.planned,
    concurrent_barrier: rec.maxConcurrentAdditional,
    concurrent_no_barrier: bare.byActor.get(rec.actor).maxConcurrentAdditional,
  })).sort((a, b) => (b.planned - a.planned) || a.actor.localeCompare(b.actor));
}
const workspacePolicy = {};
for (const prof of profiles) {
  const r = retryReserve(prof.id);
  workspacePolicy[prof.id] = { model: r.model, retries: r.permittedRetries };
}
const policyDigest = sha(JSON.stringify(canonical(loadYaml('capacity-policy'))));

// Folded into the registry digest: a binary must be attributable to the policy
// it enforces, not only to the registries it reads.
const registryDigest = sha(
  parts.map((p) => `${p.name}:${p.digest}`).concat([`capacity-policy:${policyDigest}`]).join('\n'));

const lines = [
  '// Code generated by tools/gen-validation-registry.mjs. DO NOT EDIT.',
  '//',
  '// Source of truth: quality/validation/{' + REGISTRIES.join(',') + '}.yaml',
  '// Regenerate with: make gen-validation-registry',
  '//',
  '// The control plane reads the registries from here rather than from disk so',
  '// that the deployed binary carries the exact bytes its revision was reviewed',
  '// at. RegistryDigest is provenance, not a claim.',
  '',
  'package validation',
  '',
  '// RegistryDigest is the sha256 over every registry in this build.',
  `const RegistryDigest = ${JSON.stringify(registryDigest)}`,
  '',
];

for (const p of parts) {
  lines.push(`// ${p.name}JSON is quality/validation/${p.name}.yaml, canonicalised.`);
  lines.push(`const ${p.name}Digest = ${JSON.stringify(p.digest)}`);
  // A Go INTERPRETED string literal, not a raw one: the registries contain
  // backticks (e.g. the `e2e` handle prefix), and JSON.stringify's escapes
  // (\" \\ \n \r \t \b \f \uXXXX) are all valid Go escapes.
  lines.push(`const ${p.name}JSON = ${JSON.stringify(p.json)}`);
  lines.push('');
}

lines.push('// ProfileDigest is the sha256 of one profile alone, so that a run which pinned');
lines.push('// GOLDEN is unaffected by a later edit to FULL.');
lines.push('var ProfileDigest = map[string]string{');
for (const d of digests) lines.push(`\t${JSON.stringify(d.id)}: ${JSON.stringify(d.digest)},`);
lines.push('}');
lines.push('');
lines.push('// WorkspacePolicyDigest is the sha256 of quality/validation/capacity-policy.yaml.');
lines.push(`const WorkspacePolicyDigest = ${JSON.stringify(policyDigest)}`);
lines.push('');
lines.push('// The workspace limits, read from the service that enforces them');
lines.push(`// (${wsLimits.source}) and compiled in so the control plane and the`);
lines.push('// limiter cannot drift apart.');
lines.push(`const WorkspaceActiveLimit = ${wsLimits.activeLimit}`);
lines.push(`const WorkspaceCreationLimit24h = ${wsLimits.creationLimit24h}`);
lines.push(`const WorkspaceWindowHours = ${wsLimits.windowHours}`);
lines.push('');
lines.push('// WorkspaceReserveModel and WorkspacePermittedRetries are the DECLARED retry');
lines.push('// reserve policy (quality/validation/capacity-policy.yaml). A model the control');
lines.push('// plane does not implement is UNKNOWN and refuses; it is never treated as zero.');
lines.push('var WorkspaceReserveModel = map[string]string{');
for (const [id, v] of Object.entries(workspacePolicy)) lines.push(`\t${JSON.stringify(id)}: ${JSON.stringify(v.model)},`);
lines.push('}');
lines.push('');
lines.push('var WorkspacePermittedRetries = map[string]int{');
for (const [id, v] of Object.entries(workspacePolicy)) lines.push(`\t${JSON.stringify(id)}: ${v.retries},`);
lines.push('}');
lines.push('');
lines.push('// WorkspacePlan is what each profile WILL create, per actor, derived from the');
lines.push('// harness sources by tools/lib/validation-workspace-capacity.mjs. An entry with');
lines.push('// an empty Actor is an ephemeral identity the run mints: it has spent nothing');
lines.push('// by derivation, and the same per-actor limits still apply to it. An empty list');
lines.push('// means the profile creates none — GOLDEN is entirely node proofs.');
lines.push('var WorkspacePlan = map[string][]WorkspaceActorPlan{');
for (const [id, rows] of Object.entries(workspacePlan)) {
  lines.push(`\t${JSON.stringify(id)}: {`);
  for (const r of rows) {
    lines.push(`\t\t{Actor: ${JSON.stringify(r.actor)}, Kind: ${JSON.stringify(r.kind)}, ` +
      `Planned: ${r.planned}, ConcurrentBarrier: ${r.concurrent_barrier}, ` +
      `ConcurrentNoBarrier: ${r.concurrent_no_barrier}, ` +
      `},`);
  }
  lines.push('\t},');
}
lines.push('}');
lines.push('');
lines.push('// ProfileVersion is the reviewed version of each profile in this build.');
lines.push('var ProfileVersion = map[string]int{');
for (const d of digests) lines.push(`\t${JSON.stringify(d.id)}: ${d.version},`);
lines.push('}');
lines.push('');

// Emit gofmt-clean output, so that running gofmt over the package (which every
// Go developer does reflexively) cannot by itself create registry drift.
let out = lines.join('\n');
try {
  out = execFileSync('gofmt', [], { input: out, encoding: 'utf8', maxBuffer: 1 << 24 });
} catch (e) {
  console.error('gofmt rejected the generated file:', String(e.stderr || e.message).trim());
  process.exit(1);
}

if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== out) {
    console.error('✗ VALIDATION_REGISTRY_GENERATED_DRIFT=FAIL');
    console.error('  services/admin-api/internal/validation/registry_gen.go is not what');
    console.error('  quality/validation/*.yaml would generate. The deployed control plane');
    console.error('  would therefore serve a registry nobody reviewed.');
    console.error('  Fix: make gen-validation-registry');
    process.exit(1);
  }
  console.log('✓ VALIDATION_REGISTRY_GENERATED_DRIFT=0');
  console.log(`✓ VALIDATION_REGISTRY_DIGEST=${registryDigest.slice(0, 16)}…`);
  process.exit(0);
}

writeFileSync(OUT, out);
console.log(`wrote ${OUT.replace(ROOT + '/', '')}`);
console.log(`  registry digest ${registryDigest.slice(0, 16)}…`);
for (const d of digests) console.log(`  profile ${d.id} v${d.version} ${d.digest.slice(0, 16)}…`);
