#!/usr/bin/env node
/**
 * validation-runner — the Banzami Validation Studio execution plane.
 *
 * PHASE D. admin-api queues a run; this claims it and does the work. The two
 * are deliberately separate processes: a request handler that runs a test suite
 * times out halfway through one and leaves a run whose real state nobody knows
 * (doc 23, BANZADMIN_AS_LONG_RUNNING_TEST_ENGINE=0).
 *
 * It does not reimplement validation. Every journey names an existing, proven
 * harness; this orchestrates them, ingests their gates as assertions, records
 * evidence, and moves the run through its state machine.
 *
 * ENVIRONMENT. The Sandbox is the only place this may act. That is asserted
 * before the first state-changing call, from the database itself, and the run
 * row is re-checked too — a runner that cannot prove where it is must not act.
 *
 * SECRETS. None are read, held or written here. State reaches the database
 * through the operator's existing access path on the Sandbox host, so the
 * credentials never leave it.
 *
 *   node tools/validation-runner.mjs --claim            lease and execute the next QUEUED run
 *   node tools/validation-runner.mjs --run BZV-…        execute one specific QUEUED run
 *   node tools/validation-runner.mjs --dry-run          resolve the plan, execute nothing
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const HOST = process.env.BANZAMI_SANDBOX_HOST || 'root@217.160.9.248';
const PG = process.env.BANZAMI_SANDBOX_PG || 'bzsandbox-20260708184104-1708617-23807-postgres-1';

/** The one database this runner may touch. Named, not defaulted. */
const DATABASE = 'banzami_staging';
/** The one environment. A run row claiming anything else is refused. */
const ENVIRONMENT = 'SANDBOX';

const EXECUTOR = `runner-${randomUUID().slice(0, 8)}`;
const LEASE_SECONDS = 900;
const HEARTBEAT_SECONDS = 30;
const DEFAULT_TIMEOUT_MS = 12 * 60 * 1000;

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? true) : undefined;
};
const DRY = process.argv.includes('--dry-run');

/* ── database access, through the operator path ─────────────────────────── */

/**
 * Run SQL on the Sandbox database. The statement is base64-encoded so no
 * quoting survives the trip through ssh and the shell, which is where this kind
 * of tooling usually breaks in ways that look like data problems.
 */
function sql(statement, { rows = true } = {}) {
  const b64 = Buffer.from(statement, 'utf8').toString('base64');
  const remote =
    `echo ${b64} | base64 -d | docker exec -i ${PG} sh -lc ` +
    `'PGPASSWORD=$(cat "$POSTGRES_PASSWORD_FILE") psql -U "$POSTGRES_USER" -d ${DATABASE} -At -F"\\t" -v ON_ERROR_STOP=1'`;
  const out = execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, remote], {
    encoding: 'utf8', maxBuffer: 1 << 26,
  });
  if (!rows) return out;
  return out.split('\n').filter(Boolean).map((l) => l.split('\t'));
}

/** A SQL string literal. Everything user-or-harness supplied goes through this. */
const lit = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const jsonb = (o) => `${lit(JSON.stringify(o))}::jsonb`;

/* ── environment proof ──────────────────────────────────────────────────── */

function proveEnvironment() {
  const [[db]] = sql('SELECT current_database();');
  if (db !== DATABASE) {
    die(`refusing to act: connected to ${db}, expected ${DATABASE}`);
  }
  const [[live]] = sql(
    `SELECT count(*) FROM validation_runs WHERE environment <> ${lit(ENVIRONMENT)};`);
  if (Number(live) !== 0) {
    die(`refusing to act: ${live} run(s) declare an environment other than ${ENVIRONMENT}`);
  }
  log(`environment proven: ${DATABASE} · every run is ${ENVIRONMENT}`);
}

/* ── registry ───────────────────────────────────────────────────────────── */

function readRegistry(name) {
  return JSON.parse(execFileSync('python3', [
    '-c', 'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
    join(ROOT, `quality/validation/${name}.yaml`),
  ], { encoding: 'utf8', maxBuffer: 1 << 24 }));
}

