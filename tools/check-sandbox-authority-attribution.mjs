#!/usr/bin/env node
/**
 * Every active financial owner in the Sandbox belongs to something.
 *
 * The old invariant was a count: one merchant, one project, and anything else is
 * a leak. Self-service financial setup ends that — external developers provision
 * their own owners now, and the number is supposed to grow. A gate that fails on
 * growth would be a gate everyone learns to ignore.
 *
 * So the question changes from "how many" to "whose". Every ACTIVE financial
 * owner must be attributable to exactly one of:
 *
 *   a live external Sandbox project, through its ACTIVE binding;
 *   the canonical reference tenant (DOA), named here on purpose;
 *   a provisioning run that has not finished, which is a real and recoverable
 *   state — but a BOUNDED one, so it is reported with its age.
 *
 * Anything else is an owner nobody can account for, and that is the failure this
 * exists to catch. An unattributable financial owner is not untidiness: it is an
 * authority that can hold money and answer to no one.
 *
 * Nothing here deletes. A merchant with financial history is history; one
 * without is a provisioning leftover, and retiring it is a separate, named
 * decision made by a person who has read this report.
 *
 *   node tools/check-sandbox-authority-attribution.mjs
 *   node tools/check-sandbox-authority-attribution.mjs --max-pending-hours 2
 */
import { execFileSync } from 'node:child_process';

const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';
const argAt = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
const MAX_PENDING_H = Number(argAt('--max-pending-hours') ?? 2);

// The reference tenant, named rather than pattern-matched. DOA is the operator's
// own reference integration; it is attributable because we say so here, and if
// that ever stops being true this line is where it shows.
const CANONICAL = ['Doa'];

// Self-service owners carry a derived address, which is what makes them
// attributable to a project even before their binding exists.
const SELF_SERVICE_EMAIL = 'sandbox+%@projects.banzami.test';

const PRE = `
  set -uo pipefail
  P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
  PG="$P-postgres-1"; CORE="$P-core-api-staging"
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -v ON_ERROR_STOP=1 -U bl_app_runtime -d banzami_staging -At -F'|' -c "$1"; }
`;
const q = (sql) => execFileSync('ssh', [REMOTE, `${PRE}\nq "${sql.replace(/"/g, '\\"')}"`],
  { encoding: 'utf8', maxBuffer: 1 << 24 }).trim();
const rows = (sql) => q(sql).split('\n').filter(Boolean).map((l) => l.split('|'));

let fail = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { fail += 1; console.error(`  ✗ ${m}`); };

console.log('sandbox authority attribution\n');

// ── every ACTIVE merchant, and what accounts for it ─────────────────────────
const merchants = rows(`
  select m.id, m.name, coalesce(m.email,''), m.created_at,
         coalesce((select string_agg(b.project_id::text, ',')
                     from developer.dev_project_sandbox_binding b
                    where b.merchant_id = m.id and b.state = 'ACTIVE'), ''),
         (select count(*) from ledger_entries e
            join ledger_accounts la on la.id = e.account_id
            join wallet_accounts wa on wa.account_id = la.id
            join wallets w on w.id = wa.wallet_id
           where w.merchant_id = m.id)
    from merchants m
   where m.status = 'ACTIVE'
   order by m.created_at`);

const attributed = [], pending = [], unknown = [];
for (const [id, name, email, createdAt, boundTo, entries] of merchants) {
  const ageH = (Date.now() - Date.parse(createdAt)) / 3_600_000;
  if (boundTo) { attributed.push({ id, name, projects: boundTo.split(',') }); continue; }
  if (CANONICAL.includes(name)) { attributed.push({ id, name, projects: ['(canonical tenant)'] }); continue; }
  // Unbound, but self-service-derived: a run that has not finished.
  if (email.startsWith('sandbox+') && email.endsWith('@projects.banzami.test')) {
    pending.push({ id, name, ageH, entries: Number(entries) });
    continue;
  }
  unknown.push({ id, name, ageH, entries: Number(entries) });
}

console.log(`  active financial owners: ${merchants.length}`);
ok(`${attributed.length} attributable to a project or the canonical tenant`);

// ── provisioning that has not finished ──────────────────────────────────────
if (pending.length) {
  console.log(`\n  ${pending.length} owner(s) from an unfinished provisioning run:`);
  for (const p of pending) {
    console.log(`    ${p.id.slice(0, 8)}  ${p.name.padEnd(34)} age=${p.ageH.toFixed(1)}h entries=${p.entries}`);
  }
  // Bounded, not tolerated: a run that failed minutes ago is a retry waiting to
  // happen; one from yesterday is a leftover nobody came back for.
  const stale = pending.filter((p) => p.ageH > MAX_PENDING_H);
  if (stale.length) {
    bad(`${stale.length} of them are older than ${MAX_PENDING_H}h — nobody retried, and nothing will`);
  } else {
    ok(`all within ${MAX_PENDING_H}h — recoverable, and the next setup call adopts them`);
  }
  const withMoney = pending.filter((p) => p.entries > 0);
  if (withMoney.length) {
    bad(`${withMoney.length} unbound owner(s) hold ledger entries — that should be impossible and needs investigating`);
  }
} else {
  ok('no unfinished provisioning');
}

// ── anything else ───────────────────────────────────────────────────────────
if (unknown.length) {
  console.log(`\n  ${unknown.length} owner(s) nobody accounts for:`);
  for (const u of unknown) {
    console.log(`    ${u.id.slice(0, 8)}  ${u.name.padEnd(34)} age=${u.ageH.toFixed(1)}h entries=${u.entries}`);
  }
  bad(`${unknown.length} unattributable active financial owner(s)`);
} else {
  ok('every active financial owner is accounted for');
}

console.log();
if (fail) { console.error(`✗ authority attribution FAILED (${fail})`); process.exit(1); }
console.log('✓ authority attribution passed');
