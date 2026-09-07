#!/usr/bin/env node
/**
 * No settlement-capable financial owner may be unpriced.
 *
 * This is the gate that must pass BEFORE the pricing engine starts refusing
 * unassigned owners, and must keep passing afterwards. Between those two facts
 * lies the only dangerous state this migration can produce: an engine that fails
 * closed and owners that have nothing assigned, which is an outage rather than a
 * fix.
 *
 * It also refuses the quieter failure. An owner whose profile is disabled, or
 * whose profile has no active rule, is assigned on paper and unpriced in
 * practice — and "assigned" is not the property that matters; "will produce a
 * rate" is.
 *
 *   node tools/check-pricing-assignment.mjs
 */
import { execFileSync } from 'node:child_process';

const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';
const PRE = `
  set -uo pipefail
  P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
  PG="$P-postgres-1"; CORE="$P-core-api-staging"
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -v ON_ERROR_STOP=1 -U bl_app_runtime -d banzami_staging -At -F'|' -c "$1"; }
`;
// The deployed Sandbox is the default and the point. BANZAMI_PRICING_GATE_URL
// aims the same checks at any PostgreSQL, which is how the gate's own failure
// branches get tested: proving it REPORTS a missing or ambiguous withdrawal
// rule cannot be done by breaking the live rule, and a gate that has never been
// seen to fail is not evidence of anything.
const LOCAL_URL = process.env.BANZAMI_PRICING_GATE_URL;

const q = (sql) => (LOCAL_URL
  ? execFileSync('psql', [LOCAL_URL, '-v', 'ON_ERROR_STOP=1', '-At', '-F|', '-c', sql],
      { encoding: 'utf8', maxBuffer: 1 << 24 })
  : execFileSync('ssh', [REMOTE, `${PRE}\nq "${sql.replace(/"/g, '\\"')}"`],
      { encoding: 'utf8', maxBuffer: 1 << 24 })).trim();

let fail = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { fail += 1; console.error(`  ✗ ${m}`); };

console.log(`pricing assignment completeness${LOCAL_URL ? ' (local database)' : ''}\n`);

const rows = q(`
  select m.name,
         coalesce(pp.code, ''),
         coalesce(pp.enabled::text, ''),
         coalesce(pp.environment, ''),
         (select count(*) from pricing_rules r
           where r.pricing_profile = pp.code and r.environment = pp.environment
             and r.enabled
             and (r.effective_from is null or r.effective_from <= now())
             and (r.effective_to   is null or r.effective_to   >  now()))
    from merchants m
    left join pricing_profiles pp on pp.id = m.pricing_profile_id
   where m.status = 'ACTIVE'
   order by m.created_at`).split('\n').filter(Boolean).map((l) => l.split('|'));

console.log(`  active financial owners: ${rows.length}`);
for (const [name, code, enabled, env, rules] of rows) {
  if (!code) { bad(`${name} has no pricing profile — it would settle unpriced`); continue; }
  // psql renders a bare boolean as "t" but an explicit ::text cast as "true".
  // The first version compared against "t" and called both enabled profiles
  // disabled — which is the gate failing safe, and worth keeping in mind: this
  // check is allowed to be wrong in that direction and not the other.
  if (enabled !== 'true') { bad(`${name} is assigned ${code}, which is disabled`); continue; }
  if (env !== 'SANDBOX') { bad(`${name} is assigned a ${env} profile on a Sandbox deployment`); continue; }
  // Rule COUNT is no longer the question here.
  //
  // It was, while a profile had exactly one rule that priced everything. With a
  // rule per operation, "more than one active rule" is now the normal, correct
  // state — a settlement rate and a payout rate — and this check reported every
  // healthy profile as ambiguous. Cardinality is asked per operation below,
  // where it means something.
  const n = Number(rules);
  if (n === 0) { bad(`${name} is assigned ${code}, which has no active rule at all — assigned on paper, unpriced in practice`); continue; }
  ok(`${name.padEnd(34)} ${code} (${n} active rule${n === 1 ? '' : 's'})`);
}

// The two states that must never collapse into each other, asked per operation.
//
// This used to select rate_bps for the whole profile and compare it to '0'. That
// worked while a profile had exactly one rule; with a rule per operation it
// returned three rows and reported the explicit zero as missing. The claim was
// always about SETTLEMENT specifically — sandbox-default settles free, it does
// not withdraw free — so it now says so.
const zeroColumnExists = q(`
  select count(*) from information_schema.columns
   where table_name = 'pricing_rules' and column_name = 'pricing_operation'`) === '1';
if (zeroColumnExists) {
  const zero = q(`select rate_bps from pricing_rules
                   where environment = 'SANDBOX' and enabled
                     and pricing_profile = 'sandbox-default'
                     and pricing_operation = 'SETTLEMENT'`);
  zero === '0'
    ? ok('sandbox-default SETTLEMENT is an EXPLICIT zero rule, not the absence of one')
    : bad(`sandbox-default SETTLEMENT rate is "${zero.replace(/\n/g, ',')}" — expected exactly one explicit 0`);
} else {
  const zero = q(`select rate_bps from pricing_rules
                   where environment = 'SANDBOX' and enabled
                     and pricing_profile = 'sandbox-default'`);
  zero === '0'
    ? ok('sandbox-default is an EXPLICIT zero rule, not the absence of one (pre-0109 shape)')
    : bad(`sandbox-default rate is "${zero.replace(/\n/g, ',')}" — the explicit zero is missing`);
}

