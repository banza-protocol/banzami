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
import {
  submitCapacity, runnerBucket, vmBucket, submitCost,
  aggregateFunds, plannedPeakFunds, requiredFundsHeadroom, AGGREGATE_FUNDS_CAP,
} from './lib/validation-capacity.mjs';

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

/* ── the command line, parsed explicitly ────────────────────────────────────
 *
 * This runner claims an owner-authorised run and executes it against the
 * Sandbox. Every invocation it does not understand must therefore stop before
 * it touches anything — the old spelling scanned argv for the flags it knew and
 * silently ignored everything else, so `--help` fell through into main(),
 * claimed the queued GOLDEN run and executed it (defect R-001). An unrecognised
 * command line is not a request to proceed with defaults.
 */
const FLAGS = {
  '--help':    { value: false, help: 'print this usage and exit, touching nothing' },
  '--dry-run': { value: false, help: 'resolve the plan and print it; claims nothing' },
  '--profile': { value: true, arg: 'GOLDEN|FULL', help: 'which profile to plan (--dry-run only)' },
  '--run':     { value: true, arg: 'BZV-…', help: 'claim this run ref instead of the oldest QUEUED' },
};

function usage() {
  const lines = Object.entries(FLAGS).map(([f, d]) =>
    `  ${`${f}${d.value ? ` <${d.arg}>` : ''}`.padEnd(24)} ${d.help}`);
  return `usage: node tools/validation-runner.mjs [options]\n\n${lines.join('\n')}\n\n` +
    `With no options the runner claims the oldest QUEUED run and executes it.\n`;
}