/** The journeys a profile would execute, in a deterministic order. */
function planFor(profileID) {
  const profiles = readRegistry('profiles').profiles ?? [];
  const profile = profiles.find((p) => p.id === profileID);
  if (!profile) die(`unknown profile ${profileID}`);

  const suites = readRegistry('suites').suites ?? [];
  const journeys = readRegistry('journeys').journeys ?? [];
  const blocking = new Set([
    ...suites.filter((s) => s.blocking).map((s) => s.id),
    ...(profile.escalate_blocking ?? []),
  ]);

  const plan = [];
  for (const suiteID of profile.suites) {
    const inSuite = journeys
      .filter((j) => j.suite === suiteID)
      .sort((a, b) => a.journey_id.localeCompare(b.journey_id));
    for (const j of inSuite) {
      plan.push({
        journey: j.journey_id,
        suite: suiteID,
        name: j.name,
        harness: j.existing_harness ?? null,
        timeoutMs: (j.timeout_seconds ?? 720) * 1000,
        retries: j.retry_policy === 'none' ? 0 : (j.infrastructure_retries ?? 0),
        blocking: blocking.has(suiteID),
      });
    }
  }
  return { profile, plan, blocking };
}

/* ── harness execution ──────────────────────────────────────────────────── */

/**
 * Run one harness and return its gates.
 *
 * A harness is a process that exits non-zero on failure and writes an evidence
 * file of named gates. Both are used: the exit status decides the journey, and
 * the gates become the assertions. A harness that passes its exit status but
 * reports a failing gate is still a failure — the finer signal wins.
 */
export function runHarness(harness, timeoutMs) {
  const script = join(ROOT, harness);
  if (!existsSync(script)) {
    return { ok: false, reason: `harness not found: ${harness}`, gates: [], durationMs: 0 };
  }
  const cwd = resolve(script, '..', '..');
  const before = Date.now();
  const res = spawnSync('node', [script], {
    cwd: harness.includes('tools/e2e/app-web/') ? join(ROOT, 'tools/e2e/app-web') : cwd,
    encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1 << 26,
    env: { ...process.env, BANZAMI_VALIDATION_RUN: '1' },
  });
  const durationMs = Date.now() - before;

  if (res.error && res.error.code === 'ETIMEDOUT') {
    return { ok: false, reason: `timed out after ${Math.round(timeoutMs / 1000)}s`, gates: [], durationMs, stdout: res.stdout ?? '' };
  }

  const gates = harvestGates(harness, before);
  // A gate is PASS, FAIL or NOTE. A NOTE is a recorded measurement, not an
  // assertion — treating it as a failure would fail every harness that writes
  // down a number.
  const gateFailures = gates.filter((g) => g.verdict === 'FAIL');
  const assertions = gates.filter((g) => g.verdict === 'PASS' || g.verdict === 'FAIL');
  // A harness that exits 0 but recorded NOTHING has not proved anything, and a
  // run built out of such journeys is green by executing nothing — the exact
  // outcome this programme exists to make impossible. Evidence is harvested by
  // matching the harness stem, so a renamed reporter fails HERE, loudly, rather
  // than passing silently with an empty assertion set.
  const ok = res.status === 0 && gateFailures.length === 0 && assertions.length > 0;
  const reason = res.status !== 0
    ? `exit ${res.status}`
    : gateFailures.length ? `${gateFailures.length} gate(s) failed`
    : assertions.length === 0 ? 'harness recorded no assertions (no evidence harvested)'
    : '';

  return { ok, reason, gates, durationMs, stdout: (res.stdout ?? '') + (res.stderr ?? '') };
}

/**
 * Find the evidence file the harness just wrote. Harnesses write under a
 * per-revision assurance directory with a millisecond suffix, so the newest
 * file whose name matches and whose mtime is after the run started is the one.
 */
