#!/usr/bin/env node
/**
 * Every deployed component is classified for assurance.
 *
 * quality/deployed-component-coverage.json says, per component, how it is
 * reached, who may use it, what it can do to money, and what proves it. This
 * check fails when something runs, or is shipped, without an entry:
 *
 *   - a container in ops/sandbox-host-manifest.tsv with no component
 *   - a directory under apps/, services/ or sdk/ with no component
 *   - a capability id that the canonical manifest does not have
 *   - a test or harness path that does not exist
 *   - a component missing a required field, or with an unknown risk/kind
 *   - a P0 component with no test at all
 *
 *   node tools/check-component-coverage.mjs [--root <dir>]
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const rootArg = process.argv.indexOf('--root');
const ROOT = rootArg > -1 ? process.argv[rootArg + 1] : join(import.meta.dirname, '..');

const REQUIRED = ['id', 'kind', 'runtime', 'entry_points', 'actors', 'authentication', 'authorization',
  'sensitive_data', 'financial_authority', 'environment', 'critical_actions', 'dependencies',
  'capabilities', 'tests', 'deployed_e2e', 'gaps', 'risk'];
const KINDS = new Set(['service', 'worker', 'frontend', 'edge', 'data', 'job', 'client', 'sdk',
  'external', 'tooling', 'library', 'not-deployed']);
const RISKS = new Set(['P0', 'P1', 'P2']);

const problems = [];
const matrix = JSON.parse(readFileSync(join(ROOT, 'quality/deployed-component-coverage.json'), 'utf8'));
const byId = new Map();
for (const c of matrix.components) {
  if (byId.has(c.id)) problems.push(`duplicate component id ${c.id}`);
  byId.set(c.id, c);
  for (const f of REQUIRED) if (!(f in c)) problems.push(`${c.id}: missing field ${f}`);
  if (!KINDS.has(c.kind)) problems.push(`${c.id}: unknown kind ${c.kind}`);
  if (!RISKS.has(c.risk)) problems.push(`${c.id}: unknown risk ${c.risk}`);
  for (const p of [...(c.tests ?? []), ...(c.deployed_e2e ?? [])]) {
    if (!existsSync(join(ROOT, p))) problems.push(`${c.id}: path does not exist: ${p}`);
  }
  if (c.risk === 'P0' && c.kind !== 'not-deployed' && (c.tests ?? []).length === 0) {
    problems.push(`${c.id}: P0 component with no test`);
  }
  if (c.kind !== 'not-deployed' && c.kind !== 'library' && (c.deployed_e2e ?? []).length === 0 && (c.gaps ?? []).length === 0) {
    problems.push(`${c.id}: no deployed E2E and no gap stating why`);
  }
}

// Capabilities must be the canonical manifest's own ids.
const manifest = readFileSync(join(ROOT, 'quality/operator-assurance-manifest.yaml'), 'utf8');
const caps = new Set([...manifest.matchAll(/^ {2}- id: (CAP-[A-Z]+-\d+)/gm)].map((m) => m[1]));
for (const c of matrix.components) {
  for (const cap of c.capabilities ?? []) if (!caps.has(cap)) problems.push(`${c.id}: unknown capability ${cap}`);
}

// Every container the host is supposed to run.
const host = readFileSync(join(ROOT, 'ops/sandbox-host-manifest.tsv'), 'utf8')
  .split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split('\t')[0]);
const unclassified = [];
for (const name of host) {
  const id = matrix.host_map[name];
  if (!id || !byId.has(id)) unclassified.push(`container ${name}`);
}

// Every shipped source tree.
for (const zone of ['apps', 'services', 'sdk']) {
  for (const d of readdirSync(join(ROOT, zone))) {
    if (!statSync(join(ROOT, zone, d)).isDirectory()) continue;
    const id = matrix.source_map[`${zone}/${d}`];
    if (!id || !byId.has(id)) unclassified.push(`${zone}/${d}`);
  }
}

for (const u of unclassified) problems.push(`unclassified: ${u}`);
console.log(`components ${byId.size} · containers ${host.length} · capabilities referenced ${caps.size}`);
console.log(`DEPLOYED_COMPONENTS_WITHOUT_ASSURANCE_CLASSIFICATION = ${unclassified.length}`);
if (problems.length) {
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log('✓ every deployed component is classified');