/** Parse argv, or throw. Pure: it reads nothing but its argument. */
export function parseArgv(argv) {
  const out = { help: false, dryRun: false, profile: undefined, run: undefined };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const spec = FLAGS[token];
    if (!spec) {
      throw new Error(token.startsWith('-')
        ? `unknown option ${token}`
        : `unexpected argument ${JSON.stringify(token)} (this runner takes options only)`);
    }
    if (seen.has(token)) throw new Error(`${token} given more than once`);
    seen.add(token);
    if (!spec.value) {
      if (token === '--help') out.help = true; else out.dryRun = true;
      continue;
    }
    const v = argv[++i];
    // A missing value silently absorbing the NEXT flag is how `--run --dry-run`
    // becomes a claim of a run literally named "--dry-run".
    if (v === undefined) throw new Error(`${token} needs a value (${spec.arg})`);
    if (v.startsWith('-')) throw new Error(`${token} needs a value (${spec.arg}), got the option ${v}`);
    if (token === '--profile') out.profile = v; else out.run = v;
  }
  if (out.profile !== undefined && !out.dryRun) {
    // Otherwise --profile FULL on a queued GOLDEN reads as a request to run
    // FULL, and is silently ignored. The run row names the profile.
    throw new Error('--profile only applies to --dry-run; a claimed run names its own profile');
  }
  return out;
}

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
        max_synthetic_funds_exposure_minor: j.max_synthetic_funds_exposure_minor,
        submits: j.existing_harness && existsSync(join(ROOT, j.existing_harness))
          ? submitCost(j.existing_harness, readFileSync(join(ROOT, j.existing_harness), 'utf8'))
          : null,
        adapter: j.evidence_adapter ?? null,
        args: j.harness_args ?? [],
        evidenceStem: j.evidence_stem ?? null,
        timeoutMs: (j.timeout_seconds ?? 720) * 1000,
        retries: j.retry_policy === 'none' ? 0 : (j.infrastructure_retries ?? 0),
        blocking: blocking.has(suiteID),
        // VD-009. A journey that creates nothing disposable has nothing to
        // verify; every other one must return the funded value it took.
        disposable: (j.cleanup?.disposable ?? []).length,
        fundsResidualAllowed: Number(j.cleanup?.funds_residual_allowed_minor ?? 0),
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
    // Clear the directory first. It is keyed by run_ref, and anything left in it
    // from an earlier run with the same ref would be executed or sourced in
    // preference to what this run shipped — the identical staleness the harness
    // file itself is shipped fresh to avoid. A guard that removed a staged
    // dependency once passed anyway, because the VM still had yesterday's copy.
    execFileSync('ssh', ['-o', 'BatchMode=yes', HOST,
      `rm -rf ${remoteDir} && mkdir -p ${remoteDir}/lib`], { stdio: 'ignore' });
    execFileSync('scp', ['-o', 'BatchMode=yes', '-q',
      join(ROOT, 'tests/phase0/lib/e2e-run.sh'),
      join(ROOT, 'tests/phase0/lib/synthetic-tenant.sh'),
      // Some harnesses copy THEMSELVES to the host and run there; remote.sh is
      // the guard that makes them return the real remote exit status instead of
      // a cleanup `rm`'s zero. They look for it beside themselves, so it is
      // staged under lib/ with the rest.
      join(ROOT, 'tools/ops/lib/remote.sh'),
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
    if (gates.length) return { gates, summary, mismatch: null }; // nothing to check against
    // Say WHAT it printed. A harness that refused to start ("lib not found",
    // "NO_SECRET") is a different problem from one whose format changed, and
    // "output not understood" on its own sends the reader to the adapter.
    const first = String(stdout).split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '(no output)';
    return { gates, summary, mismatch:
      `harness printed no assertions and no summary — first line was: ${first.slice(0, 160)}` };
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
    env: {
      ...process.env,
      BANZAMI_VALIDATION_RUN: '1',
      // Eleven of these harnesses refuse to start without an explicit opt-in,
      // so that an E2E which mutates the Sandbox cannot run by accident. This
      // is not a bypass of that guard, it is the thing the guard is asking for:
      // a Validation Run was prepared by an authenticated operator with
      // step-up, started by one with step-up again, and claimed by an executor
      // that proved which database it is talking to. Nothing in this system is
      // less accidental.
      BANZAMI_E2E: 'RUN',
    },
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

/**
 * Three numbers, and a refusal.
 *
 *   DECLARED   what the profile says the run may spend
 *   PLANNED    what this plan will actually spend, per limiter bucket
 *   AVAILABLE  what the live limiter has left, per bucket
 *
 * A run that starts without checking all three discovers the problem at its
 * last provisioned Business, having already spent everything before it. The
 * profile declaring 0 while the plan spent 4 went unnoticed for exactly as long
 * as nobody compared them.
 *
 * Buckets matter: a node proof submits from wherever the runner runs, a phase-0
 * shell harness from the Sandbox VM. Twelve free slots summed across the two is
 * not eleven free in the one that refuses.
 */
function checkApplicationBudget(profile, plan) {
  const declared = Number(profile.budget?.max_applications ?? 0);
  const planned = { runner: 0, vm: 0 };
  for (const p of plan) if (p.submits) planned[p.submits.bucket]++;
  const plannedTotal = planned.runner + planned.vm;

  log(`  applications: declared ${declared} · planned ${plannedTotal} ` +
      `(runner ${planned.runner}, vm ${planned.vm})`);

  if (plannedTotal > declared) {
    die(`refusing to start: the plan spends ${plannedTotal} application submit(s) but ` +
        `${profile.id} declares a budget of ${declared}. Fix the profile or the plan — ` +
        `a budget that is smaller than the plan is not a budget.`);
  }

  let buckets;
  try { buckets = submitCapacity(); }
  catch (e) { die(`refusing to start: cannot read the application-submit limiter (${e.message}). ` +
                  `An unknown window is not an empty one.`); }

  const runner = runnerBucket(buckets);
  const vm = vmBucket(buckets);
  const need = [
    { name: "the runner's address", have: runner, want: planned.runner },
    { name: "the Sandbox VM's address", have: vm, want: planned.vm },
  ];
  for (const { name, have, want } of need) {
    if (want === 0) continue;
    if (!have) {
      die(`refusing to start: the plan needs ${want} submit(s) from ${name}, and the limiter ` +
          `has no record of that bucket. An unknown bucket is not a free one.`);
    }
    log(`  limiter ${have.ip}: ${have.used} used, ${have.free} free` +
        (have.nextFreeAt ? ` (next slot ${have.nextFreeAt})` : ''));
    if (have.free < want) {
      die(`refusing to start: the plan needs ${want} submit(s) from ${name} and only ` +
          `${have.free} remain. The next slot returns at ${have.nextFreeAt ?? 'an unknown time'}.`);
    }
  }
  return { declared, planned: plannedTotal, buckets };
}

/** What the run has actually spent so far, from the same live limiter. */
function actualSubmits(baseline) {
  try {
    const now = submitCapacity();
    let spent = 0;
    for (const b of now) {
      const before = baseline.find((x) => x.ip === b.ip);
      spent += Math.max(0, b.used - (before?.used ?? 0));
    }
    return spent;
  } catch { return null; }
}

/**
 * The second scarce resource, checked with the same four numbers.
 *
 * Aggregate funded value is not transaction volume. The credit ceiling limits
 * money MOVED; this limits money HELD by synthetic actors before cleanup. A run
 * can move almost nothing and still exhaust it — and one did, for weeks, one
 * unretired consumer at a time, surfacing as INSUFFICIENT_FUNDS.
 *
 * The reserve is the plan's own peak: enough headroom for this run AND one
 * complete retry, because a failed journey may strand its funding until cleanup
 * and the retry then needs its own.
 */
function checkFundsBudget(profile, plan) {
  // The barrier state is a fact about THIS executor and THIS schema, probed
  // before the claim. Passing it in is what stops the smaller bound from being
  // used by a runner that cannot deliver the premise behind it.
  const planned = plannedPeakFunds(plan, null, null, { barrier: CLEANUP_BARRIER });
  if (planned.unknown.length) {
    die(`VALIDATION_AGGREGATE_FUNDS_PEAK_UNKNOWN: ${planned.unknown.length} journey(s) do not ` +
        `declare max_synthetic_funds_exposure_minor (${planned.unknown.join(', ')}). ` +
        `An undeclared exposure is not a zero exposure, and a floor must not authorise a run.`);
  }
  const bound = requiredFundsHeadroom(planned.peak);
  let live;
  try { live = aggregateFunds(); }
  catch (e) { die(`refusing to start: cannot read aggregate Sandbox funds (${e.message}). ` +
                  `An unknown cap is not an empty one.`); }

  const required = bound.required;

  log(`  funds: cap ${live.cap.toLocaleString('pt-PT')} · used ${live.used.toLocaleString('pt-PT')} · ` +
      `available ${live.available.toLocaleString('pt-PT')}`);
  log(`  funds: cumulative-exposure bound ${planned.cumulativeExposureBound.toLocaleString('pt-PT')} · ` +
      `concurrent peak max ${planned.concurrentPeakMax.toLocaleString('pt-PT')} · ` +
      `bound in force ${planned.barrier ? 'CONCURRENT (barrier armed)' : 'CUMULATIVE (no barrier)'}`);
  log(`  funds: planned peak max ${bound.plannedPeakMax.toLocaleString('pt-PT')} · ` +
      `failed-run residual max ${bound.failedRunResidualMax.toLocaleString('pt-PT')} · ` +
      `retry peak max ${bound.retryPeakMax.toLocaleString('pt-PT')} · ` +
      `required ${required.toLocaleString('pt-PT')}`);

  if (live.available < required) {
    die(`VALIDATION_AGGREGATE_FUNDS_CAP_INSUFFICIENT: ` +
        `cap=${live.cap} currently_used=${live.used} available=${live.available} ` +
        `planned_peak_max=${bound.plannedPeakMax} failed_run_residual_max=${bound.failedRunResidualMax} ` +
        `retry_peak_max=${bound.retryPeakMax} required_headroom=${required}. ` +
        `Synthetic actors holding funded balances are the usual cause — ` +
        `run tools/validation-synthetic-audit.mjs before retiring anything.`);
  }
  return { planned, live, required, bound };
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
/**
 * What the runner WOULD claim, without claiming it. Read-only.
 *
 * A start gate that can only refuse after claiming is not a gate: the claim is
 * the irreversible step. An owner authorisation costs two step-up ceremonies
 * and a run is terminal once it completes, so refusing a FULL run into a schema
 * that cannot verify cleanup has to happen while the run is still QUEUED.
 */
function peekQueued(runRef) {
  const pick = runRef ? `run_ref = ${lit(runRef)} AND ` : '';
  const [row] = sql(`SELECT run_ref, profile_id FROM validation_runs
                      WHERE ${pick}(state = 'QUEUED'
                         OR (state = 'RUNNING' AND lease_expires_at < now()))
                      ORDER BY requested_at LIMIT 1;`) ?? [];
  return row ? { ref: row[0], profile: row[1] } : null;
}

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
  const [id, ref, profile, environment, adoptedRaw] = row;
  if (!ref || !environment) die(`claim returned an unreadable row: ${JSON.stringify(row)}`);
  if (environment !== ENVIRONMENT) die(`claimed run ${ref} declares ${environment}`);
  let adopted;
  try { adopted = adoptionFromFlag(adoptedRaw); }
  catch (e) { die(e.message); }
  event(id, 'RUNNING', 'RUNNING', adopted
    ? `adopted by ${EXECUTOR} — previous executor's lease expired`
    : `claimed by ${EXECUTOR}`);
  return { id, ref, profile, adopted };
}

/**
 * Read the adoption flag psql returned.
 *
 * `::text` on a boolean renders 'true'/'false', NOT psql's bare 't'/'f'. The
 * first adoption was written to the permanent event log as an ordinary claim
 * because of that — a small lie in a record that cannot be rewritten, which is
 * the kind this programme exists to stop.
 *
 * Both spellings are accepted. Anything else THROWS rather than being read as
 * false: a flag nobody can parse must not quietly become the safe-looking
 * answer, because "not adopted" is the one that loses information.
 */
export function adoptionFromFlag(raw) {
  if (raw === 'true' || raw === 't') return true;
  if (raw === 'false' || raw === 'f') return false;
  throw new Error(`claim returned an unreadable adoption flag: ${JSON.stringify(raw)}`);
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
  // Before proveEnvironment(), which opens the database. Nothing this runner
  // does to the Sandbox may happen on a command line it did not understand.
  let cli;
  try { cli = parseArgv(process.argv.slice(2)); }
  catch (e) { console.error(`validation-runner: ${e.message}\n\n${usage()}`); process.exit(2); }

  if (cli.help) { process.stdout.write(usage()); return; }

  proveEnvironment();

  if (cli.dryRun) {
    const { profile, plan } = planFor(cli.profile ?? 'GOLDEN');
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

  // VD-009. FULL is feasible only because cleanup works, so a FULL run must not
  // start into a schema that cannot record whether it did. Checked BEFORE the
  // claim: refusing afterwards would burn an owner authorisation that cannot be
  // reissued without another two step-up ceremonies.
  probeCleanupBarrier();
  const waiting = peekQueued(cli.run ?? null);
  if (waiting && waiting.profile === 'FULL' && !CLEANUP_BARRIER) {
    die('VALIDATION_CLEANUP_BARRIER_UNAVAILABLE — the queued run is FULL and the ' +
        'deployed schema predates migration 0161, so per-journey cleanup cannot be ' +
        'verified or recorded. FULL\'s upper bound exceeds the aggregate funds cap ' +
        'without it. The run is left QUEUED and unspent.');
  }

  const run = claim(cli.run ?? null);
  if (!run) { log('no QUEUED run to claim'); return; }
  log(`  cleanup barrier: ${CLEANUP_BARRIER ? 'ARMED (0161)' : 'not deployed — results not recorded'}`);
  log(`${run.adopted ? 'adopted' : 'claimed'} ${run.ref} (${run.profile}) as ${EXECUTOR}`);

  const { profile, plan } = planFor(run.profile);
  const beat = setInterval(() => { try { heartbeat(run.id); } catch { /* next tick */ } }, HEARTBEAT_SECONDS * 1000);

  let failedBlocking = 0, passed = 0, failed = 0, skipped = 0;
  let spent = 0, budgetStopped = null, submitsActual = null, cleanupStopped = null;
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
    // Before the plan is materialised and long before a Business is provisioned.
    const budget = checkApplicationBudget(profile, plan);
    const funds = checkFundsBudget(profile, plan);
    const fundsBaseline = funds.live.used;
    let fundsPeak = 0;

    const ceiling = Number(profile.budget?.max_credit_volume_minor ?? 0);
    // Anchored to the run's own start timestamp, read from the row rather than
    // from this machine's clock — the two are not the same clock.
    const since = `(SELECT started_at FROM validation_runs WHERE id = ${lit(run.id)}::uuid)`;
    if (ceiling > 0) log(`  budget: ${ceiling.toLocaleString('pt-PT')} minor of merchant credit`);

    for (const p of plan) {
      if (stateOf(run.id) === 'CANCELLED') { log('cancelled; stopping'); break; }

      // Checked BEFORE the next journey, never after the last one: a ceiling
      // discovered in the post-mortem protects nothing.
      // Track the ACTUAL funded-value peak against the same live source the
      // preflight used. The planned figure is a floor (see plannedPeakFunds),
      // so a divergence here is the thing that catches the model being wrong.
      try {
        const nowFunds = aggregateFunds().used;
        fundsPeak = Math.max(fundsPeak, nowFunds - fundsBaseline);
      } catch { /* the run is not about this reading */ }

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

      // Read the funded-value baseline immediately before the harness, so the
      // window the residual is measured over is the journey and nothing else.
      let fundsBaselineForJourney = null;
      try { fundsBaselineForJourney = aggregateFunds().used; } catch { /* verifyCleanup says UNDECLARED */ }

      const r = runHarness(p.harness, p.timeoutMs, run.ref,
        { adapter: p.adapter, args: p.args, evidenceStem: p.evidenceStem });
      for (const g of r.gates) recordGate(run.id, p, g);

      // FUNCTIONAL_RESULT and CLEANUP_RESULT are two answers to two questions.
      // A journey can work perfectly and still leave the Sandbox worse than it
      // found it, and that is not a clean pass — for FULL acceptance or for the
      // journey after it, which inherits the resource.
      const functional = r.ok ? 'PASSED' : 'FAILED';
      const cleanup = verifyCleanup(p, fundsBaselineForJourney);
      const outcome = functional === 'PASSED' && ['VERIFIED', 'NOT_REQUIRED'].includes(cleanup.result)
        ? 'PASSED' : 'FAILED';

      const asserted = r.gates.filter((g) => g.verdict !== 'NOTE').length;
      const detail = functional === 'PASSED'
        ? `${asserted} assertions, ${r.gates.length - asserted} measurements` +
          (outcome === 'PASSED' ? '' : ` — cleanup ${cleanup.result}: ${cleanup.detail}`)
        : r.reason;
      mark(run.id, p, outcome, detail, { functional, cleanup });

      if (outcome === 'PASSED') passed++; else { failed++; if (p.blocking) failedBlocking++; }
      log(`  ${p.journey}  ${outcome}  ${Math.round(r.durationMs / 1000)}s  ${r.reason}` +
          (p.disposable ? `  · cleanup ${cleanup.result}` : ''));

      // The barrier. A journey that left funded value behind has taken a share
      // of a cap the rest of the run needs, so the next journey does not start:
      // it would be measured against a baseline that already contains the leak,
      // and the run would report a cascade of failures with one cause.
      // FAILED and UNDECLARED both stop the run, for the same reason. The
      // concurrent-peak bound that makes FULL fit inside the aggregate cap
      // holds only while every journey is PROVEN to have returned to baseline;
      // an unmeasured journey breaks the proof just as a leaking one does, and
      // continuing would mean every later journey measures against a baseline
      // no longer known to be clean. Unmeasured is not a smaller failure.
      if (['FAILED', 'UNDECLARED'].includes(cleanup.result)) {
        cleanupStopped = `${p.journey} — cleanup ${cleanup.result}: ${cleanup.detail}`;
        log(`  CLEANUP BARRIER — ${cleanupStopped}; stopping the run`);
        for (const later of plan.slice(plan.indexOf(p) + 1)) {
          if (stateOf(run.id) === 'CANCELLED') break;
          mark(run.id, later, 'SKIPPED', 'not started: the run stopped at a cleanup barrier',
            { functional: 'UNAVAILABLE', cleanup: { result: 'NOT_REACHED', detail: `stopped at ${p.journey}` } });
          skipped++;
        }
        break;
      }
    }

    const state = stateOf(run.id);
    if (state === 'CANCELLED') { log('run was cancelled'); return; }

    // The in-loop reading is taken BEFORE each journey, so after the last one it
    // is a journey out of date. Read it once more for the record.
    if (ceiling > 0) spent = creditSince(since);

    // ACTUAL, beside declared and planned. A run that quietly spent more than it
    // said it would has broken the promise the budget exists to make, even if
    // every journey passed.
    // PLANNED vs ACTUAL, said out loud in both directions. Over is a planner
    // defect or unexpected retries; under is a skipped journey or reuse. Neither
    // is normalised away — a model that silently agrees with itself is not a
    // model.
    if (fundsPeak > 0 || funds.planned.peak > 0) {
      const delta = fundsPeak - funds.planned.peak;
      log(`  funds: planned peak max ${funds.planned.peak} · actual peak ${fundsPeak}` +
          (delta === 0 ? '' : ` · DIVERGENCE ${delta > 0 ? '+' : ''}${delta} — ` +
            (delta > 0 ? 'the plan under-counted (helper-wrapped registrations, or retries)'
                       : 'a journey was skipped or reused a fixture')));
    }

    submitsActual = actualSubmits(budget.buckets);
    if (submitsActual !== null) {
      log(`  applications: declared ${budget.declared} · planned ${budget.planned} · actual ${submitsActual}`);
      if (submitsActual > budget.declared) {
        budgetStopped = `run spent ${submitsActual} application submit(s) against a declared budget of ${budget.declared}`;
        log(`  BUDGET EXCEEDED — ${budgetStopped}`);
      }
    }

    // Stopping on budget is not a pass with a caveat. The run did not execute
    // its universe, so it cannot claim what passing it would have claimed.
    const verdict = failedBlocking === 0 && failed === 0 && !budgetStopped && !cleanupStopped ? 'PASS' : 'FAIL';
    sql(`UPDATE validation_runs SET state='COMPLETED', verdict=${lit(verdict)}, ended_at=now()
         WHERE id=${lit(run.id)}::uuid;`, { rows: false });
    event(run.id, 'RUNNING', 'COMPLETED',
      `${passed} passed, ${failed} failed (${failedBlocking} blocking), ${skipped} unavailable` +
      (ceiling > 0 ? `; spent ${spent} of ${ceiling} minor` : '') +
      (submitsActual !== null ? `; ${submitsActual} of ${budget.declared} application submit(s)` : '') +
      (budgetStopped ? `; STOPPED ON BUDGET — ${budgetStopped}` : '') +
      (cleanupStopped ? `; STOPPED AT CLEANUP BARRIER — ${cleanupStopped}` : ''));

    // The durable record is written and committed above. Only now is there
    // anything to summarise: the console summary is a READ-BACK, not a second
    // opinion assembled from this process's counters (defect R-002). If stdout
    // is truncated or lost, nothing here was the truth anyway — the database
    // was. Printing counters would mean a lost summary and a disagreeing
    // summary are indistinguishable.
    summarise(run.id, run.ref, { passed, failed, skipped });
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

/**
 * Read the run back from the database and print what it durably says. Called
 * only after the terminal state is committed; every number below comes from a
 * SELECT, never from a counter this process was holding.
 *
 * `expected` is what the loop believed. It is not printed as the answer — it is
 * compared, so that a divergence between what the executor thought it did and
 * what the run actually records is stated out loud instead of averaged away.
 */
function summarise(runID, runRef, expected) {
  let row;
  try {
    [row] = sql(
      `SELECT r.state, r.verdict, to_char(r.ended_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
              (SELECT count(*) FROM validation_run_journeys j
                WHERE j.run_id = r.id AND j.outcome = 'PASSED'),
              (SELECT count(*) FROM validation_run_journeys j
                WHERE j.run_id = r.id AND j.outcome = 'FAILED'),
              (SELECT count(*) FROM validation_run_journeys j
                WHERE j.run_id = r.id AND j.outcome = 'UNAVAILABLE'),
              (SELECT count(*) FROM validation_run_journeys j WHERE j.run_id = r.id),
              (SELECT count(*) FROM validation_evidence e WHERE e.run_id = r.id)
         FROM validation_runs r WHERE r.id = ${lit(runID)}::uuid;`);
  } catch (e) {
    // Failing to read the record back does not change the record. Say which
    // one is missing, and do not invent a summary from memory.
    log(`\n${runRef} — terminal state is persisted; could not be read back for display: ${e.message}`);
    log('  read it with: SELECT state, verdict FROM validation_runs WHERE run_ref = \'' + runRef + '\';');
    return;
  }
  const [state, verdict, endedAt, pass, fail, unavail, total, evidence] = row;
  log(`\n${runRef}  ${state}  ${verdict}`);
  log(`  journeys   ${pass} passed / ${fail} failed / ${unavail} unavailable   (${total} planned)`);
  log(`  evidence   ${evidence} hashed row(s)`);
  log(`  finished   ${endedAt}`);
  log('  (read back from validation_runs; the database is the authority for this run)');

  const drift = [];
  if (Number(pass) !== expected.passed) drift.push(`passed ${expected.passed}→${pass}`);
  if (Number(fail) !== expected.failed) drift.push(`failed ${expected.failed}→${fail}`);
  if (Number(unavail) !== expected.skipped) drift.push(`unavailable ${expected.skipped}→${unavail}`);
  if (drift.length) {
    log(`  DIVERGENCE the executor counted ${drift.join(', ')} — the persisted record above stands`);
  }
}

function mark(runID, p, outcome, detail, results = null) {
  // The two results are written in the same statement as the terminal outcome,
  // so there is no window in which a journey is PASSED with no record of
  // whether it cleaned up. 0161's CHECK refuses that combination anyway; this
  // is so the refusal never has to fire.
  const extra = results && CLEANUP_BARRIER
    ? `, functional_result=${lit(results.functional)}` +
      `, cleanup_result=${lit(results.cleanup.result)}` +
      `, cleanup_detail=${lit(results.cleanup.detail)}` +
      `, cleanup_verified_at=${results.cleanup.result === 'VERIFIED' ? 'now()' : 'NULL'}`
    : '';
  sql(`UPDATE validation_run_journeys SET outcome=${lit(outcome)}, detail=${lit(detail)}${extra}, ended_at=now()
       WHERE run_id=${lit(runID)}::uuid AND journey_id=${lit(p.journey)};`, { rows: false });
}

/* ── VD-009: the cleanup barrier ─────────────────────────────────────────────
 *
 * FULL's no-cleanup upper bound on funded value is 56 950 000 minor against a
 * shared cap of 50 000 000. FULL is feasible only because cleanup works, and
 * nothing verified that it did — proof 15 leaked 500 000 per run until 42
 * consumers held 79% of the cap and the next funding call was refused.
 */

/** Does the deployed schema carry 0161? Probed once, never assumed. */
let CLEANUP_BARRIER = false;
function probeCleanupBarrier() {
  try {
    const [row] = sql(
      `SELECT count(*) FROM information_schema.columns
        WHERE table_name='validation_run_journeys'
          AND column_name IN ('functional_result','cleanup_result','cleanup_detail');`);
    CLEANUP_BARRIER = Number(row?.[0]) === 3;
  } catch { CLEANUP_BARRIER = false; }
  return CLEANUP_BARRIER;
}

/**
 * Measure what the journey left behind.
 *
 * The resource with a ceiling is funded value HELD, and the aggregate reading
 * is the whole Sandbox — which is exactly the right instrument for this
 * question: if the total is back where it started, the cap is not being
 * consumed, regardless of who owned what.
 *
 * The confound is real and is not smoothed over: this Sandbox also carries
 * DOA's production traffic, so a concurrent payment moves the same number. A
 * rise is therefore treated as failure (fail closed, at the cost of an
 * occasional false abort) and a fall is NOT read as proof that this journey
 * leaked nothing — only that the shared resource is not being exhausted, which
 * is the invariant a FULL run depends on.
 */
function verifyCleanup(p, baseline) {
  let after = null;
  let unreadable = null;
  if (baseline !== null) {
    try { after = aggregateFunds().used; }
    catch (e) { unreadable = String(e.message).slice(0, 120); }
  }
  return cleanupVerdict(p, baseline, after, unreadable);
}

/** The decision, with no I/O in it, so every branch can be proven. */
export function cleanupVerdict(p, baseline, after, unreadable = null) {
  if (!p.disposable) {
    return { result: 'NOT_REQUIRED', detail: 'the registry declares nothing disposable for this journey' };
  }
  if (baseline === null) {
    return { result: 'UNDECLARED', detail: 'no funded-value baseline was readable before the journey' };
  }
  if (unreadable !== null || after === null) {
    return { result: 'UNDECLARED', detail: `funded value unreadable after the journey: ${unreadable ?? 'no reading'}` };
  }

  const residual = after - baseline;
  const allowed = p.fundsResidualAllowed ?? 0;
  if (residual > allowed) {
    return {
      result: 'FAILED',
      detail: `${residual.toLocaleString('pt-PT')} minor of funded value remained` +
        (allowed ? ` against an allowance of ${allowed.toLocaleString('pt-PT')}` : ' (allowance 0)'),
    };
  }
  return {
    result: 'VERIFIED',
    detail: residual === 0
      ? 'funded value returned to its pre-journey total'
      : `funded value ${residual < 0 ? 'fell by' : 'rose by'} ${Math.abs(residual).toLocaleString('pt-PT')} minor, within the allowance`,
  };
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