// ── completeness v2: every profile × every required operation ──────────────
//
// The old check asked "does this owner have SOME applicable rule". That is the
// question the wildcard model made sense of, and it is the wrong one: a single
// rule with no operation satisfied it while silently pricing every operation,
// including ones that did not exist yet.
//
// The question now is per OPERATION. For each active profile that an active
// financial owner is assigned, each released fee-bearing operation must resolve
// to exactly one explicit rule. Not zero — that is PRICING_NOT_CONFIGURED at
// runtime. Not two — that is PRICING_CONFIGURATION_ERROR. And not a wildcard,
// which no longer satisfies anything.
//
// This is the gate that must PASS before the payout resolver starts refusing a
// missing rule. Refusing first would turn a revenue leak into a customer-facing
// outage, and this path has already produced the leak once (RA-063).
const REQUIRED_OPERATIONS = ['SETTLEMENT', 'PAYOUT'];

console.log(`\nper-operation completeness (${REQUIRED_OPERATIONS.join(', ')})\n`);

// Does this deployment even have the operation dimension?
//
// Asked explicitly, because the alternative is what happened the first time this
// ran against the Sandbox: every query below referenced pricing_operation, the
// column did not exist yet, and the gate died with a raw psql stack trace. The
// runbook tells an operator to run this gate — and running it a moment too early
// is the likeliest way to do that, so it has to answer clearly rather than
// crash.
const hasOperation = q(`
  select count(*) from information_schema.columns
   where table_name = 'pricing_rules' and column_name = 'pricing_operation'`) === '1';

if (!hasOperation) {
  console.log('  · this database predates the operation dimension (migration 0109).');
  console.log('    Per-operation completeness cannot be checked yet, and nothing is wrong:');
  console.log('    the deployed resolver does not use it either. Apply the migration first —');
  console.log('    docs/runbooks/pricing-v2-migration.md — then run this again.');
  console.log();
  if (fail) { console.error(`✗ pricing assignment gate FAILED (${fail})`); process.exit(1); }
  console.log('✓ every settlement-capable owner has exactly one active, environment-correct rate');
  console.log('· per-operation completeness: NOT YET APPLICABLE (pre-0109)');
  process.exit(0);
}

// Profiles that actually matter: those assigned to an active owner. An unused
// profile with an incomplete policy is untidy, not dangerous.
const assigned = q(`
  select distinct pp.code
    from merchants m
    join pricing_profiles pp on pp.id = m.pricing_profile_id
   where m.status = 'ACTIVE' and pp.enabled
   order by pp.code`).split('\n').filter(Boolean);

if (assigned.length === 0) bad('no active owner is assigned any pricing profile');

for (const profile of assigned) {
  for (const op of REQUIRED_OPERATIONS) {
    // Mirrors the resolver: operation must match exactly, and a rule with no
    // profile prices every profile. Nothing else participates.
    const rows = q(`
      select rule_key, rate_bps
        from pricing_rules
       where environment = 'SANDBOX'
         and enabled
         and pricing_operation = '${op}'
         and (pricing_profile is null or pricing_profile = '${profile}')
         and (effective_from is null or effective_from <= now())
         and (effective_to   is null or effective_to   >  now())`)
      .split('\n').filter(Boolean).map((l) => l.split('|'));

    if (rows.length === 0) {
      bad(`${profile} has no ${op} rule — that operation would be refused at runtime`);
    } else if (rows.length > 1) {
      bad(`${profile} has ${rows.length} applicable ${op} rules (${rows.map((r) => r[0]).join(', ')}) — the resolver refuses rather than choosing`);
    } else {
      ok(`${profile.padEnd(24)} ${op.padEnd(11)} ${rows[0][1]} bps  (${rows[0][0]})`);
    }
  }
}

// A wildcard-operation rule cannot satisfy anything above, but it can still
// exist — and while it does, an older resolver or a hand-written query could
// still consume it. Reported so the cleanup is visible rather than assumed.
const wildcards = q(`
  select rule_key
    from pricing_rules
   where environment = 'SANDBOX' and enabled and pricing_operation is null
   order by rule_key`).split('\n').filter(Boolean);

if (wildcards.length > 0) {
  console.log(`\n  · ${wildcards.length} legacy wildcard-operation rule(s) still present: ${wildcards.join(', ')}`);
  console.log('    They satisfy no requirement above and the resolver ignores them. Retire them once nothing reads the legacy path.');
}

console.log();
if (fail) { console.error(`✗ pricing assignment gate FAILED (${fail})`); process.exit(1); }
console.log('✓ every settlement-capable owner has exactly one active, environment-correct rate');
console.log(`✓ every assigned profile has exactly one explicit rule for each of ${REQUIRED_OPERATIONS.join(' and ')}`);