function harvestGates(harness, startedAt) {
  const base = process.env.TMPDIR ? join(process.env.TMPDIR, 'banzami-assurance') : '/tmp/banzami-assurance';
  if (!existsSync(base)) return [];
  const stem = harness.split('/').pop().replace(/\.mjs$/, '');
  const found = [];
  const walk = (dir, depth = 0) => {
    if (depth > 3) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name.startsWith(stem) && e.name.endsWith('.json')) {
        const st = statSync(p);
        if (st.mtimeMs >= startedAt - 2000) found.push({ p, m: st.mtimeMs });
      }
    }
  };
  try { walk(base); } catch { return []; }
  if (!found.length) return [];
  found.sort((a, b) => b.m - a.m);
  try {
    const doc = JSON.parse(readFileSync(found[0].p, 'utf8'));
    return (doc.gates ?? []).map((g) => ({
      gate: g.gate, verdict: g.verdict, detail: g.detail ?? '',
      file: found[0].p,
      sha256: createHash('sha256').update(readFileSync(found[0].p)).digest('hex'),
    }));
  } catch { return []; }
}

/* ── the run loop ───────────────────────────────────────────────────────── */

function claim(runRef) {
  const where = runRef
    ? `run_ref = ${lit(runRef)} AND state = 'QUEUED'`
    : `state = 'QUEUED'`;
  const [row] = sql(`
    UPDATE validation_runs SET
      state = 'RUNNING', started_at = now(), executor_id = ${lit(EXECUTOR)},
      lease_expires_at = now() + interval '${LEASE_SECONDS} seconds', heartbeat_at = now()
    WHERE id = (SELECT id FROM validation_runs WHERE ${where}
                ORDER BY requested_at LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING id::text, run_ref, profile_id, environment;`) ?? [];
  if (!row) return null;
  const [id, ref, profile, environment] = row;
  if (environment !== ENVIRONMENT) die(`claimed run ${ref} declares ${environment}`);
  event(id, 'QUEUED', 'RUNNING', `claimed by ${EXECUTOR}`);
  return { id, ref, profile };
}

function event(runID, from, to, reason) {
  sql(`INSERT INTO validation_run_events (run_id, seq, from_state, to_state, reason)
       SELECT ${lit(runID)}::uuid,
              COALESCE((SELECT max(seq) FROM validation_run_events WHERE run_id = ${lit(runID)}::uuid), 0) + 1,
              ${lit(from)}, ${lit(to)}, ${lit(reason)};`, { rows: false });
}

const heartbeat = (runID) => sql(
  `UPDATE validation_runs SET heartbeat_at = now(),
     lease_expires_at = now() + interval '${LEASE_SECONDS} seconds'
   WHERE id = ${lit(runID)}::uuid;`, { rows: false });

const stateOf = (runID) => (sql(`SELECT state FROM validation_runs WHERE id = ${lit(runID)}::uuid;`)[0] ?? ['?'])[0];

