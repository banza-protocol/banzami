#!/usr/bin/env node
/**
 * One project must not be able to see another's money, keys or traffic.
 *
 * Every Console read derives its authority the same way — session, workspace
 * membership, project, its sealed binding, the merchant that binding names —
 * and the caller supplies only a project id. This asks whether that holds when
 * the caller supplies someone else's project id on purpose.
 *
 * Two accounts, two workspaces, two projects, and then every project-scoped
 * route tried across the boundary. The navigation is not the test: hiding a
 * link is not authorisation, so each request goes straight at the API with a
 * real session for the wrong owner.
 *
 * It also checks what a denial says. A 403 for a project that exists and a 404
 * for one that does not tells an attacker which project ids are real; the
 * canonical answer for a project you are not a member of must not distinguish
 * the two.
 *
 * Usage: node tools/e2e/console/cross-project-isolation.mjs
 */
import { execFileSync } from 'node:child_process';

const API = process.env.DEV_API ?? 'https://developer-api.banzami.com';
const HERE = new URL('.', import.meta.url).pathname;

let pass = 0, fail = 0;
const ok = (m) => { pass += 1; console.log(`  ✓ ${m}`); };
const bad = (m) => { fail += 1; console.error(`  ✗ ${m}`); };
const step = (m) => console.log(`\n${m}`);

const ssh = (script) =>
  execFileSync('ssh', [process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248', script], { encoding: 'utf8', maxBuffer: 1 << 24 });

/** A console session for an account, minted the documented way. */
const session = (email) =>
  execFileSync('bash', [`${HERE}mint-console-session.sh`, email, '90'], { encoding: 'utf8' }).trim().split('\n').pop();

async function api(token, path) {
  const r = await fetch(`${API}${path}`, { headers: { cookie: `__Host-bz_dev_session=${token}` } });
  let body = null;
  try { body = await r.json(); } catch { /* not json */ }
  return { status: r.status, body };
}

// ── two accounts, two workspaces, two projects ──────────────────────────────
const stamp = Date.now().toString(36);
const A = `console-iso-a-${stamp}@banzami-e2e.test`;
const B = `console-iso-b-${stamp}@banzami-e2e.test`;

step('two controlled accounts');
const made = ssh(`
  set -uo pipefail
  P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
  PG="$P-postgres-1"; CORE="$P-core-api-staging"
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1"; }
  for e in ${A} ${B}; do
    # No unique constraint on email, so ON CONFLICT is not available; the
    # insert is guarded by a NOT EXISTS instead. These addresses carry a run
    # stamp, so a collision would mean two runs in the same millisecond.
    q "insert into account_identity.identity_users (email, verified, status)
       select '$e', true, 'ACTIVE'
        where not exists (select 1 from account_identity.identity_users where email='$e')" >/dev/null
    echo "$e $(q "select id from account_identity.identity_users where email='$e'")"
  done`).trim().split('\n');
const uid = Object.fromEntries(made.map((l) => l.split(' ')));
(uid[A] && uid[B]) ? ok('two console accounts exist') : bad('could not create the accounts');

const tokA = session(A);
const tokB = session(B);
(tokA && tokB) ? ok('both hold a real session') : bad('session minting failed');

step('each creates its own workspace and project');
async function post(token, path, body) {
  const me = await api(token, '/auth/me');
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      cookie: `__Host-bz_dev_session=${token}`,
      'content-type': 'application/json',
      origin: 'https://developers.banzami.com',
      'x-csrf-token': me.body?.csrf_token ?? '',
    },
    body: JSON.stringify(body),
  });
  let j = null; try { j = await r.json(); } catch { /* */ }
  return { status: r.status, body: j };
}

const wsA = await post(tokA, '/workspaces', { name: `iso-a-${stamp}` });
const wsB = await post(tokB, '/workspaces', { name: `iso-b-${stamp}` });
const prjA = await post(tokA, `/workspaces/${wsA.body?.id}/projects`, { name: `iso-a-${stamp}` });
const prjB = await post(tokB, `/workspaces/${wsB.body?.id}/projects`, { name: `iso-b-${stamp}` });
(prjA.body?.id && prjB.body?.id)
  ? ok(`project A ${String(prjA.body.id).slice(0, 8)}, project B ${String(prjB.body.id).slice(0, 8)}`)
  : bad(`could not create projects (${prjA.status}/${prjB.status})`);

