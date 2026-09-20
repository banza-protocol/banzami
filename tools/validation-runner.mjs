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
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSuiteSummary } from './e2e/lib/parse-suite-summary.mjs';
import {
  submitCapacity, runnerBucket, vmBucket, submitCost,
  aggregateFunds, plannedPeakFunds, requiredFundsHeadroom, AGGREGATE_FUNDS_CAP,
} from './lib/validation-capacity.mjs';
import { attributablePeak, exposureVerdict } from './lib/validation-exposure.mjs';

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
/**
 * The plan, exported so that anything which REPORTS on a run resolves it the
 * same way the runner EXECUTES it. The readiness tool used to build its own
 * from journeys.yaml — 38 rows — while this builds 39, the extra being the
 * placeholder for a suite with no journey. Every gate computed from the first
 * was therefore about a slightly different run than the one that would run.
 */
export function planFor(profileID) {
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
        // DECLARED by the planner that makes it. Every consumer used to infer
        // this from `harness IS NULL` or from the id ending in NOT-PROVEN —
        // the inference 0162 exists to abolish.
        kind: 'CONTROL',
        controlClassification: suite.runtime_proof === 'NOT_PROVEN' ? 'NOT_PROVEN' : null,
        controlReason: suite.runtime_proof === 'NOT_PROVEN' ? (b.class ?? null) : null,
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
        kind: 'JOURNEY',
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
/**
 * The ownership context for one shell journey. The RUNNER allocates it.
 *
 * Identity is never derived from a filename or a process name: the run, the
 * journey and a nonce are minted here and travel in every record the harness
 * writes, so a manifest left behind by an earlier run — same host, same ref,
 * same script — cannot be read as belonging to this one.
 */
/** Single-quote a value for a remote shell command line. */
const shq = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;

/**
 * Bring the journey's ownership manifest back from the VM.
 *
 * Returns a discriminated result rather than an array, because "the harness
 * ran and owned nothing" and "there is no manifest" are different facts and
 * only one of them is benign. An empty manifest exists because e2e_begin
 * creates it; a missing one means the harness never got that far.
 */
function collectOwnership(ctx) {
  let text;
  try {
    text = execFileSync('ssh', ['-o', 'BatchMode=yes', HOST,
      `if [ -f ${shq(ctx.manifest)} ]; then cat ${shq(ctx.manifest)}; else echo __BZ_NO_MANIFEST__; fi`],
      { encoding: 'utf8', maxBuffer: 1 << 24 });
  } catch (e) {
    return { state: 'UNREADABLE', owned: [], rejected: [], detail: String(e.message).slice(0, 160) };
  }
  if (text.includes('__BZ_NO_MANIFEST__')) {
    return { state: 'ABSENT', owned: [], rejected: [],
             detail: 'the harness never reached e2e_begin, so it never opened a manifest' };
  }
  const { owned, rejected, lines } = parseOwnershipManifest(text, ctx);
  return {
    state: rejected.length && !owned.length ? 'REJECTED' : owned.length ? 'PRESENT' : 'EMPTY',
    owned, rejected,
    detail: `${owned.length} owned of ${lines} record(s)` +
      (rejected.length ? `; ${rejected.length} rejected (${[...new Set(rejected.map((r) => r.reason))].join(',')})` : ''),
  };
}

export function ownershipContext(runRef, journeyID) {
  const nonce = randomBytes(12).toString('hex');
  const safe = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, '');
  // Unique to run + journey + nonce. It used to be keyed by the run alone, so
  // the second journey of a run wiped the first one's manifest on staging.
  const dir = `/tmp/banzami-validation/${safe(runRef)}/${safe(journeyID)}-${nonce}`;
  return { runRef, journeyID, nonce, remoteDir: dir, manifest: `${dir}/ownership.ndjson`, schema: 1 };
}

/**
 * Parse and VALIDATE a retrieved ownership manifest.
 *
 * Every record must name the run, the journey and the nonce this context
 * minted. A record that does not is not this journey's, whatever it claims,
 * and is refused rather than attributed. Pure, so every rejection branch is
 * provable without a VM.
 */