function main() {
  proveEnvironment();

  const profileArg = arg('--profile');
  if (DRY) {
    const { profile, plan } = planFor(typeof profileArg === 'string' ? profileArg : 'GOLDEN');
    log(`plan for ${profile.id} v${profile.version}: ${plan.length} journey(s)`);
    for (const p of plan) {
      log(`  ${p.suite}  ${p.journey}  ${p.harness ?? 'NO HARNESS'}${p.blocking ? '  [blocking]' : ''}`);
    }
    const missing = plan.filter((p) => !p.harness).length;
    const suitesWithNone = profile.suites.filter((s) => !plan.some((p) => p.suite === s));
    log(`\n  journeys without a harness: ${missing}`);
    log(`  suites with no journey at all: ${suitesWithNone.length} (${suitesWithNone.join(', ') || '—'})`);
    return;
  }

  const runRef = typeof arg('--run') === 'string' ? arg('--run') : null;
  const run = claim(runRef);
  if (!run) { log('no QUEUED run to claim'); return; }
  log(`claimed ${run.ref} (${run.profile}) as ${EXECUTOR}`);

  const { profile, plan } = planFor(run.profile);
  const beat = setInterval(() => { try { heartbeat(run.id); } catch { /* next tick */ } }, HEARTBEAT_SECONDS * 1000);

  let failedBlocking = 0, passed = 0, failed = 0, skipped = 0;
  try {
    // The plan is materialised first, so a run always says what it INTENDED to
    // do — even if it is cancelled after the second journey.
    for (const p of plan) {
      sql(`INSERT INTO validation_run_journeys (run_id, journey_id, suite_id, outcome)
           VALUES (${lit(run.id)}::uuid, ${lit(p.journey)}, ${lit(p.suite)}, 'PLANNED')
           ON CONFLICT (run_id, journey_id) DO NOTHING;`, { rows: false });
    }

    for (const p of plan) {
      if (stateOf(run.id) === 'CANCELLED') { log('cancelled; stopping'); break; }

      if (!p.harness) {
        // Not a failure and not a pass. A journey with nothing to run is
        // UNAVAILABLE, and saying so is the whole point.
        mark(run.id, p, 'UNAVAILABLE', 'no harness declared for this journey');
        skipped++;
        log(`  ${p.journey}  UNAVAILABLE (no harness)`);
        continue;
      }

      log(`  ${p.journey}  running ${p.harness}…`);
      sql(`UPDATE validation_run_journeys SET outcome='OBSERVED', started_at=now()
           WHERE run_id=${lit(run.id)}::uuid AND journey_id=${lit(p.journey)};`, { rows: false });

      const r = runHarness(p.harness, p.timeoutMs);
      for (const g of r.gates) recordGate(run.id, p, g);

      const outcome = r.ok ? 'PASSED' : 'FAILED';
      const asserted = r.gates.filter((g) => g.verdict !== 'NOTE').length;
      mark(run.id, p, outcome,
        r.ok ? `${asserted} assertions, ${r.gates.length - asserted} measurements` : r.reason);
      if (r.ok) passed++; else { failed++; if (p.blocking) failedBlocking++; }
      log(`  ${p.journey}  ${outcome}  ${Math.round(r.durationMs / 1000)}s  ${r.reason}`);
    }

    const state = stateOf(run.id);
    if (state === 'CANCELLED') { log('run was cancelled'); return; }

    const verdict = failedBlocking === 0 && failed === 0 ? 'PASS' : 'FAIL';
    sql(`UPDATE validation_runs SET state='COMPLETED', verdict=${lit(verdict)}, ended_at=now()
         WHERE id=${lit(run.id)}::uuid;`, { rows: false });
    event(run.id, 'RUNNING', 'COMPLETED',
      `${passed} passed, ${failed} failed (${failedBlocking} blocking), ${skipped} unavailable`);
    log(`\n${run.ref} COMPLETED ${verdict} — ${passed} passed / ${failed} failed / ${skipped} unavailable`);
  } catch (e) {
    // A crashed executor must not leave a run claiming to be RUNNING forever.
    sql(`UPDATE validation_runs SET state='ABANDONED', ended_at=now()
         WHERE id=${lit(run.id)}::uuid AND state='RUNNING';`, { rows: false });
    event(run.id, 'RUNNING', 'ABANDONED', `executor failed: ${String(e.message).slice(0, 180)}`);
    log(`\n${run.ref} ABANDONED — ${e.message}`);
    process.exitCode = 1;
  } finally {
    clearInterval(beat);
  }
}

function mark(runID, p, outcome, detail) {
  sql(`UPDATE validation_run_journeys SET outcome=${lit(outcome)}, detail=${lit(detail)}, ended_at=now()
       WHERE run_id=${lit(runID)}::uuid AND journey_id=${lit(p.journey)};`, { rows: false });
}

/** One harness gate becomes one evidence row. The artifact is referenced by
 *  path and hash; its content is never inlined into the database. */
function recordGate(runID, p, g) {
  sql(`INSERT INTO validation_evidence (run_id, journey_id, kind, uri, sha256, redaction)
       VALUES (${lit(runID)}::uuid, ${lit(p.journey)}, 'LOG',
               ${lit(`${p.harness}#${g.gate}=${g.verdict}`)}, ${lit(g.sha256)}, 'NOT_REQUIRED');`,
    { rows: false });
}

const log = (m) => console.log(m);
function die(m) { console.error(`validation-runner: ${m}`); process.exit(2); }

// Importable so the harvest/verdict contract can be proven without a Sandbox
// run; executing it still takes the same path it always did.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
