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
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

/**
 * Which deployed components a journey actually exercises.
 *
 * Conservative on purpose: a journey is stale if ANY component it touches was
 * deployed after its evidence was written. Being wrong in the direction of
 * re-running costs a test; being wrong the other way means reporting a result
 * produced by a system that no longer exists.
 */
function componentsFor(harness) {
  if (harness.startsWith('tools/e2e/app-web/'))
    return ['app-frontend', 'api-gateway-staging', 'core-api-staging', 'public-api-staging'];
  if (harness === 'tests/phase0/banzadmin-authority-e2e.sh') return ['admin-api'];
  if (harness.startsWith('tests/phase0/'))
    return ['api-gateway-staging', 'core-api-staging', 'developer-api'];
  if (harness.startsWith('tools/e2e/docs/')) return ['api-gateway-staging', 'developer-api'];
  return ['api-gateway-staging', 'core-api-staging'];
}

/** When each deployed component was created — the line a result must be newer than. */
function deployedAt() {
  const out = execFileSync('ssh', ['-o', 'BatchMode=yes', HOST,
    `docker inspect --format '{{.Config.Image}} {{.Created}}' $(docker ps -q) 2>/dev/null`],
    { encoding: 'utf8', maxBuffer: 1 << 22 });
  const map = {};
  for (const line of out.split('\n').filter(Boolean)) {
    const [image, created] = line.trim().split(/\s+/);
    const name = image.split('/').pop().split(':')[0];
    map[name] = { at: Date.parse(created), rev: image.split(':').pop() };
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

/**
 * What each journey's FRESH pass was produced by.
 *
 * The evidence files record no provenance — they predate the question, and
 * adding a stamp now would change the GOLDEN execution surface, which is
 * frozen. So the matrix keeps its own ledger: journey → evidence file + the
 * sha256 of the harness that wrote it. A later run with a byte-identical
 * harness stays FRESH; a changed harness does not, whatever its mtime says.
 */
const LEDGER = join(repo, 'quality/validation/preverification-ledger.json');
const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : {};
const RECORD = process.argv.includes('--record');

const suites = Object.fromEntries((load('suites').suites ?? []).map((s) => [s.id, s]));
const journeys = load('journeys').journeys ?? [];
const wanted = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'GOLDEN';
const profile = (load('profiles').profiles ?? []).find((p) => p.id === wanted);
if (!profile) { console.error(`unknown profile ${wanted}`); process.exit(2); }
const deploys = deployedAt();

const plan = [];
for (const sid of profile.suites) {
  for (const j of journeys.filter((x) => x.suite === sid).sort((a, b) => a.journey_id.localeCompare(b.journey_id))) {
    plan.push(j);
  }
}

console.log(`\n${profile.id} preverification against the DEPLOYED build\n`);
console.log('  deployed provenance:');
for (const [name, d] of Object.entries(deploys).sort()) {
  console.log(`    ${name.padEnd(22)} ${d.rev.padEnd(14)} ${new Date(d.at).toISOString()}`);
}
console.log('');
console.log('SUITE JOURNEY        RESULT ASRT WHEN      HARNESS SHA   STATE');

let fresh = 0;
const stale = [];
for (const j of plan) {
  const harness = j.existing_harness ?? '';
  const stem = harness.split('/').pop().replace(/\.(mjs|sh)$/, '');
  const abs = join(repo, harness);
  const harnessSha256 = existsSync(abs)
    ? createHash('sha256').update(readFileSync(abs)).digest('hex') : '';
  const harnessSha = harnessSha256 ? harnessSha256.slice(0, 12) : '—';
  // CONTENT, not mtime. Restoring a file from a backup moves its mtime without
  // changing a byte, and that reported a journey stale whose harness was
  // identical to the one that produced the evidence. A false stale costs a run;
  // trusting mtime after any file operation costs the truth.

  // The provenance line this journey must be newer than: every component it
  // exercises, and the harness file itself.
  const comps = componentsFor(harness);
  let line = 0, because = 'deploy';
  for (const c of comps) {
    const d = deploys[c];
    if (d && d.at > line) { line = d.at; because = c; }
  }

  const files = evidenceFor(stem);
  const newest = files[0];
  let result = 'NONE', asrt = 0, when = '—', state = 'NO RESULT';
  if (newest) {
    try {
      const doc = JSON.parse(readFileSync(newest.p, 'utf8'));
      const gates = doc.gates ?? [];
      const fails = gates.filter((g) => g.verdict === 'FAIL').length;
      asrt = gates.filter((g) => g.verdict !== 'NOTE').length;
      result = fails === 0 && asrt > 0 ? 'PASS' : 'FAIL';
      when = new Date(newest.m).toISOString().slice(11, 19) + 'Z';
        // Two conditions, both necessary: nothing this journey exercises has been
      // deployed since the evidence, and the harness is byte-identical to the
      // one recorded against it. The ledger carries that second fact, because
      // the evidence files do not stamp their own harness — and adding that
      // stamp would change the GOLDEN execution surface, which is frozen.
      const recorded = ledger[j.journey_id];
      const sameHarness = recorded?.harness_sha256 === harnessSha256;
      state = newest.m < line ? `STALE(${because})`
            : !recorded ? 'UNRECORDED'
            : !sameHarness ? 'STALE(harness)'
            : recorded.evidence !== newest.p ? 'UNRECORDED'
            : 'FRESH';
    } catch { result = 'UNREADABLE'; }
  }
  // --record stamps a currently-valid pass into the ledger. It only ever
  // records a result that is a PASS and not stale for a deploy reason; it can
  // never manufacture freshness for a failing or superseded run.
  if (RECORD && result === 'PASS' && newest && newest.m >= line) {
    ledger[j.journey_id] = {
      evidence: newest.p, harness: harness, harness_sha256: harnessSha256,
      observed_at: new Date(newest.m).toISOString(),
      components: Object.fromEntries(comps.map((c) => [c, deploys[c]?.rev ?? null])),
    };
    state = 'FRESH';
  }
  const ok = result === 'PASS' && state === 'FRESH';
  if (ok) fresh++; else stale.push(`${j.journey_id} ${result}/${state}`);
  console.log(`${j.suite.padEnd(5)} ${j.journey_id.padEnd(14)} ${result.padEnd(6)} ${String(asrt).padStart(4)} ${when.padEnd(9)} ${harnessSha.padEnd(13)} ${state}`);
}

// Provenance match is a gate of its own: the evidence must have been produced
// by the system that is deployed NOW. Evidence stamped with its own provenance
// would be stronger — the harnesses do not record it, and adding that would
// change the GOLDEN execution surface, which is frozen. Recorded as the reason
// this check is comparative rather than recorded.
console.log(`\n  PREVERIFICATION_PROVENANCE_MATCH = ${stale.length === 0 ? 'PASS' : 'FAIL'}`);
if (stale.length) for (const x of stale) console.log(`    ${x}`);
console.log(`  ${profile.id}_JOURNEYS_PREVERIFIED = ${fresh}/${plan.length} FRESH PASS`);
if (RECORD) {
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
  console.log(`  ledger written: ${LEDGER.replace(repo + '/', '')}`);
}
console.log(fresh === plan.length ? '  ✓ every journey proven against the system that is deployed now\n'
                                  : `  ✗ ${plan.length - fresh} journey(s) not fresh\n`);
process.exit(fresh === plan.length ? 0 : 1);
