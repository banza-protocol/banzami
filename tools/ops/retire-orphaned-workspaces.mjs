#!/usr/bin/env node
/**
 * Workspaces nobody can reach, and nobody can close.
 *
 * A harness that mints a workspace and a project retired only the project, and
 * its own cleanup then deleted the identity that created the workspace. The
 * workspace stayed ACTIVE, with no creator to sign in as and no email for the
 * pattern-based cleanup to match, so it could not be reached from the Console or
 * from any tool. There were 267 of them on the Sandbox before anyone counted.
 *
 * The leak is fixed where it happened — RetireFixtureProject now closes the
 * workspace it was created with — and this retires what accumulated first.
 *
 * What it will touch, and nothing else. An ACTIVE workspace where ALL of:
 *   · the creator identity no longer exists;
 *   · no surviving identity is a member;
 *   · no ACTIVE project remains inside it;
 *   · no ACTIVE key belongs to any project inside it.
 *
 * Each condition is independently sufficient to make it someone's workspace, so
 * all four must hold. A workspace that fails any of them is left exactly as it
 * is and reported. It is ARCHIVED, never deleted: the workspace is the thing the
 * audit rows point at.
 *
 *   node tools/ops/retire-orphaned-workspaces.mjs            # report
 *   node tools/ops/retire-orphaned-workspaces.mjs --apply    # archive them
 */
import { execFileSync } from 'node:child_process';

const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';
const APPLY = process.argv.includes('--apply');

const PRE = `
  set -uo pipefail
  P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
  PG="$P-postgres-1"; CORE="$P-core-api-staging"
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -F'|' -c "$1" 2>/dev/null; }
`;

// One predicate, written once, used by the count, the listing and the update —
// so what is reported and what is changed cannot drift apart.
const ORPHAN = `
  w.status = 'ACTIVE'
  and not exists (select 1 from account_identity.identity_users u where u.id = w.created_by)
  and not exists (select 1 from developer.dev_workspace_members m
                    join account_identity.identity_users u2 on u2.id = m.user_id
                   where m.workspace_id = w.id)
  and not exists (select 1 from developer.dev_projects p
                   where p.workspace_id = w.id and p.status = 'ACTIVE')
  and not exists (select 1 from developer.dev_api_keys k
                    join developer.dev_projects p2 on p2.id = k.project_id
                   where p2.workspace_id = w.id and k.status = 'ACTIVE')
`;

const ssh = (script) => execFileSync('ssh', [REMOTE, script], { encoding: 'utf8', maxBuffer: 1 << 24 });

const counts = () => ssh(`${PRE}
  q "select
      (select count(*) from developer.dev_workspaces where status='ACTIVE'),
      (select count(*) from developer.dev_workspaces w where ${ORPHAN}),
      (select count(*) from developer.dev_workspaces w
        where w.status='ACTIVE'
          and not exists (select 1 from account_identity.identity_users u where u.id = w.created_by)
          and not (${ORPHAN}))"
`).trim().split('|').map(Number);

console.log(`orphaned Console workspaces — ${new Date().toISOString()}`);
console.log(`mode: ${APPLY ? 'apply' : 'report only'}\n`);

const [activeBefore, orphans, heldBack] = counts();
console.log(`  active workspaces           ${activeBefore}`);
console.log(`  unreachable (all four hold) ${orphans}`);
console.log(`  creator gone but NOT retired — a member, a project or a key survives: ${heldBack}`);

if (orphans > 0) {
  const sample = ssh(`${PRE}
    q "select w.name, w.created_at::date from developer.dev_workspaces w where ${ORPHAN} order by w.created_at desc limit 8"`).trim();
  console.log('\n  a sample of what would be archived:');
  for (const line of sample.split('\n').filter(Boolean)) console.log(`    ${line.replace('|', '  ')}`);
}

if (!APPLY) {
  console.log('\nnothing was changed. Re-run with --apply.');
  process.exit(0);
}

ssh(`${PRE}
  q "update developer.dev_workspaces w set status='ARCHIVED', updated_at=now()
      where w.id in (select w2.id from developer.dev_workspaces w2 where ${ORPHAN.replace(/\bw\./g, 'w2.')})" >/dev/null
`);

const [activeAfter, orphansAfter] = counts();
console.log(`\n  active workspaces  ${activeBefore} → ${activeAfter}  (-${activeBefore - activeAfter})`);
console.log(`  unreachable        ${orphans} → ${orphansAfter}`);
if (orphansAfter !== 0) { console.error('\n✗ some unreachable workspaces remain'); process.exit(1); }
console.log('\n✓ nothing active is unreachable');
