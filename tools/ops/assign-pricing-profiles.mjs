#!/usr/bin/env node
/**
 * Assign every Sandbox financial owner an explicit pricing profile.
 *
 * This is the step that makes pricing an operator decision rather than an
 * inference. Until now the rate followed a substring match on text a merchant
 * had written in their KYB application — "Loja de doações artesanais", a shop,
 * priced as a donation platform because the string contains "doaç".
 *
 * So the assignment here is BY NAMED TENANT, never by category, label or
 * pattern. A merchant this script does not recognise is reported and left
 * unassigned, because guessing is the thing being removed. An unassigned owner
 * is unpriced, and unpriced fails closed at settlement — it is not free.
 *
 *   node tools/ops/assign-pricing-profiles.mjs
 *   node tools/ops/assign-pricing-profiles.mjs --apply
 */
import { execFileSync } from 'node:child_process';

const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';
const APPLY = process.argv.includes('--apply');

// Named tenants and the policy an operator decided for them. Nothing here reads
// a category. The default is the default because it is the default, not because
// anything about the merchant suggested it.
const KNOWN = {
  Doa: 'sandbox-reference',
};
const DEFAULT_PROFILE = 'sandbox-default';

const PRE = `
  set -uo pipefail
  P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
  PG="$P-postgres-1"
  SU=$(docker exec "$PG" sh -c 'cat /run/secrets/mi_superuser')
  U=$(docker exec "$PG" sh -c 'printenv POSTGRES_USER')
  q(){ docker exec -e PGPASSWORD="$SU" "$PG" psql -v ON_ERROR_STOP=1 -U "$U" -d banzami_staging -At -F'|' -c "$1"; }
`;
const q = (sql) => execFileSync('ssh', [REMOTE, `${PRE}\nq "${sql.replace(/"/g, '\\"')}"`],
  { encoding: 'utf8', maxBuffer: 1 << 24 }).trim();

console.log(`pricing profile assignment — ${APPLY ? 'APPLY' : 'dry run'}\n`);

// The assignment lives on the financial owner, not on its public profile: a
// self-provisioned Sandbox owner has no merchant_profiles row, because that row
// is written by KYB approval and a self-service developer has no KYB. The
// category is still read here, but only to print what is being IGNORED.
const owners = q(`
  select m.id, m.name, coalesce(mp.category,''), coalesce(pp.code,'')
    from merchants m
    left join merchant_profiles mp on mp.merchant_id = m.id
    left join pricing_profiles pp on pp.id = m.pricing_profile_id
   where m.status = 'ACTIVE'
   order by m.created_at`).split('\n').filter(Boolean).map((l) => l.split('|'));

let assigned = 0, already = 0, unknown = 0;
const plan = [];
for (const [id, name, category, current] of owners) {
  const want = KNOWN[name] ?? DEFAULT_PROFILE;
  const known = name in KNOWN;
  const note = known ? 'named tenant' : 'default';
  if (current === want) {
    already += 1;
    console.log(`  ·  ${name.padEnd(34)} already ${current}`);
    continue;
  }
  if (current && current !== want) {
    unknown += 1;
    console.error(`  ✗  ${name.padEnd(34)} holds ${current}, this script would assign ${want} — refusing to overwrite a deliberate assignment`);
    continue;
  }
  plan.push({ id, name, want });
  console.log(`  →  ${name.padEnd(34)} ${want.padEnd(22)} (${note}${category ? `, category "${category}" IGNORED` : ''})`);
  assigned += 1;
}

if (!APPLY) {
  console.log(`\n${assigned} to assign, ${already} already correct, ${unknown} conflicting.`);
  console.log('dry run — nothing changed. Re-run with --apply.');
  process.exit(unknown ? 1 : 0);
}

for (const p of plan) {
  q(`update merchants
        set pricing_profile_id = (select id from pricing_profiles
                                   where code = '${p.want}' and environment = 'SANDBOX'),
            updated_at = now()
      where id = '${p.id}'`);
}

console.log('\nafter');
const after = q(`
  select m.name, coalesce(pp.code,'(none)')
    from merchants m
    left join pricing_profiles pp on pp.id = m.pricing_profile_id
   where m.status = 'ACTIVE' order by m.created_at`).split('\n').filter(Boolean);
for (const l of after) {
  const [n, c] = l.split('|');
  console.log(`  ${n.padEnd(34)} ${c}`);
}
const missing = after.filter((l) => l.endsWith('(none)')).length;
console.log();
if (missing) { console.error(`✗ ${missing} active owner(s) still unassigned`); process.exit(1); }
console.log('✓ every active Sandbox financial owner has an explicit pricing profile');
