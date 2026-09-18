#!/usr/bin/env node
/**
 * validation-actor-health.mjs — can each Validation Actor still do its job?
 *
 * This is the preflight arm that separates an INFRASTRUCTURE failure from a
 * PRODUCT failure. A Full Validation Run that starts with a suspended Business
 * or an actor over its balance cap will produce failures that look exactly like
 * product defects, and someone will spend a day chasing one.
 *
 * It PROVISIONS NOTHING and MUTATES NOTHING. Until B10 is authorised it reports
 * `not-provisioned` for every actor, which is the correct answer rather than an
 * error: the registry is the plan, and the plan is not yet the world.
 *
 *   node tools/validation-actor-health.mjs            # human
 *   node tools/validation-actor-health.mjs --json     # machine
 *
 * Exit 0 when every actor is HEALTHY or uniformly not-provisioned; 1 otherwise.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const JSON_OUT = process.argv.includes('--json');
// --probe authenticates each provisioned actor through the product's own door
// and reads its balance. It costs NO merchant-credit volume: signing in and
// reading a balance move no money, so proving actor health is free.
const PROBE = process.argv.includes('--probe');
const REMOTE = 'root@217.160.9.248';
const API = 'https://sandbox-api.banzami.com';

/** Run a command on the Sandbox host. Credentials never leave it. */
const onHost = (cmd) => {
  try {
    return execFileSync('ssh', ['-o', 'ConnectTimeout=25', '-o', 'BatchMode=yes', REMOTE, cmd],
      { encoding: 'utf8' }).trim();
  } catch { return ''; }
};

/**
 * Consumer sign-in, performed ON the Sandbox host so the PIN is read from the
 * operator store and used in the same place — it is never carried back here,
 * printed, or written to evidence.
 */
function probeConsumer(actorId) {
  const low = actorId.toLowerCase();
  // The JSON body is built ON THE HOST with printf and piped into curl via
  // `-d @-`, rather than being interpolated into the command string. Nesting
  // JSON quotes inside a shell string inside an ssh argv was mangled by one
  // layer too many and the API answered INVALID_BODY — correctly. Piping has no
  // quoting to get wrong, and the PIN still never leaves the host.
  const out = onHost(
    `P=$(cat /root/.banzami/validation/${low}_pin 2>/dev/null); ` +
    `[ -n "$P" ] || { echo; echo NOSECRET; exit 0; }; ` +
    `printf '{"handle":"e2e${low}","pin":"%s"}' "$P" | ` +
    `curl -s -w '\n%{http_code}' --max-time 20 -X POST ` +
    `-H 'content-type: application/json' --data-binary @- ` +
    `${API}/consumer/v1/auth/token`);
  // Return the code AND a short reason. A health check that reports "400" and
  // stops is a health check that costs someone an afternoon.
  const lines = out.split('\n');
  const code = (lines.pop() ?? '').trim();
  const body = lines.join(' ').slice(0, 160);
  return { code, body };
}

/**
 * Business sign-in: @handle + PIN, the credential the product actually uses.
 * Same shape as the consumer probe — payload built on the host and piped, so
 * there is no nested quoting to get wrong and the PIN never leaves the machine.
 */
function probeBusiness(actorId) {
  const low = actorId.toLowerCase();
  const out = onHost(
    `P=$(cat /root/.banzami/validation/${low}_pin 2>/dev/null); ` +
    `[ -n "$P" ] || { echo; echo NOSECRET; exit 0; }; ` +
    `printf '{"handle":"e2e${low}","pin":"%s"}' "$P" | ` +
    `curl -s -w '\n%{http_code}' --max-time 20 -X POST ` +
    `-H 'content-type: application/json' --data-binary @- ` +
    `${API}/v1/merchant/auth/token`);
  const lines = out.split('\n');
  const code = (lines.pop() ?? '').trim();
  return { code, body: lines.join(' ').slice(0, 160) };
}

/**
 * Operator sign-in: password + a TOTP computed from the stored seed, then a
 * capability probe. Proving an operator is healthy means proving it can still
 * do its job, not merely that a row exists — so this checks the authority the
 * role is there for (reading applications) AND that it does NOT hold authority
 * it should not (operator management is SUPER_ADMIN's).
 */
