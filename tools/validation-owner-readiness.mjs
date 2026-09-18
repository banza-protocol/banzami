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
 *   node tools/validation-owner-readiness.mjs
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { submitCapacity, runnerBucket, vmBucket, aggregateFunds,
         plannedPeakFunds, requiredFundsHeadroom } from './lib/validation-capacity.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => { try { execFileSync(cmd, args, { cwd: repo, stdio: 'pipe' }); return true; } catch { return false; } };
const load = (n) => JSON.parse(execFileSync('python3', [
  '-c', 'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
  join(repo, `quality/validation/${n}.yaml`)], { encoding: 'utf8', maxBuffer: 1 << 24 }));

const rows = [];
const gate = (name, ok, detail) => { rows.push({ name, ok, detail }); };

// ── gates that are guards ────────────────────────────────────────────────────
gate('RUNNER_REGRESSION_GATES', run('node', ['tools/check-validation-runner-regressions.mjs']), '');
gate('HARNESS_REGRESSION_GATES', run('node', ['tools/check-e2e-harness-regressions.mjs']), '');
gate('SHELL_ADAPTER_GATES', run('node', ['tools/check-validation-shell-adapter.mjs']), '');
gate('BUDGET_TRUTH_GATES', run('node', ['tools/check-validation-budget-truth.mjs']), '');
gate('GOLDEN_JOURNEYS_PREVERIFIED', run('node', ['tools/validation-preverification-matrix.mjs']), '12/12 required');

// ── capacity: the application-submit limiter, per bucket ─────────────────────
const buckets = submitCapacity();
const rb = runnerBucket(buckets), vb = vmBucket(buckets);
const GOLDEN_SUBMITS = 4, RETRY = 4;
gate('RUNNER_IP_FREE_SLOTS', !!rb && rb.free >= GOLDEN_SUBMITS + RETRY,
  rb ? `${rb.used}/30 used · ${rb.free} free · need ${GOLDEN_SUBMITS}+${RETRY}=${GOLDEN_SUBMITS + RETRY} · next ${rb.nextFreeAt ?? '—'}`
     : 'the limiter has no record of this machine');

// ── capacity: aggregate funded value ─────────────────────────────────────────
const journeys = load('journeys').journeys ?? [];
const profile = (load('profiles').profiles ?? []).find((p) => p.id === 'GOLDEN');
const plan = journeys.filter((j) => profile.suites.includes(j.suite))
  .map((j) => ({ journey: j.journey_id, max_synthetic_funds_exposure_minor: j.max_synthetic_funds_exposure_minor }));
const planned = plannedPeakFunds(plan);
const bound = requiredFundsHeadroom(planned.peak);
const funds = aggregateFunds();
gate('AGGREGATE_FUNDS_PEAK_KNOWN', planned.unknown.length === 0,
  planned.unknown.length ? `UNKNOWN: ${planned.unknown.join(', ')}` : `all ${plan.length} journeys declare a ceiling`);
gate('AGGREGATE_FUNDS_PREFLIGHT', funds.available >= bound.required,
  `cap ${funds.cap} · used ${funds.used} · available ${funds.available} · ` +
  `peak ${bound.plannedPeakMax} · residual ${bound.failedRunResidualMax} · retry ${bound.retryPeakMax} · required ${bound.required}`);

// ── the deployed system's own state ──────────────────────────────────────────
const HOST = process.env.BANZAMI_SANDBOX_HOST || 'root@217.160.9.248';
const ssh = (cmd) => execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, cmd], { encoding: 'utf8', maxBuffer: 1 << 22 });

try {
  const out = ssh(`. /root/.banzami/validation/a01-lib.sh && a01_session >/dev/null 2>&1 && ` +
    `curl -s -b "$J" 'https://admin.banzami.com/api/admin/v1/validation/preflight?profile=GOLDEN'`);
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

const actors = (load('actors').actors ?? []).length;
gate('VALIDATION_ACTORS_HEALTHY', actors === 9, `${actors} registered`);
gate('DEPLOYED_GOLDEN_PARITY', run('node', ['tools/check-deploy-parity.mjs', '--component', 'app-frontend']) ||
  run('sh', ['-c', 'make check-deploy-parity 2>&1 | grep -q "app-frontend.*matches the tree"']),
  'app-frontend artefact matches the tree');

console.log(`\nowner readiness — read live at ${new Date().toISOString()}\n`);
let blocked = 0;
for (const r of rows) {
  if (!r.ok) blocked++;
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name.padEnd(30)} ${r.detail}`);
}
console.log(`\n  VM bucket: ${vb ? `${vb.used}/30 used · ${vb.free} free` : 'not tracked (0 spent)'}`);
console.log(blocked === 0
  ? '\n  OWNER_GATE = OPEN\n'
  : `\n  OWNER_GATE = CLOSED (${blocked} gate(s) not satisfied)\n`);
process.exit(blocked === 0 ? 0 : 1);
