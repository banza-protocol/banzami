#!/usr/bin/env node
/**
 * validation-full-plan — what a FULL run would actually do, derived.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * Every column here is read from the registry and the harness sources, never
 * authored. A plan someone types is a plan that drifts from the thing it
 * describes; the point of this one is to be checkable against reality before a
 * run is authorised, especially the two scarce resources — the per-IP
 * application-submit window and the rolling merchant-credit volume.
 *
 *   node tools/validation-full-plan.mjs [--profile FULL] [--json]
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { submitCost } from './lib/validation-capacity.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (n) => JSON.parse(execFileSync('python3', [
  '-c', 'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
  join(repo, `quality/validation/${n}.yaml`),
], { encoding: 'utf8', maxBuffer: 1 << 24 }));

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const PROFILE = arg('--profile') ?? 'FULL';

const suites = load('suites').suites ?? [];
const journeys = load('journeys').journeys ?? [];
const profile = (load('profiles').profiles ?? []).find((p) => p.id === PROFILE);
if (!profile) { console.error(`unknown profile ${PROFILE}`); process.exit(2); }

/** Read the harness and say what it does, rather than what its name suggests. */
function describe(rel) {
  const abs = join(repo, rel);
  if (!existsSync(abs)) return { exists: false };
  const src = readFileSync(abs, 'utf8');
  const shell = rel.endsWith('.sh');
  // The ONLY thing that spends the per-IP application-submit window is the
  // public application path. Phase-0 harnesses build tenants through internal
  // routes, which is why they cost nothing here.
  //
  // This counted a harness as free when its source merely MENTIONED
  // BZ_BIZ_HANDLE — which proof 10 does, in a comment — and so reported GOLDEN
  // at 3 slots when it spends 4. Fixture reuse is something an operator does by
  // hand while diagnosing; a Validation Run always provisions. The plan states
  // what a RUN costs, so calling provisionBusiness is the whole test.
  const cost = submitCost(rel, src);
  const quota = cost ? 1 : 0;
  const funds = /sandbox\/fund|amount_minor/.test(src);
  const mutating = /POST|PUT|PATCH|DELETE|synthetic_tenant|provisionBusiness/.test(src);
  // Count only what this recognises, and say so when it does not. Two harnesses
  // report through shapes these patterns do not see — an embedded node script
  // that prints its own PASS lines, and a steps[] report — and printing a
  // confident 0 or 1 for them would be exactly the kind of plausible wrong
  // number this whole programme is about.
  const counted = shell ? (src.match(/\bchk\s+\S/g) ?? []).length
                        : (src.match(/R\.mark\(/g) ?? []).length;
  const emitsOwn = /console\.log\(`\s*\$\{?\w+\}?\s+PASS|steps\.push|steps\[/.test(src);
  const assertions = counted > 1 ? counted : (emitsOwn ? null : counted);
  return {
    exists: true, shell, quota, funds, mutating, assertions,
    // The bucket comes from the shared classifier too: the limiter is PER IP,
    // and these run in two places. The runner's bucket is the one that gates.
    quotaBucket: cost?.bucket ?? null,
    optIn: /BANZAMI_E2E/.test(src),
  };
}

const rows = [];
for (const sid of profile.suites) {
  const suite = suites.find((s) => s.id === sid) ?? { id: sid };
  const inSuite = journeys.filter((j) => j.suite === sid)
    .sort((a, b) => a.journey_id.localeCompare(b.journey_id));
  if (!inSuite.length) {
    rows.push({ suite: sid, name: suite.name_pt ?? sid, journey: '—', harness: '—',
      applicability: suite.runtime_proof === 'NOT_PROVEN' ? 'NOT_PROVEN' : 'NO_JOURNEY',
      blocker: suite.blocker?.class ?? null, actors: [], mutating: null, quota: 0,
      assertions: 0, adapter: '—', retry: '—' });
    continue;
  }
  for (const j of inSuite) {
    const d = describe(j.existing_harness ?? '');
    rows.push({
      suite: sid, name: suite.name_pt ?? sid, journey: j.journey_id,
      harness: j.existing_harness ?? '—',
      applicability: d.exists ? 'EXECUTABLE' : 'HARNESS_MISSING',
      blocker: null, actors: j.actors ?? [],
      mutating: d.mutating, quota: d.quota, quotaBucket: d.quotaBucket, funds: d.funds,
      assertions: d.assertions,
      adapter: j.evidence_adapter ?? 'gate-report',
      retry: j.retry_policy ?? 'none',
      optIn: d.optIn,
    });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ profile: profile.id, rows }, null, 2));
  process.exit(0);
}

const quota = rows.reduce((n, r) => n + (r.quota ?? 0), 0);
const quotaRunner = rows.filter((r) => r.quotaBucket === 'runner').length;
const quotaVm = rows.filter((r) => r.quotaBucket === 'vm').length;
const exec = rows.filter((r) => r.applicability === 'EXECUTABLE');
const notProven = rows.filter((r) => r.applicability === 'NOT_PROVEN');
const broken = rows.filter((r) => !['EXECUTABLE', 'NOT_PROVEN'].includes(r.applicability));

console.log(`\n${profile.id} v${profile.version} — prospective plan\n`);
console.log('SUITE JOURNEY        ADAPTER        MUT QUOTA ASRT ACTORS      HARNESS');
for (const r of rows) {
  if (r.applicability !== 'EXECUTABLE') {
    console.log(`${r.suite.padEnd(5)} ${'—'.padEnd(14)} ${r.applicability}${r.blocker ? ` · ${r.blocker}` : ''}  ${r.name}`);
    continue;
  }
  console.log(
    `${r.suite.padEnd(5)} ${r.journey.padEnd(14)} ${r.adapter.padEnd(14)} ` +
    `${(r.mutating ? 'yes' : 'no ')} ${String(r.quota).padStart(5)} ${String(r.assertions ?? '  ?').padStart(4)} ` +
    `${(r.actors.join(',') || '—').padEnd(11)} ${r.harness.replace(/^tools\/e2e\/|^tests\//, '')}`);
}
console.log(`\n  executable journeys        ${exec.length}`);
console.log(`  suites not runtime-proven  ${notProven.length} (${notProven.map((r) => r.suite).join(', ') || '—'})`);
console.log(`  APPLICATION-SUBMIT COST    ${quota}   (per-IP 30/24h window)`);
console.log(`    from the runner's IP     ${quotaRunner}   ← the bucket that gates a run`);
console.log(`    from the Sandbox VM's IP ${quotaVm}`);
console.log(`  declared credit ceiling    ${Number(profile.budget?.max_credit_volume_minor ?? 0).toLocaleString('pt-PT')} minor`);
console.log(`  journeys that move money   ${exec.filter((r) => r.funds).length}`);
if (broken.length) {
  console.log(`\n  ✗ ${broken.length} journey(s) name a harness that does not exist`);
  process.exit(1);
}
console.log('');
