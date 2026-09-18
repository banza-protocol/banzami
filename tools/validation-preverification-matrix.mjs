#!/usr/bin/env node
/**
 * validation-preverification-matrix — how many GOLDEN journeys are proven
 * against the build that is actually deployed, derived from evidence.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * A count carried in prose drifts the moment a run finishes: one report said
 * "10 de 12" and then listed three outstanding journeys, which is 9. Neither
 * number was chosen dishonestly and neither was checkable — which is the
 * problem. The count now comes from the same place the claim does: each
 * harness's own evidence file, its recorded verdict, and whether it was written
 * AFTER the component under test was deployed.
 *
 * A result older than the deploy is not a stale formality. The build changed
 * under it, and this session changed the Business surface twice.
 *
 *   node tools/validation-preverification-matrix.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.BANZAMI_SANDBOX_HOST || 'root@217.160.9.248';

const load = (n) => JSON.parse(execFileSync('python3', [
  '-c', 'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
  join(repo, `quality/validation/${n}.yaml`),
], { encoding: 'utf8', maxBuffer: 1 << 24 }));

/** When each deployed component was created — the line a result must be newer than. */
function deployedAt() {
  const out = execFileSync('ssh', ['-o', 'BatchMode=yes', HOST,
    `docker inspect --format '{{.Config.Image}} {{.Created}}' $(docker ps -q) 2>/dev/null`],
    { encoding: 'utf8', maxBuffer: 1 << 22 });
  const map = {};
  for (const line of out.split('\n').filter(Boolean)) {
    const [image, created] = line.trim().split(/\s+/);
    const name = image.split('/').pop().split(':')[0];
    map[name] = Date.parse(created);
  }
  return map;
}

/** Every evidence file a harness has written, newest first. */
function evidenceFor(stem) {
  const base = join(process.env.TMPDIR || tmpdir(), 'banzami-assurance');
  if (!existsSync(base)) return [];
  const found = [];
  const walk = (dir, depth = 0) => {
    if (depth > 3) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name.startsWith(stem) && e.name.endsWith('.json')) {
        found.push({ p, m: statSync(p).mtimeMs });
      }
    }
  };
  try { walk(base); } catch { return []; }
  return found.sort((a, b) => b.m - a.m);
}

const suites = Object.fromEntries((load('suites').suites ?? []).map((s) => [s.id, s]));
const journeys = load('journeys').journeys ?? [];
const profile = (load('profiles').profiles ?? []).find((p) => p.id === (process.argv[2] ?? 'GOLDEN'));
const deploys = deployedAt();

// app-web proofs exercise the deployed Flutter app; that is the revision this
// session changed, so it is the line results are measured against.
const LINE = deploys['app-frontend'] ?? 0;

const plan = [];
for (const sid of profile.suites) {
  for (const j of journeys.filter((x) => x.suite === sid).sort((a, b) => a.journey_id.localeCompare(b.journey_id))) {
    plan.push(j);
  }
}

console.log(`\n${profile.id} preverification against the DEPLOYED build\n`);
console.log(`  app-frontend deployed at ${new Date(LINE).toISOString()}\n`);
console.log('SUITE JOURNEY        RESULT   ASRT  WHEN                      EVIDENCE');

let proven = 0;
for (const j of plan) {
  const stem = (j.existing_harness ?? '').split('/').pop().replace(/\.(mjs|sh)$/, '');
  const files = evidenceFor(stem);
  const fresh = files.find((f) => f.m >= LINE);
  let result = 'NO RESULT', asrt = 0, when = '—', ref = '—';
  if (fresh) {
    try {
      const doc = JSON.parse(readFileSync(fresh.p, 'utf8'));
      const gates = doc.gates ?? [];
      const fails = gates.filter((g) => g.verdict === 'FAIL').length;
      asrt = gates.filter((g) => g.verdict !== 'NOTE').length;
      result = fails === 0 && asrt > 0 ? 'PASS' : 'FAIL';
      when = new Date(fresh.m).toISOString().slice(11, 19) + 'Z';
      ref = fresh.p.split('/').slice(-2).join('/');
    } catch { result = 'UNREADABLE'; }
  } else if (files.length) {
    result = 'STALE';
    when = new Date(files[0].m).toISOString().slice(11, 19) + 'Z';
  }
  if (result === 'PASS') proven++;
  console.log(`${j.suite.padEnd(5)} ${j.journey_id.padEnd(14)} ${result.padEnd(8)} ${String(asrt).padStart(4)}  ${when.padEnd(24)} ${ref.slice(-46)}`);
}

console.log(`\n  ${profile.id}_JOURNEYS_PREVERIFIED = ${proven}/${plan.length}`);
console.log(proven === plan.length ? '  ✓ every journey proven against the deployed build\n'
                                   : `  ✗ ${plan.length - proven} journey(s) not proven against the deployed build\n`);
process.exit(proven === plan.length ? 0 : 1);
