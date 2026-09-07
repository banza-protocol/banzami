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
  const n = Number(rules);
  if (n === 0) { bad(`${name} is assigned ${code}, which has no active rule — assigned on paper, unpriced in practice`); continue; }
  if (n > 1) { bad(`${name}: ${code} has ${n} active rules — selection would be ambiguous`); continue; }
  ok(`${name.padEnd(34)} ${code} (1 active rule)`);
}

// The two states that must never collapse into each other.
const zero = q(`select rate_bps from pricing_rules
                 where pricing_profile = 'sandbox-default' and environment = 'SANDBOX' and enabled`);
zero === '0'
  ? ok('sandbox-default is an EXPLICIT zero rule, not the absence of one')
  : bad(`sandbox-default rate is "${zero}" — the explicit zero is missing`);

// ── withdrawals ─────────────────────────────────────────────────────────────
//
// The gate that must pass BEFORE payouts start refusing an absent rule, for the
// same reason as above: an engine that fails closed with nothing configured is
// an outage, not a fix.
//
// This half is not about owners. Withdrawal pricing is keyed on the operation's
// transaction type, which the payout engine hard-codes — no caller supplies it
// — so the question is simply whether exactly one enabled rule applies to a
// Sandbox withdrawal.
//
// It has been zero before. The payout harness once measured a fee of ZERO
// because pricing_rules was empty after a financial reset, and the operator
// withdrew money charging nothing (REPAIR_LOG RA-063). Migration 0108 seeds the
// rule so a reset cannot repeat that; this proves the seed actually took.
console.log('\nwithdrawal pricing completeness\n');

const wRows = q(`
  select rule_key, rate_bps, coalesce(business_category, '*'), coalesce(pricing_profile, '*')
    from pricing_rules
   where environment = 'SANDBOX'
     and transaction_type = 'wallet_withdrawal'
     and enabled
     and (effective_from is null or effective_from <= now())
     and (effective_to   is null or effective_to   >  now())`).split('\n').filter(Boolean).map((l) => l.split('|'));

if (wRows.length === 0) {
  bad('no enabled rule applies to a Sandbox withdrawal — every payout would be free');
} else if (wRows.length > 1) {
  bad(`${wRows.length} enabled rules apply to a Sandbox withdrawal — selection would be ambiguous`);
} else {
  const [key, rate, cat, profile] = wRows[0];
  ok(`${key.padEnd(34)} ${rate} bps (1 active rule)`);
  // A withdrawal rule pinned to a category or a profile would apply to some
  // withdrawals and not others, which is the ambiguity above wearing a
  // different hat: the ones it misses would be free.
  if (cat !== '*' || profile !== '*') {
    bad(`${key} is narrowed to category=${cat} profile=${profile} — withdrawals outside it would resolve no rule`);
  } else {
    ok('the withdrawal rule is unconditional — no withdrawal can fall outside it');
  }
}

console.log();
if (fail) { console.error(`✗ pricing assignment gate FAILED (${fail})`); process.exit(1); }
console.log('✓ every settlement-capable owner has exactly one active, environment-correct rate');
console.log('✓ exactly one unconditional rule prices a Sandbox withdrawal');
