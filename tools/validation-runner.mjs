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
import { parseSuiteSummary } from './e2e/lib/parse-suite-summary.mjs';

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
  // A REAL tab, not the two characters \ and t. The previous spelling sent psql
  // a literal backslash-t as its field separator, so every multi-column row came
  // back as one unsplit field — invisible for as long as every query returned a
  // single column, and then a claimed run reported `undefined`.
  //
  // -q suppresses the command tag: psql prints `UPDATE 1` after a RETURNING, and
  // -t does not remove it. It arrived as a phantom row with one field.
  const remote =
    `echo ${b64} | base64 -d | docker exec -i ${PG} sh -lc ` +
    `'PGPASSWORD=$(cat "$POSTGRES_PASSWORD_FILE") psql -U "$POSTGRES_USER" -d ${DATABASE} -Atq -F"${SEP}" -v ON_ERROR_STOP=1'`;
  const out = execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, remote], {
    encoding: 'utf8', maxBuffer: 1 << 26,
  });
  if (!rows) return out;
  return out.split('\n').filter(Boolean).map((l) => l.split(SEP));
}

/** The field separator, defined once so the query and the parse cannot disagree. */
const SEP = '\t';

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
  // The transport proves itself before anything depends on it. A separator that
  // does not separate produced a run stuck in RUNNING with no executor; the
  // cheapest place to catch that class is the first multi-column round trip,
  // not the one that mutates a row.
  const [probe] = sql("SELECT 'a', 'b', 'c';");
  if (!probe || probe.length !== 3 || probe[2] !== 'c') {
    die(`refusing to act: the database transport does not split columns (got ${JSON.stringify(probe)})`);
  }
  log(`environment proven: ${DATABASE} · every run is ${ENVIRONMENT} · transport splits columns`);
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

    // A suite with no journey must still appear in the run's own record. If it
    // simply produced no rows, a FULL result would list twenty suites and never
    // mention the four it could not prove — and a reader would have no way to
    // tell that from a FULL that covered everything. The blocker travels with
    // it, so the omission is readable without the registry to hand.
    if (inSuite.length === 0) {
      const suite = suites.find((x) => x.id === suiteID) ?? {};
      const b = suite.blocker ?? {};
      plan.push({
        journey: `${suiteID}-NOT-PROVEN`,
        suite: suiteID,
        name: suite.name ?? suiteID,
        harness: null,
        notProven: suite.runtime_proof === 'NOT_PROVEN'
          ? `${b.class}: ${String(b.detail ?? '').replace(/\s+/g, ' ').trim().slice(0, 400)}`
          : 'no journey declared and no blocker recorded',
        timeoutMs: 0,
        retries: 0,
        blocking: blocking.has(suiteID),
      });
      continue;
    }

    for (const j of inSuite) {
      plan.push({
        journey: j.journey_id,
        suite: suiteID,
        name: j.name,
        harness: j.existing_harness ?? null,
        adapter: j.evidence_adapter ?? null,
        args: j.harness_args ?? [],
        evidenceStem: j.evidence_stem ?? null,
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
 * The two harness kinds, and the only two shapes a declared harness may take.
 *
 * NODE   tools/e2e/app-web/proofs/NN-name.mjs   runs here, writes a gate file
 * SHELL  tests/phase0/name.sh                   runs ON the Sandbox VM, where
 *                                               the container secrets are
 *
 * A shell harness needs the Sandbox host's own docker socket and secret files,
 * so it cannot run from this machine. That is the only reason it is executed
 * remotely, and the remote path is built entirely from these two literals plus
 * a basename this regex already proved is `[a-z0-9-]+`. No registry string, no
 * API input and no harness output is ever interpolated into a shell command.
 */
const NODE_HARNESS = /^tools\/e2e\/[a-z0-9-]+\/(?:proofs\/)?[0-9a-z-]+\.mjs$/;
const SHELL_HARNESS = /^tests\/phase0\/[a-z0-9-]+\.sh$/;

/** The secret shapes that must never reach a log or an evidence row. */
const SECRET_PATTERNS = [
  /bz_(test|live)_sk_[A-Za-z0-9]+/g,
  /\b\d{6}\b(?!\s*(?:minor|Kz|kz|AOA))/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /__Host-bz_[a-z_]+=[^;\s]+/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, // JWTs
];
/** Structural, not a matter of operator discipline: every captured byte passes here. */
export function scrub(text) {
  let s = String(text ?? '');
  for (const re of SECRET_PATTERNS) s = s.replace(re, '‹redacted›');
  return s;
}

/**
 * Execute one shell harness on the Sandbox VM and adapt its output to gates.
 *
 * The harness is SHIPPED FROM THIS WORKING TREE for every run, into a
 * run-scoped directory. The VM already holds copies of some of these scripts
 * from previous sessions; executing those would mean nobody can say what bytes
 * actually ran. The file's own sha256 is recorded with the result.
 *
 * Its assertions are read from the convention every phase-0 harness shares —
 * `  TOKEN PASS (detail)` / `  TOKEN FAIL (…)` — and CROSS-CHECKED against the
 * harness's own `NAME: PASS=n FAIL=n` summary. A mismatch is a failure: it
 * means the adapter did not understand the harness, and a misunderstood harness
 * must not be reported as proof.
 */
export function runShellHarness(harness, timeoutMs, runRef = 'adhoc') {
  const script = join(ROOT, harness);
  if (!SHELL_HARNESS.test(harness)) {
    return { ok: false, reason: `not an allow-listed shell harness: ${harness}`, gates: [], durationMs: 0 };
  }
  if (!existsSync(script)) {
    return { ok: false, reason: `harness not found: ${harness}`, gates: [], durationMs: 0 };
  }
  const base = harness.split('/').pop();
  const sha256 = createHash('sha256').update(readFileSync(script)).digest('hex');
  const remoteDir = `/tmp/banzami-validation/${runRef.replace(/[^A-Za-z0-9-]/g, '')}`;
  const before = Date.now();

  try {
    // lib/ comes with it: every phase-0 harness sources e2e-run.sh for the
    // ownership and return-what-you-took discipline.
    execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, `mkdir -p ${remoteDir}/lib`], { stdio: 'ignore' });
    execFileSync('scp', ['-o', 'BatchMode=yes', '-q',
      join(ROOT, 'tests/phase0/lib/e2e-run.sh'),
      join(ROOT, 'tests/phase0/lib/synthetic-tenant.sh'),
      `${HOST}:${remoteDir}/lib/`], { stdio: 'ignore' });
    execFileSync('scp', ['-o', 'BatchMode=yes', '-q', script, `${HOST}:${remoteDir}/`], { stdio: 'ignore' });
  } catch (e) {
    return { ok: false, reason: `could not stage harness on the Sandbox host: ${e.message}`, gates: [], durationMs: Date.now() - before };
  }

  const seconds = Math.ceil(timeoutMs / 1000);
  const res = spawnSync('ssh', ['-o', 'BatchMode=yes', HOST,
    // `timeout` on the remote side too: killing the ssh client leaves the
    // harness running on the VM, holding fixtures it will never return.
    `cd ${remoteDir} && timeout ${seconds} bash ${base}`,
  ], { encoding: 'utf8', timeout: timeoutMs + 30_000, maxBuffer: 1 << 26 });

  const durationMs = Date.now() - before;
  const stdout = scrub((res.stdout ?? '') + (res.stderr ?? ''));
  const parsed = parseShellGates(stdout, sha256);

  if (res.status === 124) {
    return { ok: false, reason: `timed out after ${seconds}s`, gates: parsed.gates, durationMs, stdout };
  }
  if (parsed.mismatch) {
    return { ok: false, reason: parsed.mismatch, gates: parsed.gates, durationMs, stdout };
  }
  const failures = parsed.gates.filter((g) => g.verdict === 'FAIL');
  const assertions = parsed.gates.filter((g) => g.verdict !== 'NOTE');
  const ok = res.status === 0 && failures.length === 0 && assertions.length > 0;
  const reason = res.status !== 0
    ? `exit ${res.status}`
    : failures.length ? `${failures.length} assertion(s) failed`
    : assertions.length === 0 ? 'harness recorded no assertions (no PASS/FAIL lines)'
    : '';
  return { ok, reason, gates: parsed.gates, durationMs, stdout };
}

/**
 * Adapt phase-0 stdout to gates, and refuse to guess.
 *
 * The SUMMARY LINE is not re-parsed here. `tools/e2e/lib/parse-suite-summary`
 * is the repository's one reader of that contract, written after a release gate
 * grepped for "FAIL" and reported four green suites as failures because the
 * substring is the LABEL OF THE ZERO. A second parser would be a second chance
 * to make that mistake, so this calls it — and its `blocked` handling comes
 * along, which matters: a blocked assertion is not a pass.
 *
 * What is added here is the per-assertion read, and the reconciliation between
 * the two. If what this parsed disagrees with what the harness counted, the
 * adapter is wrong about this harness and says so rather than reporting a
 * confident subset.
 */
export function parseShellGates(stdout, sha256 = null) {
  const gates = [];
  for (const line of stdout.split('\n')) {
    const m = line.match(/^\s{2,}(\S+)\s+(PASS|FAIL)\b\s*(.*)$/);
    if (!m) continue;
    gates.push({ gate: m[1], verdict: m[2], detail: m[3].trim().slice(0, 300), sha256 });
  }
  const summary = parseSuiteSummary(stdout);
  if (!summary) {
    return { gates, summary, mismatch: gates.length
      ? null                                     // no summary line to check against
      : 'harness printed no assertions and no summary — output not understood' };
  }
  const gotPass = gates.filter((g) => g.verdict === 'PASS').length;
  const gotFail = gates.filter((g) => g.verdict === 'FAIL').length;
  if (gotPass !== summary.pass || gotFail !== summary.fail) {
    return { gates, summary, mismatch:
      `adapter read ${gotPass} PASS / ${gotFail} FAIL but ${summary.suite ?? 'the harness'} counted ` +
      `${summary.pass} / ${summary.fail} — the harness output was not fully understood` };
  }
  // A required check that COULD NOT RUN has proved nothing. The harness counts
  // it separately and never prints it as an assertion, so it would otherwise
  // vanish between a green summary and a green journey.
  if (summary.blocked > 0) {
    return { gates, summary, mismatch: `${summary.blocked} assertion(s) blocked — blocked is not proved` };
  }
  return { gates, summary, mismatch: null };
}

/**
 * Run one harness and return its gates.
 *
 * A harness is a process that exits non-zero on failure and writes an evidence
 * file of named gates. Both are used: the exit status decides the journey, and
 * the gates become the assertions. A harness that passes its exit status but
 * reports a failing gate is still a failure — the finer signal wins.
 */
export function runHarness(harness, timeoutMs, runRef = 'adhoc', opts = {}) {
  if (SHELL_HARNESS.test(harness)) return runShellHarness(harness, timeoutMs, runRef);
  if (!NODE_HARNESS.test(harness)) {
    return { ok: false, reason: `not an allow-listed harness path: ${harness}`, gates: [], durationMs: 0 };
  }
  // Arguments come from the reviewed registry, never from a request, and each
  // one must be a bare word — they are argv entries, not a command line, but a
  // harness that accepted a path or a flag from anywhere else would be a way in.
  const args = (opts.args ?? []).map(String);
  if (args.some((a) => !/^[A-Za-z0-9_-]+$/.test(a))) {
    return { ok: false, reason: `harness argument is not a bare word: ${args.join(' ')}`, gates: [], durationMs: 0 };
  }
  const script = join(ROOT, harness);
  if (!existsSync(script)) {
    return { ok: false, reason: `harness not found: ${harness}`, gates: [], durationMs: 0 };
  }
  const cwd = resolve(script, '..', '..');
  const before = Date.now();
  const res = spawnSync('node', [script, ...args], {
    cwd: harness.includes('tools/e2e/app-web/') ? join(ROOT, 'tools/e2e/app-web') : cwd,
    encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1 << 26,
    env: { ...process.env, BANZAMI_VALIDATION_RUN: '1' },
  });
  const durationMs = Date.now() - before;

  if (res.error && res.error.code === 'ETIMEDOUT') {
    return { ok: false, reason: `timed out after ${Math.round(timeoutMs / 1000)}s`, gates: [], durationMs, stdout: res.stdout ?? '' };
  }

  const gates = opts.adapter === 'assurance-json'
    ? harvestAssuranceJSON(opts.evidenceStem ?? harness.split('/').pop().replace(/\.mjs$/, ''), before)
    : harvestGates(harness, before);
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

/**
 * Adapt the OTHER evidence shape the estate writes.
 *
 * Only the app-web family uses GateReport. The rest — docs, business,
 * dev-console, sandbox — each write a JSON report of named booleans plus their
 * own totals. Those are the same contract in three spellings, not three
 * contracts, so one adapter reads all of them AND reconciles what it read
 * against what the harness counted. A shape it does not recognise produces no
 * assertions, and a journey with no assertions does not pass.
 *
 *   steps[]  {n|id|name, verdict|ok}   totals: summary{passed,total} | pass/fail
 *   matrix[] {id, ok}                  totals: passed/failed
 */
export function harvestAssuranceJSON(stem, startedAt) {
  const doc = newestReport(stem, startedAt);
  if (!doc) return [];
  const rows = Array.isArray(doc.json.steps) ? doc.json.steps
             : Array.isArray(doc.json.matrix) ? doc.json.matrix
             : null;
  if (!rows) return [];

  const gates = rows.map((r) => {
    const name = String(r.name ?? r.id ?? (r.n !== undefined ? `step-${r.n}` : 'unnamed'));
    // `verdict` may be PASS / FAIL / PENDING / NOT_RUN. Only PASS is a pass;
    // PENDING and NOT_RUN are the states a suite invented precisely so that a
    // step nobody ran could not read as success.
    const verdict = r.verdict !== undefined
      ? (r.verdict === 'PASS' ? 'PASS' : 'FAIL')
      : (r.ok === true ? 'PASS' : 'FAIL');
    const detail = String(r.verdict ?? r.note ?? r.detail ?? '').slice(0, 300);
    return { gate: name, verdict, detail, file: doc.file, sha256: doc.sha256 };
  });

  // Reconcile. The harness counted its own result; if this read a different
  // number, the shape was misunderstood and a confident subset is worse than
  // nothing. Surfaced as a synthetic FAIL so the journey cannot pass on it.
  const declaredPass = doc.json.summary?.passed ?? doc.json.passed ?? doc.json.pass;
  const readPass = gates.filter((g) => g.verdict === 'PASS').length;
  if (declaredPass !== undefined && Number(declaredPass) !== readPass) {
    gates.push({
      gate: 'ADAPTER_RECONCILED', verdict: 'FAIL',
      detail: `read ${readPass} passing of ${gates.length}, the harness counted ${declaredPass}`,
      file: doc.file, sha256: doc.sha256,
    });
  }
  return gates;
}

/** The newest JSON report this run wrote, by stem and mtime. */
function newestReport(stem, startedAt) {
  const base = process.env.TMPDIR ? join(process.env.TMPDIR, 'banzami-assurance') : '/tmp/banzami-assurance';
  if (!existsSync(base)) return null;
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
  try { walk(base); } catch { return null; }
  if (!found.length) return null;
  found.sort((a, b) => b.m - a.m);
  try {
    const bytes = readFileSync(found[0].p);
    return { file: found[0].p, sha256: createHash('sha256').update(bytes).digest('hex'),
             json: JSON.parse(bytes.toString('utf8')) };
  } catch { return null; }
}

/* ── the run loop ───────────────────────────────────────────────────────── */

/**
 * Take a run, either from the queue or from an executor that stopped.
 *
 * ADOPTION. A run is RUNNING because some executor said so, and an executor can
 * die between saying it and doing anything. The state machine has no way back
 * to QUEUED — deliberately, since a run that has begun must never look
 * unstarted — so without adoption a single crash would strand the run and cost
 * the owner another authorisation ceremony. That is what the lease is for: the
 * claim is time-bounded, and once it expires without a heartbeat the run is
 * free. The lease is not waived, only allowed to run out.
 */
function claim(runRef) {
  const pick = runRef ? `run_ref = ${lit(runRef)} AND ` : '';
  const [row] = sql(`
    UPDATE validation_runs SET
      state = 'RUNNING', started_at = COALESCE(started_at, now()), executor_id = ${lit(EXECUTOR)},
      lease_expires_at = now() + interval '${LEASE_SECONDS} seconds', heartbeat_at = now()
    WHERE id = (SELECT id FROM validation_runs
                 WHERE ${pick}(state = 'QUEUED'
                    OR (state = 'RUNNING' AND lease_expires_at < now()))
                 ORDER BY requested_at LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING id::text, run_ref, profile_id, environment,
              (started_at < now() - interval '1 second')::text AS adopted;`) ?? [];
  if (!row) return null;
  const [id, ref, profile, environment, adopted] = row;
  if (!ref || !environment) die(`claim returned an unreadable row: ${JSON.stringify(row)}`);
  if (environment !== ENVIRONMENT) die(`claimed run ${ref} declares ${environment}`);
  event(id, 'RUNNING', 'RUNNING', adopted === 't'
    ? `adopted by ${EXECUTOR} — previous executor's lease expired`
    : `claimed by ${EXECUTOR}`);
  return { id, ref, profile, adopted: adopted === 't' };
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

/**
 * Merchant credit posted SINCE this run started.
 *
 * The same definition of "merchant credit" core/compliance enforces — extracted
 * rather than restated (tools/gen-pilot-limits.mjs → QueryGlobalRollingVolume) —
 * but anchored to the run instead of to a rolling window.
 *
 * Differencing two readings of a ROLLING 24h total would have been wrong in the
 * permissive direction: over a long run, credits from just over 24 hours ago
 * age out of the window, and the difference would report less than the run
 * actually spent. A budget that under-reads is not a budget.
 *
 * It does count any other Sandbox activity in the same period. That errs toward
 * stopping early, which is the correct direction for a ceiling.
 */
function creditSince(sinceExpr) {
  const [[v]] = sql(
    "SELECT COALESCE(SUM(le.amount_minor), 0)::bigint FROM ledger_entries le " +
    `WHERE le.entry_type = 'CREDIT' AND le.created_at >= ${sinceExpr} ` +
    "AND le.account_id IN (SELECT available_account_id FROM wallets);");
  return Number(v);
}

function main() {
  proveEnvironment();

  const profileArg = arg('--profile');
  if (DRY) {
    const { profile, plan } = planFor(typeof profileArg === 'string' ? profileArg : 'GOLDEN');
    log(`plan for ${profile.id} v${profile.version}: ${plan.length} journey(s)`);
    for (const p of plan) {
      log(`  ${p.suite}  ${p.journey}  ${p.harness ?? 'NO HARNESS'}${p.blocking ? '  [blocking]' : ''}`);
    }
    const unproven = plan.filter((p) => !p.harness);
    log(`\n  executable journeys: ${plan.length - unproven.length}`);
    log(`  suites that cannot be proven at runtime: ${unproven.length}`);
    for (const u of unproven) log(`    ${u.suite}  ${u.notProven}`);
    return;
  }

  const runRef = typeof arg('--run') === 'string' ? arg('--run') : null;
  const run = claim(runRef);
  if (!run) { log('no QUEUED run to claim'); return; }
  log(`${run.adopted ? 'adopted' : 'claimed'} ${run.ref} (${run.profile}) as ${EXECUTOR}`);

  const { profile, plan } = planFor(run.profile);
  const beat = setInterval(() => { try { heartbeat(run.id); } catch { /* next tick */ } }, HEARTBEAT_SECONDS * 1000);

  let failedBlocking = 0, passed = 0, failed = 0, skipped = 0;
  let spent = 0, budgetStopped = null;
  try {
    // The plan is materialised first, so a run always says what it INTENDED to
    // do — even if it is cancelled after the second journey.
    for (const p of plan) {
      sql(`INSERT INTO validation_run_journeys (run_id, journey_id, suite_id, outcome)
           VALUES (${lit(run.id)}::uuid, ${lit(p.journey)}, ${lit(p.suite)}, 'PLANNED')
           ON CONFLICT (run_id, journey_id) DO NOTHING;`, { rows: false });
    }

    // A profile declares what a run may spend. Until something measures it, that
    // is a promise the run cannot keep or break — it is decoration. Measured
    // here, between journeys, against the engine's own definition of volume.
    const ceiling = Number(profile.budget?.max_credit_volume_minor ?? 0);
    // Anchored to the run's own start timestamp, read from the row rather than
    // from this machine's clock — the two are not the same clock.
    const since = `(SELECT started_at FROM validation_runs WHERE id = ${lit(run.id)}::uuid)`;
    if (ceiling > 0) log(`  budget: ${ceiling.toLocaleString('pt-PT')} minor of merchant credit`);

    for (const p of plan) {
      if (stateOf(run.id) === 'CANCELLED') { log('cancelled; stopping'); break; }

      // Checked BEFORE the next journey, never after the last one: a ceiling
      // discovered in the post-mortem protects nothing.
      if (ceiling > 0) {
        spent = creditSince(since);
        if (spent > ceiling) {
          budgetStopped = `run spent ${spent.toLocaleString('pt-PT')} minor against a declared ceiling of ${ceiling.toLocaleString('pt-PT')}`;
          log(`  BUDGET EXCEEDED — ${budgetStopped}; stopping before ${p.journey}`);
          break;
        }
      }

      if (!p.harness) {
        // Not a failure and not a pass. A journey with nothing to run is
        // UNAVAILABLE, and saying so is the whole point.
        const why = p.notProven ?? 'no harness declared for this journey';
        mark(run.id, p, 'UNAVAILABLE', why);
        skipped++;
        log(`  ${p.journey}  UNAVAILABLE — ${why.slice(0, 90)}`);
        continue;
      }

      log(`  ${p.journey}  running ${p.harness}…`);
      sql(`UPDATE validation_run_journeys SET outcome='OBSERVED', started_at=now()
           WHERE run_id=${lit(run.id)}::uuid AND journey_id=${lit(p.journey)};`, { rows: false });

      const r = runHarness(p.harness, p.timeoutMs, run.ref,
        { adapter: p.adapter, args: p.args, evidenceStem: p.evidenceStem });
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

    // The in-loop reading is taken BEFORE each journey, so after the last one it
    // is a journey out of date. Read it once more for the record.
    if (ceiling > 0) spent = creditSince(since);

    // Stopping on budget is not a pass with a caveat. The run did not execute
    // its universe, so it cannot claim what passing it would have claimed.
    const verdict = failedBlocking === 0 && failed === 0 && !budgetStopped ? 'PASS' : 'FAIL';
    sql(`UPDATE validation_runs SET state='COMPLETED', verdict=${lit(verdict)}, ended_at=now()
         WHERE id=${lit(run.id)}::uuid;`, { rows: false });
    event(run.id, 'RUNNING', 'COMPLETED',
      `${passed} passed, ${failed} failed (${failedBlocking} blocking), ${skipped} unavailable` +
      (ceiling > 0 ? `; spent ${spent} of ${ceiling} minor` : '') +
      (budgetStopped ? `; STOPPED ON BUDGET — ${budgetStopped}` : ''));
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
