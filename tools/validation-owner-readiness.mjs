#!/usr/bin/env node
/**
 * validation-owner-readiness — every gate, from live sources, in one place.
 *
 * Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase D).
 *
 * No hand-maintained summary may override this. A prose counter already
 * contradicted itself once — "10 de 12" beside a list of three outstanding
 * journeys — and neither number was checkable. Everything here is read at the
 * moment it is printed.
 *
 *   node tools/validation-owner-readiness.mjs [--profile GOLDEN|FULL]
 *
 * The profile used to be hardcoded to GOLDEN while --profile was accepted and
 * silently ignored — the same shape of defect as a runner that executes an
 * unknown flag. An owner gate that answers a question you did not ask is worse
 * than one that refuses.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { submitCapacity, runnerBucket, vmBucket, aggregateFunds,
         plannedPeakFunds, requiredFundsHeadroom } from './lib/validation-capacity.mjs';
import { workspaceLimits, workspaceConsumption, workspaceUsage, withKnownActors,
         retryReserve, activeHeadroom, creationHeadroom,
         earliestSufficient } from './lib/validation-workspace-capacity.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => { try { execFileSync(cmd, args, { cwd: repo, stdio: 'pipe' }); return true; } catch { return false; } };
const load = (n) => JSON.parse(execFileSync('python3', [
  '-c', 'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
  join(repo, `quality/validation/${n}.yaml`)], { encoding: 'utf8', maxBuffer: 1 << 24 }));

const PROFILES = ['GOLDEN', 'FULL'];
const flag = process.argv.indexOf('--profile');
if (flag >= 0 && !PROFILES.includes(process.argv[flag + 1])) {
  console.error(`validation-owner-readiness: --profile must be one of ${PROFILES.join(', ')}`);
  process.exit(2);
}
for (const a of process.argv.slice(2)) {
  if (a !== '--profile' && !PROFILES.includes(a)) {
    console.error(`validation-owner-readiness: unknown option ${a}`);
    process.exit(2);
  }
}
const PROFILE = flag >= 0 ? process.argv[flag + 1] : 'GOLDEN';

const rows = [];
const notes = [];
const gate = (name, ok, detail) => { rows.push({ name, ok, detail }); };

// ── gates that are guards ────────────────────────────────────────────────────
gate('RUNNER_REGRESSION_GATES', run('node', ['tools/check-validation-runner-regressions.mjs']), '');
gate('HARNESS_REGRESSION_GATES', run('node', ['tools/check-e2e-harness-regressions.mjs']), '');
gate('SHELL_ADAPTER_GATES', run('node', ['tools/check-validation-shell-adapter.mjs']), '');
gate('BUDGET_TRUTH_GATES', run('node', ['tools/check-validation-budget-truth.mjs']), '');
// One tool answers both: a journey counts only if it PASSED and nothing it
// exercises has been deployed since, and its harness is byte-identical to the
// one recorded against that evidence.
gate('ASSURANCE_ADAPTER_GATES', run('node', ['tools/check-validation-assurance-adapter.mjs']), 'VD-008');
gate('CLEANUP_BARRIER_GATES', run('node', ['tools/check-validation-cleanup-barrier.mjs']), 'VD-009');
// Preverification asks: is every journey ALREADY known to pass standalone
// against the build that is deployed right now? For GOLDEN that is a start
// gate, and a cheap one — twelve journeys whose evidence exists.
//
// For FULL it is not a gate and must not be made one. FULL's own claim is that
// every suite was exercised and its result recorded "including the ones that
// failed"; requiring all 38 to be pre-proven would mean running FULL to earn
// the right to run FULL, and would quietly convert a discovery run into a
// confirmation run. The provenance half still applies to whatever evidence
// does exist — a stale PASS is a wrong answer at any profile.
const matrixOk = run('node', ['tools/validation-preverification-matrix.mjs', PROFILE]);
if (PROFILE === 'GOLDEN') {
  gate('GOLDEN_JOURNEYS_PREVERIFIED', matrixOk, 'every journey FRESH PASS against the deployed build');
  gate('PREVERIFICATION_PROVENANCE_MATCH', matrixOk,
    'no relevant component deployed since the evidence; harness unchanged');
} else {
  const out = (() => { try {
    return execFileSync('node', [join(repo, 'tools/validation-preverification-matrix.mjs'), PROFILE],
      { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 24 });
  } catch (e) { return String(e.stdout ?? ''); } })();
  const m = out.match(/_JOURNEYS_PREVERIFIED = (\d+)\/(\d+)/);
  // Deduplicated: the tool prints each journey twice, once in the table and
  // once in the summary, and counting raw matches said 18 for 9 journeys.
  const stale = new Set((out.match(/^\s*(S\d\d-[A-Z]+-\d+) .*STALE\(/gm) ?? [])
    .map((l) => l.trim().split(/\s+/)[0])).size;
  // Informational, not a gate. A journey with no standalone evidence is what
  // FULL is FOR, and a journey with stale evidence will be re-executed by the
  // run that is about to happen — FULL makes no pre-run claim about either. It
  // is listed because stale evidence must never be READ as proof, not because
  // it stops anything.
  notes.push(`preverification   ${m ? `${m[1]}/${m[2]}` : '?'} fresh · ${stale} stale · ` +
    'the remainder is what this run exists to determine');
}

// ── capacity: the application-submit limiter, per bucket ─────────────────────
const buckets = submitCapacity();
const rb = runnerBucket(buckets), vb = vmBucket(buckets);
// Read from the plan, per bucket, never summed: twelve free slots across two
// limiters is not eleven free in the one that refuses.
const planCost = JSON.parse(execFileSync('node',
  [join(repo, 'tools/validation-full-plan.mjs'), '--profile', PROFILE, '--json'],
  { encoding: 'utf8', maxBuffer: 1 << 24 })).rows;
const RUNNER_SUBMITS = planCost.filter((r) => r.quotaBucket === 'runner').length;
const VM_SUBMITS = planCost.filter((r) => r.quotaBucket === 'vm').length;
gate('RUNNER_IP_FREE_SLOTS', !!rb && rb.free >= RUNNER_SUBMITS * 2,
  rb ? `${rb.used}/30 used · ${rb.free} free · need ${RUNNER_SUBMITS}+${RUNNER_SUBMITS}=${RUNNER_SUBMITS * 2} · next ${rb.nextFreeAt ?? '—'}`
     : 'the limiter has no record of this machine');
gate('VM_IP_FREE_SLOTS', VM_SUBMITS === 0 || (!!vb && vb.free >= VM_SUBMITS * 2),
  VM_SUBMITS === 0 ? 'this profile spends nothing from the VM'
    : vb ? `${vb.used}/30 used · ${vb.free} free · need ${VM_SUBMITS * 2}` +
           (vb.observed ? '' : ' · no key yet, so nothing spent in this window')
         : 'more than one unidentified bucket — which one is the VM is not known');

// ── capacity: aggregate funded value ─────────────────────────────────────────
const journeys = load('journeys').journeys ?? [];
const profile = (load('profiles').profiles ?? []).find((p) => p.id === PROFILE);
// The RUNNER's own plan resolver, not a second reading of journeys.yaml. This
// built 38 rows where the runner builds 39 — the extra one being the
// placeholder for a suite with no journey — so this gate reported that every
// journey declared a funds ceiling while the runner, resolving the same
// profile, found one that did not and refused mid-claim.
const { planFor } = await import('./validation-runner.mjs');
const plan = planFor(PROFILE).plan;
// Whether the concurrent bound may be used is a property of the DEPLOYED
// schema, read here, never assumed from the fact that the code exists.
const barrier = (() => {
  try {
    const q = Buffer.from(
      "SELECT count(*) FROM information_schema.columns WHERE table_name='validation_run_journeys' " +
      "AND column_name IN ('functional_result','cleanup_result','cleanup_detail');", 'utf8').toString('base64');
    const PGC = process.env.BANZAMI_SANDBOX_PG || 'bzsandbox-20260708184104-1708617-23807-postgres-1';
    return Number(execFileSync('ssh', ['-o', 'BatchMode=yes', process.env.BANZAMI_SANDBOX_HOST || 'root@217.160.9.248',
      `echo ${q} | base64 -d | docker exec -i ${PGC} sh -lc ` +
      `'PGPASSWORD=$(cat "$POSTGRES_PASSWORD_FILE") psql -U "$POSTGRES_USER" -d banzami_staging -Atq'`],
      { encoding: 'utf8' }).trim()) === 3;
  } catch { return false; }
})();
const planned = plannedPeakFunds(plan, null, null, { barrier });
const bound = requiredFundsHeadroom(planned.peak);
gate('CLEANUP_BARRIER_DEPLOYED', barrier || PROFILE !== 'FULL',
  barrier ? 'migration 0161 is applied; the concurrent bound is in force'
          : PROFILE === 'FULL'
            ? 'migration 0161 is NOT applied — FULL would be governed by the cumulative bound '
              + `(${planned.cumulativeExposureBound.toLocaleString('pt-PT')} minor) and the runner refuses to claim it`
            : 'not required for this profile');
const funds = aggregateFunds();
gate('AGGREGATE_FUNDS_PEAK_KNOWN', planned.unknown.length === 0,
  planned.unknown.length
    ? `UNKNOWN: ${planned.unknown.join(', ')}`
    : `${plan.length - planned.inert.length} executable journey(s) declare a ceiling` +
      (planned.inert.length ? ` · ${planned.inert.length} inert row(s) cannot execute: ${planned.inert.join(', ')}` : ''));
gate('AGGREGATE_FUNDS_PREFLIGHT', funds.available >= bound.required,
  `cap ${funds.cap} · used ${funds.used} · available ${funds.available} · ` +
  `peak ${bound.plannedPeakMax} · residual ${bound.failedRunResidualMax} · retry ${bound.retryPeakMax} · required ${bound.required}` +
  ` · bound ${planned.barrier ? 'CONCURRENT' : 'CUMULATIVE'}`);

// ── capacity: Developer workspaces, per actor, as TWO resources ──────────────
//
// Absent until BZV-20260921-0001 was ABANDONED with the shared fixture actor at
// 20/20 creations while this gate printed OPEN. Three resources were watched
// and a fourth was invisible.
//
// ACTIVE and 24H CREATION are reported and gated separately on purpose. One
// aggregated "workspace capacity: PASS" would hide exactly the exhaustion that
// ended that run: archiving frees an ACTIVE place and returns nothing at all to
// the rolling creation window.
const wsGates = (() => {
  const limits = workspaceLimits();
  const reserve = retryReserve(PROFILE);
  const consumption = workspaceConsumption(plan, { barrier });
  let usage;
  try {
    const PGW = process.env.BANZAMI_SANDBOX_PG || 'bzsandbox-20260708184104-1708617-23807-postgres-1';
    const HOSTW = process.env.BANZAMI_SANDBOX_HOST || 'root@217.160.9.248';
    const q = (stmt) => {
      const b64 = Buffer.from(stmt, 'utf8').toString('base64');
      return execFileSync('ssh', ['-o', 'BatchMode=yes', HOSTW,
        `echo ${b64} | base64 -d | docker exec -i ${PGW} sh -lc ` +
        `'PGPASSWORD=$(cat "$POSTGRES_PASSWORD_FILE") psql -U "$POSTGRES_USER" -d banzami_staging -Atq -F"\t" -v ON_ERROR_STOP=1'`],
        { encoding: 'utf8', maxBuffer: 1 << 24 })
        .split('\n').filter(Boolean).map((l) => l.split('\t'));
    };
    usage = withKnownActors(workspaceUsage({ sql: q, windowHours: limits.windowHours ?? 24 }), consumption);
  } catch (e) {
    // A reading that did not happen is not a reading of zero.
    usage = null;
  }
  if (!usage) {
    const closed = { verdict: 'CLOSED', reason: 'UNKNOWN_CAPACITY', detail: 'workspace usage unreadable', actors: [] };
    return { active: closed, creation: closed, limits, reserve, consumption, usage: new Map() };
  }
  return {
    active: activeHeadroom({ usage, consumption, limits, reserve }),
    creation: creationHeadroom({ usage, consumption, limits, reserve }),
    limits, reserve, consumption, usage,
  };
})();

gate('WORKSPACE_ACTIVE_CAPACITY', wsGates.active.verdict === 'OPEN',
  `${wsGates.active.reason ? wsGates.active.reason + ' · ' : ''}${wsGates.active.detail}`);
gate('WORKSPACE_24H_CREATION_CAPACITY', wsGates.creation.verdict === 'OPEN',
  `${wsGates.creation.reason ? wsGates.creation.reason + ' · ' : ''}${wsGates.creation.detail}`);

// ── the deployed system's own state ──────────────────────────────────────────
const HOST = process.env.BANZAMI_SANDBOX_HOST || 'root@217.160.9.248';
const ssh = (cmd) => execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, cmd], { encoding: 'utf8', maxBuffer: 1 << 22 });

try {
  const out = ssh(`. /root/.banzami/validation/a01-lib.sh && a01_session >/dev/null 2>&1 && ` +
    `curl -s -b "$J" 'https://admin.banzami.com/api/admin/v1/validation/preflight?profile=${PROFILE}'`);
  const pf = JSON.parse(out).preflight ?? JSON.parse(out);
  gate('PREFLIGHT', pf.verdict === 'HEALTHY', `verdict ${pf.verdict}`);
} catch (e) { gate('PREFLIGHT', false, `unreadable: ${String(e.message).slice(0, 60)}`); }

try {
  // base64 through ssh, so no quoting survives the trip and breaks in a way that
  // looks like a data problem — the runner learned that one the hard way.
  const q = Buffer.from(
    "SELECT count(*) FROM validation_runs WHERE state IN ('QUEUED','RUNNING');", 'utf8').toString('base64');
  const PGC = process.env.BANZAMI_SANDBOX_PG || 'bzsandbox-20260708184104-1708617-23807-postgres-1';
  const n = Number(ssh(`echo ${q} | base64 -d | docker exec -i ${PGC} sh -lc ` +
    `'PGPASSWORD=$(cat "$POSTGRES_PASSWORD_FILE") psql -U "$POSTGRES_USER" -d banzami_staging -Atq'`).trim());
  gate('ACTIVE_VALIDATION_RUN_COUNT', n === 0, `${n} active`);
} catch (e) { gate('ACTIVE_VALIDATION_RUN_COUNT', false, `unreadable: ${String(e.message).slice(0, 60)}`); }

// PROVENANCE. A run records the revisions of the components it ran against, at
// preparation. Without it a result cannot be attached to a build, which is what
// BZV-20260918-0001 shows by carrying "não capturada" to this day.
try {
  const q = Buffer.from(
    `SELECT count(*) FROM validation_run_provenance p
      WHERE p.run_id = (SELECT id FROM validation_runs ORDER BY updated_at DESC LIMIT 1);`,
    'utf8').toString('base64');
  const PGC2 = process.env.BANZAMI_SANDBOX_PG || 'bzsandbox-20260708184104-1708617-23807-postgres-1';
  const n = Number(ssh(`echo ${q} | base64 -d | docker exec -i ${PGC2} sh -lc ` +
    `'PGPASSWORD=$(cat "$POSTGRES_PASSWORD_FILE") psql -U "$POSTGRES_USER" -d banzami_staging -Atq'`).trim());
  gate('PROVENANCE_CAPTURE', n > 0,
    n > 0 ? `the most recent run captured ${n} component revision(s) at preparation`
          : 'the most recent run captured no component revisions');
} catch (e) { gate('PROVENANCE_CAPTURE', false, `unreadable: ${String(e.message).slice(0, 60)}`); }

const actors = (load('actors').actors ?? []).length;
gate('VALIDATION_ACTORS_HEALTHY', actors === 9, `${actors} registered`);
gate('DEPLOYED_GOLDEN_PARITY', run('node', ['tools/check-deploy-parity.mjs', '--component', 'app-frontend']) ||
  run('sh', ['-c', 'make check-deploy-parity 2>&1 | grep -q "app-frontend.*matches the tree"']),
  'app-frontend artefact matches the tree');

console.log(`\nowner readiness — ${PROFILE} — read live at ${new Date().toISOString()}\n`);
let blocked = 0;
for (const r of rows) {
  if (!r.ok) blocked++;
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name.padEnd(30)} ${r.detail}`);
}
for (const n of notes) console.log(`\n  ${n}`);

// Printed whatever the verdict. A capacity number that only appears when it
// blocks cannot be checked against the system while it is still favourable.
console.log(`\n  workspace capacity — per actor · limits ${wsGates.limits.verdict === 'READ'
  ? `active ${wsGates.limits.activeLimit} · created/${wsGates.limits.windowHours}h ${wsGates.limits.creationLimit24h}`
  : 'UNKNOWN'} · reserve ${wsGates.reserve.verdict === 'DECLARED'
  ? `${wsGates.reserve.model} ×${wsGates.reserve.permittedRetries}` : 'UNKNOWN'}`);
for (const a of wsGates.creation.actors) {
  const act = wsGates.active.actors.find((x) => x.actor === a.actor);
  console.log(`    ${a.kind === 'EPHEMERAL' ? 'ephemeral' : a.actor.slice(0, 8) + '…'}  ` +
    `24h ${a.used}/${a.limit} used · planned ${a.planned} · retry ${a.reserve} · required ${a.required} · ` +
    `free ${a.free} ${a.ok ? '✓' : '✗'}` +
    (act ? `   |  active ${act.used}/${act.limit} · concurrent ${act.need} · required ${act.required} ${act.ok ? '✓' : '✗'}` : ''));
  if (!a.ok) {
    const live = wsGates.usage.get(a.actor);
    const when = live ? earliestSufficient({ creations: live.creations, used: a.used,
      limit: a.limit, required: a.required, windowHours: wsGates.limits.windowHours ?? 24 }) : null;
    console.log(`      ${when?.insufficient
      ? 'the window cannot supply this even when every current creation ages out'
      : when?.at ? `would open at ${when.at} if nothing else is created — a FORECAST, not an authorisation`
      : 'no forecast available'}`);
    console.log(`      journeys: ${a.journeys.map((j) => `${j.journey}×${j.creations}`).join(' ')}`);
  }
}
console.log(`\n  VM bucket: ${vb ? `${vb.used}/30 used · ${vb.free} free` : 'not tracked (0 spent)'}`);
console.log(blocked === 0
  ? '\n  OWNER_GATE = OPEN\n'
  : `\n  OWNER_GATE = CLOSED (${blocked} gate(s) not satisfied)\n`);
process.exit(blocked === 0 ? 0 : 1);