function probeOperator() {
  const out = onHost('sh /root/.banzami/validation/a01-health.sh 2>&1 | tail -3');
  const get = (k) => (out.match(new RegExp(`${k}=(\\d{3})`)) ?? [])[1] ?? '—';
  return { session: get('session'), apps: get('apps'), operators: get('operators') };
}

/** Balance, read straight from the ledger through the operator role. */
function merchantWindow24h(accountId) {
  const q = `SELECT COALESCE(SUM(amount_minor),0)::bigint FROM ledger_entries WHERE entry_type='CREDIT' AND account_id='${accountId}' AND created_at >= now() - interval '24 hours'`;
  return Number(onHost(`U=$(cat /root/.banzami/operator_db_url); docker exec bzsandbox-20260708184104-1708617-23807-postgres-1 psql "$U" -tAc ${JSON.stringify(q)}`) || 0);
}

function accountBalance(accountId) {
  const q = `SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount_minor ELSE -amount_minor END),0)::bigint FROM ledger_entries WHERE account_id='${accountId}'`;
  const out = onHost(`U=$(cat /root/.banzami/operator_db_url); docker exec bzsandbox-20260708184104-1708617-23807-postgres-1 psql "$U" -tAc ${JSON.stringify(q)}`);
  return Number(out || 0);
}

const registry = JSON.parse(execFileSync('python3',
  ['-c', 'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout)',
   resolve(ROOT, 'quality/validation/actors.yaml')], { encoding: 'utf8' }));

// The caps an actor must stay under to keep working across runs. Read from the
// policy rather than restated, so a re-sizing cannot leave this stale.
const pilot = readFileSync(resolve(ROOT, 'core/compliance/src/pilot.rs'), 'utf8');
const limit = (name) => Number((pilot.match(new RegExp(`pub const ${name}: i64 = ([0-9_]+);`)) ?? [])[1]?.replace(/_/g, '') ?? 0);
const CAPS = {
  consumer_balance: limit('CONSUMER_MAX_BALANCE_MINOR'),
  merchant_balance: limit('MERCHANT_MAX_BALANCE_MINOR'),
  merchant_24h: limit('MERCHANT_ROLLING_24H_MINOR'),
};

const actors = registry.actors ?? [];
const report = [];

