#!/usr/bin/env node
/**
 * The Console fixtures nobody gave back.
 *
 * Until the Node harnesses learned to clean up after themselves, every run left
 * its accounts behind: an identity that can sign in, its sessions, its workspace
 * memberships, and the workspaces and projects it created. One set per run, kept
 * forever. The harnesses now retire their own; this is for the ones already
 * there, and for the occasional account minted by hand during a debugging
 * session, which belongs to no harness and so will never be cleaned by one.
 *
 * The rule is narrow on purpose: an address at @banzami-e2e.test and nothing
 * else. That domain exists only for harness fixtures — a real console account
 * never has one — so the selection cannot reach a person's account by accident,
 * which is the failure mode that matters for a sweeper that deletes sign-in
 * authority.
 *
 * Financial history is untouched. Payments, refunds and ledger entries are
 * records of things that happened; workspaces and projects are ARCHIVED rather
 * than deleted, because one may hold a binding and a binding is history too.
 * What is removed is the authority: the accounts, their sessions, their
 * memberships, and the keys their projects hold.
 *
 *   node tools/ops/sweep-console-fixtures.mjs           # report only
 *   node tools/ops/sweep-console-fixtures.mjs --apply
 *
 * --min-age-hours keeps a running suite's fixtures out of the way; it defaults
 * to 2, so a sweep during someone else's run cannot pull the accounts out from
 * under it.
 *
 * --suspend-unreachable-workspaces is a separate, named pass for the residue the
 * account sweep leaves behind. Deleting an account does not delete the workspace
 * it created, so the operator accumulated workspaces with no creator, no member
 * and no project — rows nobody can reach through any credential, still counted
 * as ACTIVE by every inventory that asks how much is live. The selection is three
 * explicit conditions rather than an exclusion, because "everything except the
 * ones I recognise" is how a sweeper eventually suspends the workspace that
 * takes money.
 */
import { execFileSync } from 'node:child_process';

const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';
const APPLY = process.argv.includes('--apply');
const ORPHANS = process.argv.includes('--suspend-unreachable-workspaces');
const ageArg = process.argv.indexOf('--min-age-hours');
const MIN_AGE = ageArg > -1 ? Number(process.argv[ageArg + 1]) : 2;
const DOMAIN = '%@banzami-e2e.test';

const PRE = `
  set -uo pipefail
  P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
  PG="$P-postgres-1"; CORE="$P-core-api-staging"
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  # No 2>/dev/null. A statement that fails must say so: the first version of
  # this sweeper suppressed stderr and counted output lines, so an UPDATE
  # rejected by a check constraint was reported as "archived workspaces 0" and
  # read as "there were none". Twenty-eight workspaces stayed live.
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -v ON_ERROR_STOP=1 -U bl_app_runtime -d banzami_staging -At -F'|' -c "$1"; }
`;
const ssh = (s) => execFileSync('ssh', [REMOTE, s], { encoding: 'utf8', maxBuffer: 1 << 24 });

// Old enough to be nobody's live run.
const OLD = `u.email like '${DOMAIN}' and u.created_at < now() - interval '${MIN_AGE} hours'`;

/** The six numbers this sweep is about, read straight from the database. */
function counts() {
  const out = ssh(`${PRE}
  q "select 'accounts|' || count(*) from account_identity.identity_users u where ${OLD}"
  q "select 'live sessions|' || count(*) from account_identity.identity_sessions s
      join account_identity.identity_users u on u.id = s.user_id
     where ${OLD} and s.expires_at > now()"
  q "select 'memberships|' || count(*) from developer.dev_workspace_members m
      join account_identity.identity_users u on u.id = m.user_id where ${OLD}"
  q "select 'active workspaces|' || count(*) from developer.dev_workspaces w
      join account_identity.identity_users u on u.id = w.created_by where ${OLD} and w.status='ACTIVE'"
  q "select 'active projects|' || count(*) from developer.dev_projects p
      join developer.dev_workspaces w on w.id = p.workspace_id
      join account_identity.identity_users u on u.id = w.created_by where ${OLD} and p.status='ACTIVE'"
  q "select 'active keys|' || count(*) from developer.dev_api_keys k
      join developer.dev_projects p on p.id = k.project_id
      join developer.dev_workspaces w on w.id = p.workspace_id
      join account_identity.identity_users u on u.id = w.created_by
     where ${OLD} and k.status='ACTIVE'"`);
  return Object.fromEntries(out.trim().split('\n').filter(Boolean)
    .map((l) => { const [k, n] = l.split('|'); return [k, Number(n)]; }));
}