// ── the isolation matrix ────────────────────────────────────────────────────
step('every project-scoped route, asked for the other project');
const ROUTES = [
  ['balances', (p) => `/projects/${p}/balances`],
  ['transactions', (p) => `/projects/${p}/transactions`],
  ['api keys', (p) => `/projects/${p}/keys`],
  ['webhook endpoints', (p) => `/projects/${p}/webhooks/endpoints`],
  ['webhook events', (p) => `/projects/${p}/webhooks/events`],
  ['api logs', (p) => `/projects/${p}/logs`],
];

const denials = new Set();
for (const [label, route] of ROUTES) {
  const r = await api(tokA, route(prjB.body?.id));
  denials.add(r.status);
  if (r.status === 403 || r.status === 404) ok(`A cannot read B's ${label} (${r.status})`);
  else bad(`A READ B's ${label} — HTTP ${r.status}`);
}
for (const [label, route] of ROUTES.slice(0, 3)) {
  const r = await api(tokB, route(prjA.body?.id));
  if (r.status === 403 || r.status === 404) ok(`B cannot read A's ${label} (${r.status})`);
  else bad(`B READ A's ${label} — HTTP ${r.status}`);
}

step('a denial must not say whether the project exists');
const invented = '00000000-0000-4000-8000-000000000000';
const forNothing = await api(tokA, `/projects/${invented}/balances`);
const forReal = await api(tokA, `/projects/${prjB.body?.id}/balances`);
forNothing.status === forReal.status
  ? ok(`a project that does not exist and one you may not see answer alike (${forReal.status})`)
  : bad(`existence is disclosed: real=${forReal.status}, invented=${forNothing.status}`);

step('and each still sees its own');
// Balances need a financial binding, and a brand-new project has none — that
// 404 means "no payee yet", which is the state the page explains. The route
// that proves membership without needing a binding is the project's own keys.
const ownKeys = await api(tokA, `/projects/${prjA.body?.id}/keys`);
ownKeys.status === 200 ? ok('A reads its own project') : bad(`A cannot read its own project (${ownKeys.status})`);
const ownBal = await api(tokA, `/projects/${prjA.body?.id}/balances`);
ownBal.status === 404
  ? ok('a project with no binding has no balances, and says so')
  : bad(`unexpected balances status for an unbound project: ${ownBal.status}`);

// ── cleanup ─────────────────────────────────────────────────────────────────
// The projects hold no financial binding and no keys; the accounts and
// workspaces are the run's own. Retiring them keeps this from becoming the
// residue the fixture-hygiene work exists to prevent.
step('cleanup');
const removed = ssh(`
  set -uo pipefail
  P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
  PG="$P-postgres-1"; CORE="$P-core-api-staging"
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1"; }
  q "update developer.dev_projects set status='ARCHIVED' where name in ('iso-a-${stamp}','iso-b-${stamp}')" >/dev/null
  q "delete from account_identity.identity_sessions where user_id in
       (select id from account_identity.identity_users where email in ('${A}','${B}'))" >/dev/null
  q "delete from developer.dev_workspace_members where user_id in
       (select id from account_identity.identity_users where email in ('${A}','${B}'))" >/dev/null
  q "delete from account_identity.identity_users where email in ('${A}','${B}')" >/dev/null
  q "select count(*) from developer.dev_projects where name in ('iso-a-${stamp}','iso-b-${stamp}') and status='ACTIVE'"`).trim();
removed === '0' ? ok('the run left no active project behind') : bad(`${removed} project(s) still active`);

console.log();
if (fail === 0) { console.log(`CROSS_PROJECT_ISOLATION: PASS=${pass} FAIL=0`); process.exit(0); }
console.error(`CROSS_PROJECT_ISOLATION: PASS=${pass} FAIL=${fail}`);
process.exit(1);