export function parseOwnershipManifest(text, ctx) {
  const owned = [];
  const rejected = [];
  const seen = new Set();
  const lines = String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    let r;
    try { r = JSON.parse(line); } catch { rejected.push({ reason: 'MALFORMED', line: line.slice(0, 120) }); continue; }
    if (r.schema_version !== ctx.schema) { rejected.push({ reason: 'SCHEMA', line: String(r.schema_version) }); continue; }
    if (r.run_ref !== ctx.runRef) { rejected.push({ reason: 'RUN_REF', line: String(r.run_ref) }); continue; }
    if (r.journey_id !== ctx.journeyID) { rejected.push({ reason: 'JOURNEY_ID', line: String(r.journey_id) }); continue; }
    if (r.nonce !== ctx.nonce) { rejected.push({ reason: 'NONCE', line: String(r.nonce).slice(0, 12) }); continue; }
    const kind = String(r.resource_type ?? '').toLowerCase();
    if (!OWNED_KINDS.has(kind)) { rejected.push({ reason: 'RESOURCE_TYPE', line: kind }); continue; }
    if (!r.resource_id) { rejected.push({ reason: 'NO_ID', line: kind }); continue; }
    const key = `${kind}:${r.resource_id}`;
    // Idempotent: a harness may hand the same resource over twice, and a
    // resource counted twice would inflate the concurrent exposure sum by its
    // whole balance.
    if (seen.has(key)) continue;
    seen.add(key);
    owned.push({
      kind, id: String(r.resource_id),
      meta: { creation_source: r.creation_source ?? 'e2e_own', financial_owner_id: r.financial_owner_id || null },
      cleanup_required: r.cleanup_required !== false,
      created_at: r.created_at ?? null,
    });
  }
  return { owned, rejected, lines: lines.length };
}

/**
 * Every resource kind a harness may hand over, mapped to the class 0161 stores.
 *
 * ONE map, because two would drift: the validator and the persister must agree
 * on what is ownable, or a record accepted by one would be dropped by the
 * other and the difference would look like a journey that owned nothing.
 *
 * The vocabulary is the harnesses' own, read from them rather than assumed —
 * an earlier draft of this listed five kinds and would have rejected
 * fixture_key, fixture_project, payment_session, payment_link,
 * webhook_endpoint and merchant_application, which are 73 of the 87 ownership
 * declarations the shell harnesses actually make.
 *
 * An unmapped kind is REFUSED, not guessed: a resource the studio cannot
 * classify is one it cannot retire or attribute either.
 */
const OWNED_CLASS = new Map([
  ['consumer', 'CONSUMER_IDENTITY'],
  ['business', 'BUSINESS'],
  ['merchant', 'BUSINESS'],
  ['merchant_application', 'MERCHANT_APPLICATION'],
  ['fixture_project', 'DEVELOPER_PROJECT'],
  ['fixture_workspace', 'DEVELOPER_WORKSPACE'],
  ['fixture_key', 'API_KEY'],
  ['payment_link', 'PAYMENT_LINK'],
  ['payment_session', 'CHARGE'],
  ['webhook_endpoint', 'WEBHOOK_ENDPOINT'],
  ['test_payer', 'TEST_PAYER'],
  ['wallet_account', 'WALLET_FUNDING'],
  ['rail_state', 'EXTERNAL_RAIL_STATE'],
]);
const OWNED_KINDS = new Set(OWNED_CLASS.keys());
export const ownedClassFor = (kind) => OWNED_CLASS.get(String(kind).toLowerCase()) ?? null;