console.log(`console fixture sweep — @banzami-e2e.test, older than ${MIN_AGE}h`);
console.log(APPLY ? '  MODE: apply\n' : '  MODE: report only (re-run with --apply)\n');

for (const [what, n] of Object.entries(counts())) {
  console.log(`  ${what.padEnd(20)} ${n}`);
}

if (ORPHANS) {
  // Unreachable in the literal sense: the account that created it is gone, no
  // active member remains, and it holds no active project. Nothing that can
  // sign in leads here.
  const UNREACHABLE = `
    w.status='ACTIVE'
    and not exists (select 1 from account_identity.identity_users u where u.id = w.created_by)
    and not exists (select 1 from developer.dev_workspace_members m
                     join account_identity.identity_users u2 on u2.id = m.user_id
                    where m.workspace_id = w.id and m.status='ACTIVE')
    and not exists (select 1 from developer.dev_projects p
                    where p.workspace_id = w.id and p.status='ACTIVE')`;
  const n = () => Number(ssh(`${PRE}
    q "select count(*) from developer.dev_workspaces w where ${UNREACHABLE}"`).trim() || '0');
  const was = n();
  console.log(`\n  unreachable workspaces: ${was}`);
  if (was > 0 && APPLY) {
    ssh(`${PRE}
      q "update developer.dev_workspaces set status='SUSPENDED', updated_at=now()
          where id in (select w.id from developer.dev_workspaces w where ${UNREACHABLE})" >/dev/null
      echo suspended`);
    console.log(`  suspended: ${was - n()} (remaining ${n()})`);
  } else if (was > 0) {
    console.log('  report only — add --apply to suspend them');
  }
}

if (!APPLY) {
  console.log('\nnothing was changed');
  process.exit(0);
}

// Keys before their projects, memberships and sessions before their accounts.
//
// A project has no creator of its own — it belongs to a workspace, and the
// workspace has one. Reaching a fixture project therefore goes through its
// workspace, which is also why a project inside somebody else's workspace is
// never touched by this: the run that made it did not make the workspace.
//
// A workspace is SUSPENDED, not archived: its status column permits ACTIVE and
// SUSPENDED and nothing else. Projects are the ones that archive. Writing the
// wrong word here fails a check constraint, which is what happened, and is why
// the counts below are measured rather than inferred from the statements.
const before = counts();
ssh(`${PRE}
  q "with victims as (select u.id from account_identity.identity_users u where ${OLD})
     update developer.dev_api_keys k set status='REVOKED', revoked_at=now()
       from developer.dev_projects p join developer.dev_workspaces w on w.id = p.workspace_id
      where k.project_id = p.id and k.status='ACTIVE' and w.created_by in (select id from victims)" >/dev/null
  q "with victims as (select u.id from account_identity.identity_users u where ${OLD})
     update developer.dev_projects p set status='ARCHIVED', updated_at=now()
      where p.status='ACTIVE' and p.workspace_id in
            (select id from developer.dev_workspaces where created_by in (select id from victims))" >/dev/null
  q "with victims as (select u.id from account_identity.identity_users u where ${OLD})
     update developer.dev_workspaces set status='SUSPENDED', updated_at=now()
      where status='ACTIVE' and created_by in (select id from victims)" >/dev/null
  q "with victims as (select u.id from account_identity.identity_users u where ${OLD})
     delete from developer.dev_workspace_members where user_id in (select id from victims)" >/dev/null
  q "with victims as (select u.id from account_identity.identity_users u where ${OLD})
     delete from account_identity.identity_sessions where user_id in (select id from victims)" >/dev/null
  q "delete from account_identity.identity_users u where ${OLD}" >/dev/null
  echo swept`);

// Measured, not claimed. Every number is the difference between two counts read
// from the database, so a statement that did not do what it said cannot report
// that it did.
const after = counts();
console.log();
for (const k of Object.keys(before)) {
  const delta = before[k] - after[k];
  console.log(`  ${k.padEnd(20)} ${String(before[k]).padStart(4)} → ${String(after[k]).padStart(4)}  (${delta >= 0 ? '-' : '+'}${Math.abs(delta)})`);
}
const stuck = Object.entries(after).filter(([, v]) => v > 0);
if (stuck.length) {
  console.error(`\n✗ still present after the sweep: ${stuck.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  process.exit(1);
}

const left = ssh(`${PRE}
  q "select count(*) from account_identity.identity_users u where u.email like '${DOMAIN}'"`).trim();
console.log(`\n  console fixture accounts remaining: ${left}`);
