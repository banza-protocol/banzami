#!/usr/bin/env node
/**
 * check-validation-harness-evidence — a journey's evidence must be harvestable.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * The runner harvests a harness's assertions by matching the evidence file the
 * harness writes against the harness's own filename stem. That coupling is
 * invisible: rename a `GateReport` and nothing breaks, nothing warns, and the
 * next Validation Run records the journey as PASSED with an empty assertion
 * set — green by having proved nothing.
 *
 * The runner now refuses a zero-assertion pass, so the failure is loud at
 * execution time. This guard makes it loud at commit time instead, which is
 * where a rename actually happens.
 *
 *   node tools/check-validation-harness-evidence.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

const registry = JSON.parse(execFileSync('python3', [
  '-c', 'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
  join(repo, 'quality/validation/journeys.yaml'),
], { encoding: 'utf8', maxBuffer: 1 << 24 }));

let failures = 0;
const fail = (m) => { console.log(`  ✗ ${m}`); failures++; };
const pass = (m) => console.log(`  ✓ ${m}`);

const journeys = (registry.journeys ?? []).filter((j) => j.existing_harness);
console.log(`\nharness evidence contract — ${journeys.length} journey(s) with a harness\n`);

for (const j of journeys) {
  const rel = j.existing_harness;
  const abs = join(repo, rel);
  if (!existsSync(abs)) { fail(`${j.journey_id}: harness missing — ${rel}`); continue; }

  const stem = rel.split('/').pop().replace(/\.(mjs|sh)$/, '');

  // Shell harnesses are adapted separately and declare their own contract.
  if (rel.endsWith('.sh')) {
    if (!j.evidence_adapter) fail(`${j.journey_id}: shell harness without an evidence_adapter`);
    else pass(`${j.journey_id}: shell harness via ${j.evidence_adapter}`);
    continue;
  }

  const src = readFileSync(abs, 'utf8');

  // A harness outside the app-web family writes its own report shape and says
  // so. The declaration is checked against the SOURCE, not trusted: an adapter
  // named for a shape the harness does not write harvests nothing, and a
  // journey that harvests nothing is exactly the silent pass this guards.
  if (j.evidence_adapter === 'assurance-json') {
    if (!/steps\b|matrix\b/.test(src) || !/writeFileSync/.test(src)) {
      fail(`${j.journey_id}: ${rel} declares assurance-json but writes no steps[]/matrix[] report`);
      continue;
    }
    const stem = j.evidence_stem;
    if (!stem) { fail(`${j.journey_id}: assurance-json without an evidence_stem`); continue; }
    if (!src.includes(stem)) {
      fail(`${j.journey_id}: evidence_stem '${stem}' appears nowhere in ${rel} — ` +
           `the runner would look for a file the harness never writes`);
      continue;
    }
    pass(`${j.journey_id}: ${stem} via assurance-json`);
    continue;
  }
  if (j.evidence_adapter && j.evidence_adapter !== 'gate-report') {
    fail(`${j.journey_id}: unknown evidence_adapter '${j.evidence_adapter}'`);
    continue;
  }

  const m = src.match(/new GateReport\(\s*'([^']+)'/);
  if (!m) {
    fail(`${j.journey_id}: ${rel} constructs no GateReport — the runner would harvest nothing`);
    continue;
  }
  if (m[1] !== stem) {
    fail(`${j.journey_id}: ${rel} names its report '${m[1]}' but the runner looks for '${stem}' — ` +
         `assertions would be harvested from the wrong file, or not at all`);
    continue;
  }
  if (!/\.write\(/.test(src)) {
    fail(`${j.journey_id}: ${rel} never writes its report — nothing reaches the runner`);
    continue;
  }
  pass(`${j.journey_id}: ${stem} writes a harvestable report`);
}

console.log(failures === 0
  ? `\nharness evidence contract: OK (${journeys.length} journeys)\n`
  : `\nharness evidence contract: ${failures} failure(s)\n`);
process.exit(failures === 0 ? 0 : 1);
