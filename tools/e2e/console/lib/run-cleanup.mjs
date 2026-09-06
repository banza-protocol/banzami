/**
 * Give back what a Console harness took.
 *
 * The shell harnesses under tests/phase0 have had this since the hygiene
 * closure: lib/e2e-run.sh records every key, project and merchant a run mints
 * and retires them on the way out, including on the failure paths, which is
 * when leaks actually happen. The Node harnesses that drive the Console were
 * written afterwards and never got the equivalent, so their fixtures accumulated
 * — console accounts, their sessions, their workspace memberships, and the
 * workspaces and projects they created — one set per run, kept forever.
 *
 * Nothing here deletes financial history. A payment, a refund and a ledger entry
 * are records of something that happened and stay; what this removes is the
 * AUTHORITY a run minted — the accounts that can sign in, the projects and keys
 * that can act — because that is the part where "left over from a test" and "a
 * way into the operator" are the same sentence.
 *
 * Every run stamps its own fixtures and cleanup matches on that stamp alone, so
 * a concurrent run is never touched.
 *
 *   import { registerCleanup } from './lib/run-cleanup.mjs';
 *   registerCleanup({ emailPattern: `rt01-%${stamp}@banzami-e2e.test` });
 */
import { execFileSync } from 'node:child_process';

const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';

const PRE = `
  set -uo pipefail
  P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
  PG="$P-postgres-1"; CORE="$P-core-api-staging"
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }
`;

/**
 * Remove the authority a run minted.
 *
 * @param {object} o
 * @param {string} o.emailPattern  SQL LIKE pattern matching this run's accounts.
 * @param {string} [o.namePattern] SQL LIKE pattern matching this run's projects
 *   and developer keys, for anything created outside those accounts' ownership.
 */
export function cleanupRun({ emailPattern, namePattern }) {
  const byName = namePattern ? `
      q "update developer.dev_api_keys set status='REVOKED', revoked_at=now()
          where status='ACTIVE' and name like '${namePattern}'" >/dev/null
      q "update developer.dev_projects set status='ARCHIVED', updated_at=now()
          where status='ACTIVE' and name like '${namePattern}'" >/dev/null` : '';

  // Order matters: keys before the projects that hold them, memberships and
  // sessions before the accounts they point at. A workspace is archived rather
  // than deleted — it may carry a binding, and a binding is financial history.
  // SUSPENDED, not ARCHIVED: the workspace status column permits ACTIVE and
  // SUSPENDED and nothing else, and it is projects that archive.
  //
  // A project has no creator of its own; it belongs to a workspace, and the
  // workspace has one. So a run reaches its own projects through the workspaces
  // it created — which is also why a project this run made inside SOMEBODY
  // ELSE'S workspace is left alone: the canonical bound project is where these
  // suites read from, and archiving it would break the next run and the Console.
  return execFileSync('ssh', [REMOTE, `${PRE}
      ${byName}
      q "update developer.dev_api_keys k set status='REVOKED', revoked_at=now()
          from developer.dev_projects p join developer.dev_workspaces w on w.id = p.workspace_id
         where k.project_id = p.id and k.status='ACTIVE'
           and w.created_by in (select id from account_identity.identity_users where email like '${emailPattern}')" >/dev/null
      q "update developer.dev_projects p set status='ARCHIVED', updated_at=now()
         where p.status='ACTIVE' and p.workspace_id in
               (select id from developer.dev_workspaces
                 where created_by in (select id from account_identity.identity_users where email like '${emailPattern}'))" >/dev/null
      q "update developer.dev_workspaces set status='SUSPENDED', updated_at=now()
         where status='ACTIVE'
           and created_by in (select id from account_identity.identity_users where email like '${emailPattern}')" >/dev/null
      q "delete from developer.dev_workspace_members where user_id in
           (select id from account_identity.identity_users where email like '${emailPattern}')" >/dev/null
      q "delete from account_identity.identity_sessions where user_id in
           (select id from account_identity.identity_users where email like '${emailPattern}')" >/dev/null
      q "delete from account_identity.identity_users where email like '${emailPattern}'" >/dev/null
      echo cleaned`], { encoding: 'utf8', maxBuffer: 1 << 24 });
}

/**
 * Register cleanup to run however the process ends — a pass, a failed
 * assertion, an exception, or a Ctrl-C. The failure paths are the ones that
 * used to leak, which is why this is a handler and not a line at the end.
 *
 * A cleanup that itself fails is reported and never masks the run's own result:
 * a green suite that could not tidy up is still a green suite with a problem,
 * and saying so is more useful than turning it red for the wrong reason.
 */
export function registerCleanup(opts) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    try {
      cleanupRun(opts);
    } catch (e) {
      console.error(`  ✗ cleanup failed: ${e instanceof Error ? e.message.slice(0, 200) : e}`);
      console.error(`     leftover fixtures match ${opts.emailPattern} — sweep with tools/ops/sweep-console-fixtures.mjs`);
    }
  };
  process.on('exit', run);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => { run(); process.exit(130); });
  }
}