export function runShellHarness(harness, timeoutMs, runRef = 'adhoc', journeyID = null) {
  const script = join(ROOT, harness);
  if (!SHELL_HARNESS.test(harness)) {
    return { ok: false, reason: `not an allow-listed shell harness: ${harness}`, gates: [], durationMs: 0, ownership: { state: 'NOT_STARTED', owned: [], rejected: [], detail: 'refused before staging' } };
  }
  if (!existsSync(script)) {
    return { ok: false, reason: `harness not found: ${harness}`, gates: [], durationMs: 0, ownership: { state: 'NOT_STARTED', owned: [], rejected: [], detail: 'refused before staging' } };
  }
  const base = harness.split('/').pop();
  const sha256 = createHash('sha256').update(readFileSync(script)).digest('hex');
  const ctx = ownershipContext(runRef, journeyID ?? base.replace(/\.sh$/, ''));
  const remoteDir = ctx.remoteDir;
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
    return { ok: false, reason: `could not stage harness on the Sandbox host: ${e.message}`, gates: [], durationMs: Date.now() - before, ownership: { state: 'NOT_STARTED', owned: [], rejected: [], detail: 'staging failed' } };
  }

  const seconds = Math.ceil(timeoutMs / 1000);
  // The context travels as environment, explicitly. A harness must not have to
  // know the runner's filesystem layout to be able to declare what it created.
  const env = [
    `BZ_VALIDATION_RUN_REF=${shq(ctx.runRef)}`,
    `BZ_VALIDATION_JOURNEY=${shq(ctx.journeyID)}`,
    `BZ_OWNERSHIP_NONCE=${shq(ctx.nonce)}`,
    `BZ_OWNERSHIP_MANIFEST=${shq(ctx.manifest)}`,
    `BZ_OWNERSHIP_SCHEMA=${ctx.schema}`,
  ].join(' ');
  const res = spawnSync('ssh', ['-o', 'BatchMode=yes', HOST,
    // `timeout` on the remote side too: killing the ssh client leaves the
    // harness running on the VM, holding fixtures it will never return.
    `cd ${remoteDir} && ${env} timeout ${seconds} bash ${base}`,
  ], { encoding: 'utf8', timeout: timeoutMs + 30_000, maxBuffer: 1 << 26 });

  // RETRIEVED UNCONDITIONALLY, before any branch below can return. Ownership
  // matters most when execution fails: a timeout, a failed assertion and a
  // failed cleanup are exactly the cases where resources are still held, and
  // making retrieval conditional on exit 0 would lose it in all three.
  const ownership = collectOwnership(ctx);

  const durationMs = Date.now() - before;
  const stdout = scrub((res.stdout ?? '') + (res.stderr ?? ''));
  const parsed = parseShellGates(stdout, sha256);

  if (res.status === 124) {
    return { ok: false, reason: `timed out after ${seconds}s`, gates: parsed.gates, durationMs, stdout, ownership };
  }
  if (parsed.mismatch) {
    return { ok: false, reason: parsed.mismatch, gates: parsed.gates, durationMs, stdout, ownership };
  }
  const failures = parsed.gates.filter((g) => g.verdict === 'FAIL');
  const assertions = parsed.gates.filter((g) => g.verdict !== 'NOTE');
  const ok = res.status === 0 && failures.length === 0 && assertions.length > 0;
  const reason = res.status !== 0
    ? `exit ${res.status}`
    : failures.length ? `${failures.length} assertion(s) failed`
    : assertions.length === 0 ? 'harness recorded no assertions (no PASS/FAIL lines)'
    : '';
  return { ok, reason, gates: parsed.gates, durationMs, stdout, ownership };
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
  if (SHELL_HARNESS.test(harness)) return runShellHarness(harness, timeoutMs, runRef, opts.journey ?? null);
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
      // So a harness's ownership manifest can be found and claimed against the
      // run and journey that caused it. Absent when a proof is run by hand,
      // which is why e2eBegin falls back to its own id.
      ...(opts.runRef ? { BANZAMI_VALIDATION_RUN_REF: opts.runRef } : {}),
      ...(opts.journey ? { BANZAMI_VALIDATION_JOURNEY: opts.journey } : {}),
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
  log(`  cleanup barrier: ${CLEANUP_BARRIER ? 'ARMED (0161 applied)' : 'NOT DEPLOYED — cleanup cannot be verified or recorded'}`);
  const waiting = peekQueued(cli.run ?? null);
  if (waiting && waiting.profile === 'FULL' && !CLEANUP_BARRIER) {
    die('VALIDATION_CLEANUP_BARRIER_UNAVAILABLE — the queued run is FULL and the ' +
        'deployed schema predates migration 0161, so per-journey cleanup cannot be ' +
        'verified or recorded. FULL\'s upper bound exceeds the aggregate funds cap ' +
        'without it. The run is left QUEUED and unspent.');
  }

  const run = claim(cli.run ?? null);
  if (!run) { log('no QUEUED run to claim'); return; }
  log(`${run.adopted ? 'adopted' : 'claimed'} ${run.ref} (${run.profile}) as ${EXECUTOR}`);

  const { profile, plan } = planFor(run.profile);
  const beat = setInterval(() => { try { heartbeat(run.id); } catch { /* next tick */ } }, HEARTBEAT_SECONDS * 1000);

  let failedBlocking = 0, passed = 0, failed = 0, skipped = 0, notReached = 0;
  let spent = 0, budgetStopped = null, submitsActual = null, cleanupStopped = null;
  const underDeclared = [];
  try {
    // The plan is materialised first, so a run always says what it INTENDED to
    // do — even if it is cancelled after the second journey.
    for (const p of plan) {
      sql(`INSERT INTO validation_run_journeys
             (run_id, journey_id, suite_id, outcome, record_kind, control_classification, control_reason)
           VALUES (${lit(run.id)}::uuid, ${lit(p.journey)}, ${lit(p.suite)}, 'PLANNED',
                   ${lit(p.kind ?? 'JOURNEY')},
                   ${p.controlClassification ? lit(p.controlClassification) : 'NULL'},
                   ${p.controlReason ? lit(p.controlReason) : 'NULL'})
           ON CONFLICT (run_id, journey_id) DO NOTHING;`, { rows: false });
    }

    // A profile declares what a run may spend. Until something measures it, that
    // is a promise the run cannot keep or break — it is decoration. Measured
    // here, between journeys, against the engine's own definition of volume.
    // Before the plan is materialised and long before a Business is provisioned.
    const budget = checkApplicationBudget(profile, plan);
    const funds = checkFundsBudget(profile, plan);
    const fundsBaseline = funds.live.used;
    const fundsSamples = [];
    const take = (phase, journeyID = null) => {
      const s = sampleFunds(run.id, phase, journeyID, fundsBaseline);
      if (s) fundsSamples.push({ phase, journey: journeyID, ...s });
      return s;
    };
    take('BASELINE');

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
      const pre = take('PRE_JOURNEY', p.journey);
      const fundsBaselineForJourney = pre ? pre.used : null;

      const r = runHarness(p.harness, p.timeoutMs, run.ref,
        { adapter: p.adapter, args: p.args, evidenceStem: p.evidenceStem,
          runRef: run.ref, journey: p.journey });
      for (const g of r.gates) recordGate(run.id, p, g);

      // FUNCTIONAL_RESULT and CLEANUP_RESULT are two answers to two questions.
      // A journey can work perfectly and still leave the Sandbox worse than it
      // found it, and that is not a clean pass — for FULL acceptance or for the
      // journey after it, which inherits the resource.
      const functional = r.ok ? 'PASSED' : 'FAILED';
      // Sampled BEFORE the cleanup verification reads, so exposure created by
      // the journey is recorded even when cleanup then removes it. Without
      // this the peak never sees the money a journey held.
      take('POST_FUNCTIONAL', p.journey);
      const cleanup = verifyCleanup(p, fundsBaselineForJourney);
      take('POST_CLEANUP', p.journey);

      // §3 · what THIS journey's own resources held, at once, at their peak.
      // Measured after cleanup so the retirement postings are in the trajectory
      // too: the peak is a maximum over the whole lifecycle, not a reading at
      // the end of it.
      // Two transports, one contract. A node harness writes its manifest on
      // THIS machine; a shell harness writes it on the VM and the adapter
      // brings it back — already validated against the run, the journey and
      // the nonce this execution minted. Either way the runner ends up
      // holding the same shape, and a shell journey's ownership is no longer
      // invisible merely because it executed somewhere else.
      const manifest = r.ownership?.owned?.length
        ? { runRef: run.ref, journey: p.journey, owned: r.ownership.owned }
        : ownershipManifest(run.ref, p.journey);
      if (r.ownership && r.ownership.state !== 'PRESENT') {
        log(`  ${p.journey}  ownership ${r.ownership.state} — ${r.ownership.detail}`);
      }
      if (r.ownership?.rejected?.length) {
        // Refused records are said out loud. A manifest from a previous run,
        // or one naming another journey, is not this journey's evidence — and
        // silently dropping it would look identical to owning nothing.
        event(run.id, 'RUNNING', 'RUNNING',
          `OWNERSHIP_RECORDS_REJECTED ${p.journey} ${r.ownership.rejected.length} ` +
          `(${[...new Set(r.ownership.rejected.map((x) => x.reason))].join(',')})`);
      }
      const claimed = claimResources(run.id, p.journey, manifest);
      const exposure = measureExposure(p, manifest);
      recordExposure(run.id, p, exposure);
      if (exposure.verdict !== 'VERIFIED') {
        log(`  ${p.journey}  EXPOSURE ${exposure.verdict} — ${exposure.detail}`);
      }
      if (exposure.verdict === 'UNDER_DECLARED') underDeclared.push(`${p.journey}: ${exposure.detail}`);
      void claimed;
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
          // NOT_REACHED, not SKIPPED. These journeys were executable and their
          // adapters were fine; the run stopped before them. Encoding that as
          // SKIPPED with functional_result UNAVAILABLE made two fields
          // conspire to mean a third thing, and made the executor's own
          // counter disagree with the record it had just written.
          mark(run.id, later, 'NOT_REACHED', 'not started: the run stopped at a cleanup barrier',
            { functional: null, cleanup: { result: 'NOT_REACHED', detail: `stopped at ${p.journey}` } });
          notReached++;
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
    const terminal = take('RUN_TERMINAL');
    const finalResidual = terminal ? terminal.delta : 0;
    const { peak: fundsPeak, impossible, samples: sampleCount } = peakFromSamples(fundsSamples, finalResidual);
    // GLOBAL, and named so. These samples are aggregateFunds() — every funded
    // wallet in the Sandbox, including traffic this run did not cause. In
    // BZV-20260920-0001 the global delta happened to equal S10's attributable
    // residual because nothing else moved in that window; a quiet Sandbox is a
    // coincidence, not a construction, and "actual peak" read as if it were
    // attribution.
    log(`  funds: ${sampleCount} sample(s) · GLOBAL_ACTUAL_PEAK_MINOR ${fundsPeak ?? '—'}` +
        ` · final residual ${finalResidual}`);
    if (impossible) {
      // Not a number to print. A run cannot end holding more than its highest
      // observed exposure; if it says so, the instrument is broken and the
      // figure must not be quoted as evidence.
      log(`  FUNDS INSTRUMENTATION FAULT — peak ${fundsPeak} is below the final residual ` +
          `${finalResidual}, which cannot happen. The peak is NOT evidence for this run.`);
      event(run.id, 'RUNNING', 'RUNNING',
        `FUNDS_INSTRUMENTATION_FAULT peak=${fundsPeak} final_residual=${finalResidual}`);
    }
    if (fundsPeak !== null && (fundsPeak > 0 || funds.planned.peak > 0)) {
      const delta = fundsPeak - funds.planned.peak;
      log(`  funds: planned peak max ${funds.planned.peak} · GLOBAL_ACTUAL_PEAK_MINOR ${fundsPeak}` +
          (delta === 0 ? '' : ` · DIVERGENCE ${delta > 0 ? '+' : ''}${delta} — ` +
            (delta > 0 ? 'the plan under-counted (helper-wrapped registrations, or retries)'
                       : 'a journey was not reached, or reused a fixture')));
    }
    // ATTRIBUTABLE, separately, per journey. A global figure cannot answer
    // "did THIS journey stay inside what it declared" — only the owned
    // resources' own trajectory can, and where ownership is not provable the
    // honest answer is UNKNOWN rather than a number borrowed from the global.
    reportAttributableExposure(run.id);

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
    if (underDeclared.length) {
      // A planner defect, not a product one — and not a reason to raise the
      // declaration. The bound is written before the run for a reason.
      log(`  EXPOSURE UNDER-DECLARED in ${underDeclared.length} journey(s):`);
      for (const u of underDeclared) log(`    ${u}`);
    }
    const verdict = failedBlocking === 0 && failed === 0 && !budgetStopped
                    && !cleanupStopped && underDeclared.length === 0 ? 'PASS' : 'FAIL';
    sql(`UPDATE validation_runs SET state='COMPLETED', verdict=${lit(verdict)}, ended_at=now()
         WHERE id=${lit(run.id)}::uuid;`, { rows: false });
    event(run.id, 'RUNNING', 'COMPLETED',
      `${passed} passed, ${failed} failed (${failedBlocking} blocking), ` +
      `${skipped} unavailable, ${notReached} not reached` +
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
    summarise(run.id, run.ref, { passed, failed, skipped, notReached });
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
    // Every outcome counter is scoped to record_kind='JOURNEY'. They were not,
    // and the CONTROL row — which by construction never executes — was counted
    // as a journey that was not reached: `17 passed / 2 failed / 20 not reached`
    // for a universe of 38. The two structural counters below already filtered
    // by kind, so the same SELECT disagreed with itself.
    [row] = sql(
      `SELECT r.state, r.verdict, to_char(r.ended_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
              (SELECT count(*) FROM validation_run_journeys j
                WHERE j.run_id = r.id AND j.record_kind = 'JOURNEY' AND j.outcome = 'PASSED'),
              (SELECT count(*) FROM validation_run_journeys j
                WHERE j.run_id = r.id AND j.record_kind = 'JOURNEY' AND j.outcome = 'FAILED'),
              (SELECT count(*) FROM validation_run_journeys j
                WHERE j.run_id = r.id AND j.record_kind = 'JOURNEY' AND j.outcome = 'UNAVAILABLE'),
              (SELECT count(*) FROM validation_run_journeys j
                WHERE j.run_id = r.id AND j.record_kind = 'JOURNEY' AND j.outcome = 'NOT_REACHED'),
              (SELECT count(*) FROM validation_run_journeys j
                WHERE j.run_id = r.id AND j.record_kind = 'JOURNEY' AND j.outcome = 'SKIPPED'),
              (SELECT count(*) FROM validation_run_journeys j
                WHERE j.run_id = r.id AND j.record_kind = 'JOURNEY'),
              (SELECT count(*) FROM validation_run_journeys j
                WHERE j.run_id = r.id AND j.record_kind = 'CONTROL'),
              (SELECT count(*) FROM validation_run_journeys j
                WHERE j.run_id = r.id AND j.record_kind IS NULL),
              (SELECT coalesce(string_agg(DISTINCT
                        coalesce(j.journey_id, '?') || ' ' ||
                        coalesce(j.control_reason, '?') || ' ' ||
                        coalesce(j.control_classification, '?'), '; '), '')
                 FROM validation_run_journeys j
                WHERE j.run_id = r.id AND j.record_kind = 'CONTROL'),
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
  const [state, verdict, endedAt, pass, fail, unavail, notReached, skipped,
         journeys, controls, legacy, controlDetail, total, evidence] = row;
  log(`\n${runRef}  ${state}  ${verdict}`);
  // Three blocks, because they answer three different questions: what the
  // product did, what was declared unexecutable, and how many rows exist.
  log(`  JOURNEY    ${pass} passed · ${fail} failed · ${notReached} not reached` +
      ` · ${unavail} unavailable · ${skipped} skipped · ${journeys} total`);
  log(`  CONTROL    ${controls} total${controlDetail ? ` — ${controlDetail}` : ''}`);
  log(`  RECORDS    ${total} materialised` +
      (Number(legacy) > 0 ? `  ← ${legacy} LEGACY row(s) (pre-0162), counted in neither block` : ''));
  log(`  evidence   ${evidence} hashed row(s)`);
  log(`  finished   ${endedAt}`);
  log('  (read back from validation_runs; the database is the authority for this run)');

  const drift = [];
  if (Number(pass) !== expected.passed) drift.push(`passed ${expected.passed}→${pass}`);
  if (Number(fail) !== expected.failed) drift.push(`failed ${expected.failed}→${fail}`);
  if (Number(unavail) !== expected.skipped) drift.push(`unavailable ${expected.skipped}→${unavail}`);
  if (Number(notReached) !== (expected.notReached ?? 0)) drift.push(`not reached ${expected.notReached ?? 0}→${notReached}`);
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
    // A journey that was never attempted has no functional result. NULL says
    // that; 'UNAVAILABLE' would claim its adapter was the problem.
    ? `, functional_result=${results.functional ? lit(results.functional) : 'NULL'}` +
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
/** Does the deployed schema carry 0162's samples table? Probed, never assumed. */
let FUNDS_SAMPLES = false;
/** Does the deployed schema carry 0161's resource ledger and 0163's verdict? */
let RESOURCE_LEDGER = false;
let EXPOSURE_COLUMNS = false;
function probeCleanupBarrier() {
  try {
    const [row] = sql(
      `SELECT count(*) FROM information_schema.columns
        WHERE table_name='validation_run_journeys'
          AND column_name IN ('functional_result','cleanup_result','cleanup_detail');`);
    CLEANUP_BARRIER = Number(row?.[0]) === 3;
  } catch { CLEANUP_BARRIER = false; }
  try {
    const [row] = sql(`SELECT count(*) FROM information_schema.tables
                        WHERE table_name = 'validation_run_funds_samples';`);
    FUNDS_SAMPLES = Number(row?.[0]) === 1;
  } catch { FUNDS_SAMPLES = false; }
  try {
    const [row] = sql(`SELECT
        (SELECT count(*) FROM information_schema.tables WHERE table_name='validation_run_resources'),
        (SELECT count(*) FROM information_schema.columns
          WHERE table_name='validation_run_journeys' AND column_name='exposure_verdict');`);
    RESOURCE_LEDGER = Number(row?.[0]) === 1;
    EXPOSURE_COLUMNS = Number(row?.[1]) === 1;
  } catch { RESOURCE_LEDGER = false; EXPOSURE_COLUMNS = false; }
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

/* ── D-3: funded exposure, sampled where it changes ──────────────────────────
 *
 * The peak used to be read once per loop iteration, at the top, so the rise
 * caused by the LAST executed journey was never sampled at all: a run that
 * left +2 000 000 behind reported actual peak 0. A peak below the residual it
 * is meant to bound is not an approximation — the instrument was reading zero
 * while the needle moved.
 */
const FUNDS_PHASES = ['BASELINE', 'PRE_JOURNEY', 'POST_FUNCTIONAL', 'POST_CLEANUP', 'RUN_TERMINAL'];

/**
 * Take one sample and persist it. Returns the delta, or null if unreadable.
 *
 * `read` and `write` are injectable ONLY so the phase sequence can be proven
 * without a Validation Run: writing test samples against a real run_id would
 * attach invented evidence to a historical run, which is the one thing 0162
 * was careful not to do to those rows.
 */
export function sampleFunds(runID, phase, journeyID, baseline, {
  read = () => aggregateFunds().used,
  write = null,
} = {}) {
  if (!FUNDS_PHASES.includes(phase)) throw new Error(`unknown funds phase ${phase}`);
  let used;
  try { used = read(); } catch { return null; }
  const delta = baseline === null ? 0 : used - baseline;
  const persist = write ?? ((row) => {
    if (!FUNDS_SAMPLES) return;
    sql(`INSERT INTO validation_run_funds_samples
           (run_id, journey_id, phase, used_minor, delta_from_baseline_minor)
         VALUES (${lit(row.runID)}::uuid, ${row.journeyID ? lit(row.journeyID) : 'NULL'},
                 ${lit(row.phase)}, ${row.used}, ${row.delta});`, { rows: false });
  });
  persist({ runID, journeyID, phase, used, delta });
  return { used, delta };
}

/**
 * The peak, and whether it can be believed.
 *
 * `impossible` is the state this whole instrument exists to make unreachable:
 * a run that ended holding more than it started with, reporting a peak lower
 * than that residual. It cannot be true, so it is reported as an
 * instrumentation fault rather than quietly printed as a number.
 */
export function peakFromSamples(samples, finalResidual) {
  const deltas = samples.map((s) => Number(s.delta));
  const peak = deltas.length ? Math.max(...deltas) : null;
  const impossible = finalResidual > 0 && (peak === null || peak < finalResidual);
  return { peak, impossible, samples: deltas.length };
}

/* ── §3: attributable exposure ───────────────────────────────────────────────
 *
 * The aggregate samples protect the shared cap. They cannot validate a
 * journey's declaration, because this Sandbox also carries DOA's production
 * and the aggregate moves for reasons that have nothing to do with the journey
 * being measured. This reads the ledger trajectory of the resources the
 * harness HANDED OVER, which is ownership declared at creation rather than
 * reconstructed afterwards from handles and timestamps.
 */

/** What the harness said it owns. Null when it said nothing. */
function ownershipManifest(runRef, journeyID) {
  const f = join(process.env.TMPDIR || '/tmp', 'banzami-e2e-manifests', `run-${runRef}-${journeyID}.json`);
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; }
}

/** Claim the resources against the run and journey that created them. */
function claimResources(runID, journeyID, manifest) {
  if (!RESOURCE_LEDGER || !manifest?.owned?.length) return 0;
  for (const r of manifest.owned) {
    // Fail closed: a kind with no class is not persisted as a BUSINESS just
    // because BUSINESS was the else-branch. It used to be, so a test payer, a
    // payment link and an API key would all have been recorded as Businesses.
    const cls = ownedClassFor(r.kind);
    if (!cls) continue;
    sql(`INSERT INTO validation_run_resources
           (run_id, journey_id, resource_class, resource_ref, cleanup_required, cleanup_state, cleanup_evidence)
         VALUES (${lit(runID)}::uuid, ${lit(journeyID)}, ${lit(cls)}, ${lit(String(r.id))},
                 true, 'PENDING', ${lit(JSON.stringify(r.meta ?? {}).slice(0, 400))})
         ON CONFLICT (run_id, journey_id, resource_class, resource_ref) DO NOTHING;`, { rows: false });
  }
  return manifest.owned.length;
}

/**
 * Every signed balance change on the journey's owned resources, with its
 * timestamp — a grant, a funding, a payment either way, a retirement posting.
 * Consumers are resolved by handle because that is what the harness hands
 * over; the id lookup is read-only.
 */
function ownedLedgerEvents(refs) {
  if (!refs.length) return null;
  const list = refs.map((r) => lit(String(r))).join(',');
  try {
    return sql(`
      SELECT c.handle,
             to_char(le.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             (CASE WHEN le.entry_type='CREDIT' THEN le.amount_minor ELSE -le.amount_minor END)::text
        FROM consumers c
        JOIN consumer_wallets cw ON cw.consumer_id = c.id
        JOIN ledger_entries le ON le.account_id = cw.available_account_id
       WHERE c.handle IN (${list})
       ORDER BY le.created_at;`)
      .map(([resource, at, delta]) => ({ resource, at, delta: Number(delta) }));
  } catch { return null; }
}

/** Measure, or say honestly that it could not be measured. */
function measureExposure(p, manifest) {
  const declared = typeof p.max_synthetic_funds_exposure_minor === 'number'
    ? p.max_synthetic_funds_exposure_minor : null;
  const fundingCapable = (p.disposable ?? 0) > 0;
  if (!fundingCapable) {
    return { ...exposureVerdict({ declared, actual: 0, fundingCapable: false }), declared, actual: 0, resources: 0, events: 0 };
  }
  if (!manifest || !manifest.owned?.length) {
    // The harness created something disposable and handed nothing over, so
    // nothing here knows what to measure. UNKNOWN, and UNKNOWN fails closed.
    return { ...exposureVerdict({ declared, actual: null, ownershipKnown: false }), declared, actual: null, resources: 0, events: 0 };
  }
  const refs = manifest.owned.filter((r) => r.kind === 'consumer').map((r) => r.id);
  const events = ownedLedgerEvents(refs);
  if (events === null) {
    return { ...exposureVerdict({ declared, actual: null, ownershipKnown: false }), declared, actual: null, resources: refs.length, events: 0 };
  }
  const { peak, resources, events: n } = attributablePeak(events);
  return { ...exposureVerdict({ declared, actual: peak }), declared, actual: peak, resources, events: n };
}

function recordExposure(runID, p, e) {
  if (!EXPOSURE_COLUMNS) return;
  sql(`UPDATE validation_run_journeys SET
         declared_peak_minor = ${e.declared === null ? 'NULL' : e.declared},
         actual_attributable_peak_minor = ${e.actual === null ? 'NULL' : e.actual},
         exposure_verdict = ${lit(e.verdict)},
         exposure_detail = ${lit(String(e.detail).slice(0, 400))},
         exposure_resource_count = ${e.resources}, exposure_event_count = ${e.events},
         exposure_measured_at = now()
       WHERE run_id = ${lit(runID)}::uuid AND journey_id = ${lit(p.journey)};`, { rows: false });
}

/**
 * The attributable side of the funds picture, read back from the rows.
 *
 * Printed next to the global peak and never merged with it. The four
 * quantities are named because the ambiguous one — "actual peak" — was read as
 * attribution when it was a global aggregate delta, and the two are only ever
 * equal by accident.
 *
 * UNKNOWN is listed, not omitted. A journey whose exposure could not be
 * attributed is the single most important line here: it is the one the
 * declaration gate cannot enforce.
 */
function reportAttributableExposure(runID) {
  if (!EXPOSURE_COLUMNS) return;
  let rows;
  try {
    rows = sql(`SELECT exposure_verdict, count(*),
                       coalesce(max(actual_attributable_peak_minor), 0)
                  FROM validation_run_journeys
                 WHERE run_id = ${lit(runID)}::uuid
                   AND record_kind = 'JOURNEY' AND exposure_verdict IS NOT NULL
                 GROUP BY 1 ORDER BY 1;`);
  } catch (e) {
    log(`  exposure: could not be read back (${e.message}) — not quoting a figure`);
    return;
  }
  if (!rows.length) { log('  exposure: no journey recorded an exposure verdict'); return; }
  const by = Object.fromEntries(rows.map(([v, n, peak]) => [v, { n: Number(n), peak: Number(peak) }]));
  const verified = by.VERIFIED?.n ?? 0, under = by.UNDER_DECLARED?.n ?? 0, unknown = by.UNKNOWN?.n ?? 0;
  log(`  exposure: VERIFIED ${verified} · UNDER_DECLARED ${under} · UNKNOWN ${unknown}` +
      ` · max ATTRIBUTABLE_ACTUAL_PEAK_MINOR ${by.VERIFIED?.peak ?? 0}`);
  if (unknown > 0) {
    log(`  EXPOSURE NOT ENFORCEABLE for ${unknown} journey(s) — ownership could not be ` +
        'established, so the declared peak was not validated against anything');
  }
  if (under > 0) {
    log(`  UNDER_DECLARED ${under} journey(s) — the registry declaration is the bound, ` +
        'and the run exceeded it; the declaration is NOT raised to match');
  }
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