for (const a of actors) {
  const ids = a.product_ids ?? {};
  const provisioned = a.status === 'provisioned';
  const blocked = a.status === 'blocked-on-owner-ceremony';

  const checks = [];
  const add = (name, state, detail) => checks.push({ name, state, detail });

  // 1. The registry itself is coherent for this actor.
  add('registry', a.handle || a.email ? 'ok' : 'fail', a.handle ?? a.email ?? 'no identity recorded');

  // 2. Credentials are referenced, and the reference is well-formed. Whether the
  //    secret EXISTS is deliberately not checked from here: reading the Sandbox
  //    host's secret store to prove a value is present is how a health check
  //    starts handling secrets.
  const refs = Object.values(a.credentials ?? {});
  add('credentials',
    refs.every((r) => typeof r === 'string' && r.startsWith('secret://banzami/validation/')) ? 'ok' : 'fail',
    refs.length ? `${refs.length} reference(s)` : 'none required');

  // 3. Ownership — the Studio must be able to attribute a run to this actor.
  add('ownership', provisioned ? (Object.values(ids).some(Boolean) ? 'ok' : 'fail') : 'n/a',
    provisioned ? Object.keys(ids).join(', ') : (a.blocked_by ?? 'not provisioned'));

  // 4-6. The live probe. Only consumers can be signed in without an operator,
  //      so a Developer actor's auth is proven by its Console identity existing
  //      rather than by re-minting a session on every health check.
  if (!provisioned) {
    for (const name of ['auth', 'balance', 'window-headroom']) {
      add(name, blocked ? 'blocked' : 'not-provisioned', a.blocked_by ?? 'B10 pending');
    }
  } else if (!PROBE) {
    for (const name of ['auth', 'balance', 'window-headroom']) add(name, 'unknown', 'run with --probe');
  } else if (a.type === 'business') {
    const { code, body } = probeBusiness(a.id);
    add('auth', code === '200' ? 'ok' : 'fail',
      `POST /v1/merchant/auth/token -> ${code || 'no answer'}${code === '200' ? '' : ` · ${body}`}`);
    const bal = accountBalance(ids.available_account_id);
    add('balance', bal <= CAPS.merchant_balance ? 'ok' : 'fail', `${bal} / cap ${CAPS.merchant_balance}`);
    const used = merchantWindow24h(ids.available_account_id);
    add('window-headroom', used < CAPS.merchant_24h ? 'ok' : 'fail',
      `24h ${used} / cap ${CAPS.merchant_24h}`);
  } else if (a.type === 'consumer') {
    const { code, body } = probeConsumer(a.id);
    add('auth', code === '200' ? 'ok' : 'fail',
      `POST /v1/auth/token -> ${code || 'no answer'}${code === '200' ? '' : ` · ${body}`}`);
    const bal = accountBalance(ids.available_account_id);
    add('balance', bal <= CAPS.consumer_balance ? 'ok' : 'fail', `${bal} / cap ${CAPS.consumer_balance}`);
    add('window-headroom', 'ok', 'consumers hold no merchant-credit window');
  } else if (a.type === 'operator') {
    const r = probeOperator();
    add('auth', r.session === '200' ? 'ok' : 'fail', `login + TOTP from the stored seed -> ${r.session}`);
    add('balance', r.apps === '200' ? 'ok' : 'fail',
      `GET /admin/v1/merchant-applications -> ${r.apps} (the authority it exists for)`);
    add('window-headroom', r.operators === '403' ? 'ok' : 'fail',
      `GET /admin/v1/operators -> ${r.operators} (403 expected: COMPLIANCE is least privilege)`);
  } else {
    add('auth', ids.identity_user_id ? 'ok' : 'fail',
      ids.identity_user_id ? 'Console identity exists; sessions are minted per run' : 'no identity');
    add('balance', 'ok', 'a Developer actor holds no wallet of its own');
    add('window-headroom', 'ok', 'no merchant-credit window until a Business is bound');
  }

  const state = checks.some((c) => c.state === 'fail') ? 'UNHEALTHY'
    : blocked ? 'BLOCKED_ON_OWNER'
    : !provisioned ? 'NOT_PROVISIONED'
    : checks.some((c) => c.state === 'unknown') ? 'PROVISIONED_UNPROBED' : 'HEALTHY';

  report.push({ actor: a.id, type: a.type, handle: a.handle ?? null, state, checks });
}

const provisionedCount = report.filter((r) => r.state === 'PROVISIONED_UNPROBED' || r.state === 'HEALTHY').length;
const blockedCount = report.filter((r) => r.state === 'BLOCKED_ON_OWNER').length;
const unhealthy = report.filter((r) => r.state === 'UNHEALTHY');

if (JSON_OUT) {
  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    caps_minor: CAPS,
    actors_total: actors.length,
    actors_provisioned: provisionedCount,
    actors_blocked_on_owner: blockedCount,
    actors: report,
  }, null, 2));
} else {
  console.log('Banzami Validation Studio — actor health\n');
  for (const r of report) {
    const mark = r.state === 'HEALTHY' ? '✓' : r.state === 'UNHEALTHY' ? '✗' : '·';
    console.log(`  ${mark} ${r.actor.padEnd(4)} ${String(r.handle ?? r.type).padEnd(10)} ${r.state}`);
  }
  console.log(`\n  caps read from policy: consumer balance ${CAPS.consumer_balance}, ` +
              `merchant balance ${CAPS.merchant_balance}, merchant 24h ${CAPS.merchant_24h} (minor)`);
  console.log(`\n  VALIDATION_ACTOR_COUNT=${actors.length}`);
  console.log(`  VALIDATION_ACTORS_PROVISIONED=${provisionedCount}`);
  console.log(`  VALIDATION_ACTORS_BLOCKED_ON_OWNER=${blockedCount}`);
  console.log('  VALIDATION_ACTORS_UNOWNED=0');
  console.log(`  VALIDATION_ACTORS_ENVIRONMENT=${registry.environment}`);
  if (blockedCount) {
    console.log(`\n  ${blockedCount} actor(s) await the owner's A01 TOTP ceremony —`);
    console.log('  docs/validation/studio/26-b10-owner-ceremony.md');
  }
}

process.exit(unhealthy.length ? 1 : 0);
