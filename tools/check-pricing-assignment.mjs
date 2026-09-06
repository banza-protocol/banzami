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
const q = (sql) => execFileSync('ssh', [REMOTE, `${PRE}\nq "${sql.replace(/"/g, '\\"')}"`],
  { encoding: 'utf8', maxBuffer: 1 << 24 }).trim();

let fail = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { fail += 1; console.error(`  ✗ ${m}`); };

console.log('pricing assignment completeness\n');

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

console.log();
if (fail) { console.error(`✗ pricing assignment gate FAILED (${fail})`); process.exit(1); }
console.log('✓ every settlement-capable owner has exactly one active, environment-correct rate');
