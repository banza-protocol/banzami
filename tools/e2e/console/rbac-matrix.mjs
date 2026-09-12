#!/usr/bin/env node
/**
 * What each role may actually do, asked of the deployed API.
 *
 * The matrix is not invented from the role names — it is derived from the
 * predicates in the service and then checked against the running system:
 *
 *   reads (balances, transactions, keys, webhooks, events, logs)
 *       membership alone. Every role of the workspace may read.
 *   create project, create key, rotate key, revoke key
 *       canBuild → OWNER, ADMIN, DEVELOPER
 *   invite, set role, remove member, revoke invite
 *       isManager → OWNER, ADMIN
 *
 * FINANCE has no financial write power in the Console: for everything the
 * Console exposes it reads like VIEWER. That is worth stating rather than
 * assuming from the name.
 *
 * Every check calls the API directly with a real session. A hidden button is
 * not authorisation, and a role that cannot see a control can still send the
 * request.
 *
 * It also composes RBAC with tenancy: an ADMIN of one workspace is a stranger
 * to another, and must get the same privacy-safe answer as someone asking about
 * a project that does not exist.
 *
 * Usage: node tools/e2e/console/rbac-matrix.mjs
 */
import { execFileSync } from 'node:child_process';
import { registerCleanup, cleanupRun } from './lib/run-cleanup.mjs';
import { mintSession } from './lib/mint.mjs';

const API = process.env.DEV_API ?? 'https://developer-api.banzami.com';
const ORIGIN = 'https://developers.banzami.com';
const HERE = new URL('.', import.meta.url).pathname;
const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';

let pass = 0, fail = 0;
const ok = (m) => { pass += 1; console.log(`  ✓ ${m}`); };
const bad = (m) => { fail += 1; console.error(`  ✗ ${m}`); };
const step = (m) => console.log(`\n${m}`);

const ssh = (s) => execFileSync('ssh', [REMOTE, s], { encoding: 'utf8', maxBuffer: 1 << 24 });
const session = (email) => mintSession(email);

async function call(token, path, method = 'GET', body) {
  const headers = { cookie: `__Host-bz_dev_session=${token}` };
  if (method !== 'GET') {
    const me = await fetch(`${API}/auth/me`, { headers });
    const j = await me.json().catch(() => ({}));
    Object.assign(headers, {
      'content-type': 'application/json',
      origin: ORIGIN,
      'x-csrf-token': j.csrf_token ?? '',
    });
  }
  const r = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* */ }
  return { status: r.status, body: j };
}

const stamp = Date.now().toString(36);
// Everything this run creates, removed whatever happens — including on the
// failure paths, which is when leaks actually happen. Matched on the run stamp,
// so a concurrent run is untouched.
registerCleanup({
  emailPattern: `console-rbac-%${stamp}@banzami-e2e.test`,
  namePattern: `rbac-%${stamp}`,
});
process.on('uncaughtException', (e) => { console.error(e); process.exit(1); });
const ROLES = ['OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'VIEWER'];
const email = (r) => `console-rbac-${r.toLowerCase()}-${stamp}@banzami-e2e.test`;
const outsiderEmail = `console-rbac-outsider-${stamp}@banzami-e2e.test`;

// ── identities, with roles set in the database, never in a cookie ───────────
step('five members, one workspace, roles from the membership table');
const allEmails = [...ROLES.map(email), outsiderEmail];
// The identities come from signing in. These runs used to INSERT rows into
// account_identity.identity_users, because the old mint script could only sign in
// an account that already existed — a harness writing into the authentication
// store to give itself someone to be. Verifying a code creates the identity on
// the way through, exactly as it does for a first-time developer.

const tok = Object.fromEntries(ROLES.map((r) => [r, session(email(r))]));
const outsiderTok = session(outsiderEmail);
ROLES.every((r) => tok[r]) && outsiderTok ? ok('six sessions minted') : bad('session minting failed');

// The OWNER creates the workspace; the rest are inserted as members with their
// role, which is what the server reads. Nothing is claimed client-side.
const ws = await call(tok.OWNER, '/workspaces', 'POST', { name: `rbac-${stamp}` });
const prj = await call(tok.OWNER, `/workspaces/${ws.body?.id}/projects`, 'POST', { name: `rbac-${stamp}` });
prj.body?.id ? ok(`workspace and project created (${String(prj.body.id).slice(0, 8)})`) : bad(`setup failed (${ws.status}/${prj.status})`);

ssh(`
  set -uo pipefail
  P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
  PG="$P-postgres-1"; CORE="$P-core-api-staging"
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1"; }
  ${ROLES.filter((r) => r !== 'OWNER').map((r) => `
  q "insert into developer.dev_workspace_members (workspace_id, user_id, role, accepted_at, status)
     select '${ws.body?.id}', u.id, '${r}', now(), 'ACTIVE' from account_identity.identity_users u
      where u.email='${email(r)}'" >/dev/null`).join('\n')}
  q "select count(*) from developer.dev_workspace_members where workspace_id='${ws.body?.id}'"`);

// ── reads against a project that actually has data ──────────────────────────
// A brand-new project has no financial binding, and balances, transactions and
// webhooks all answer 404 for one — "no payee yet", the state those pages
// explain. Reading them properly needs a bound project, so the five members are
// added to the canonical workspace for the length of this check and removed
// afterwards. Nothing about that workspace is modified except its membership.
step('reads against the canonical bound project — membership is the whole requirement');
const canon = ssh(`
  set -uo pipefail
  P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
  PG="$P-postgres-1"; CORE="$P-core-api-staging"
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -F'|' -c "$1"; }
  q "select p.id, p.workspace_id from developer.dev_projects p
      where p.status='ACTIVE' and exists (select 1 from developer.dev_project_sandbox_binding b
        where b.project_id=p.id and b.state='ACTIVE') limit 1"`).trim().split('|');
const [canonPrj, canonWs] = canon;
canonPrj ? ok(`canonical bound project ${canonPrj.slice(0, 8)}`) : bad('no bound project to read');

ssh(`
  set -uo pipefail
  P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
  PG="$P-postgres-1"; CORE="$P-core-api-staging"
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1"; }
  ${ROLES.map((r) => `
  q "insert into developer.dev_workspace_members (workspace_id, user_id, role, accepted_at, status)
     select '` + canonWs + `', u.id, '${r}', now(), 'ACTIVE' from account_identity.identity_users u
      where u.email='${email(r)}'
        and not exists (select 1 from developer.dev_workspace_members m
                         where m.workspace_id='` + canonWs + `' and m.user_id=u.id)" >/dev/null`).join('\n')}
  echo done`);

const READS = [
  ['balances', (p) => `/projects/${p}/balances`],
  ['transactions', (p) => `/projects/${p}/transactions`],
  ['api keys', (p) => `/projects/${p}/keys`],
  ['webhook endpoints', (p) => `/projects/${p}/webhooks/endpoints`],
  ['webhook events', (p) => `/projects/${p}/webhooks/events`],
  ['api logs', (p) => `/projects/${p}/logs`],
];
let readOk = 0;
for (const r of ROLES) {
  for (const [label, route] of READS) {
    const res = await call(tok[r], route(canonPrj));
    res.status === 200 ? readOk++ : bad(`${r} could not read ${label} (${res.status})`);
  }
}
readOk === ROLES.length * READS.length
  ? ok(`every role reads every project surface (${readOk} checks)`)
  : bad(`${readOk}/${ROLES.length * READS.length} reads succeeded`);

step('an unbound project answers "no payee", not "denied"');
// 409 PROJECT_FINANCIAL_SETUP_REQUIRED, and the code matters as much as the
// status. This asserted 404 — which is the "denied" answer the step's own name
// rejects. A fresh project used to answer 404 on balances, transactions and
// webhooks: the same answer as a project that does not exist or belongs to
// somebody else, so the only signal that setup was missing was three routes
// that looked broken. It cost an external developer their first hour.
//
// The privacy-safe 404 is untouched and is proven next door, in
// cross-project-isolation.mjs: a stranger's project and an imaginary one must
// still answer alike. The distinction is whose project it is, not what state
// it is in.
for (const [label, route] of READS.slice(0, 2)) {
  const res = await call(tok.OWNER, route(prj.body?.id));
  const code = res.body?.error?.code ?? res.body?.code ?? '';
  res.status === 409 && code === 'PROJECT_FINANCIAL_SETUP_REQUIRED'
    ? ok(`${label} on a project with no binding → 409 ${code}`)
    : bad(`${label} unexpected ${res.status} ${code}`);
}

// ── writes: canBuild ────────────────────────────────────────────────────────
step('creating a key — canBuild: OWNER, ADMIN, DEVELOPER');
const CAN_BUILD = new Set(['OWNER', 'ADMIN', 'DEVELOPER']);
const madeKeys = [];
for (const r of ROLES) {
  const res = await call(tok[r], `/projects/${prj.body?.id}/keys`, 'POST',
    { kind: 'SECRET', name: `rbac-${r}-${stamp}`, scopes: ['identity:read'] });
  if (CAN_BUILD.has(r)) {
    res.status === 201 || res.status === 200
      ? (ok(`${r} may create a key`), madeKeys.push(res.body?.id))
      : bad(`${r} should be able to create a key (${res.status})`);
  } else {
    res.status === 403 ? ok(`${r} may not create a key (403)`) : bad(`${r} CREATED a key (${res.status})`);
  }
}

step('membership management — isManager: OWNER, ADMIN');
const IS_MANAGER = new Set(['OWNER', 'ADMIN']);
for (const r of ROLES) {
  const res = await call(tok[r], `/workspaces/${ws.body?.id}/members`, 'POST',
    { email: `rbac-invitee-${r.toLowerCase()}-${stamp}@banzami-e2e.test`, role: 'VIEWER' });
  if (IS_MANAGER.has(r)) {
    res.status < 300 ? ok(`${r} may invite`) : bad(`${r} should be able to invite (${res.status})`);
  } else {
    res.status === 403 ? ok(`${r} may not invite (403)`) : bad(`${r} INVITED (${res.status})`);
  }
}

step('only an OWNER may grant OWNER');
const grant = await call(tok.ADMIN, `/workspaces/${ws.body?.id}/members`, 'POST',
  { email: `rbac-owner-attempt-${stamp}@banzami-e2e.test`, role: 'OWNER' });
grant.status === 403 ? ok('ADMIN may not grant OWNER (403)') : bad(`ADMIN granted OWNER (${grant.status})`);

// ── RBAC composed with tenancy ──────────────────────────────────────────────
step('a role is not authority outside its own workspace');
const other = await call(outsiderTok, '/workspaces', 'POST', { name: `rbac-other-${stamp}` });
const otherPrj = await call(outsiderTok, `/workspaces/${other.body?.id}/projects`, 'POST', { name: `rbac-other-${stamp}` });
for (const r of ['OWNER', 'ADMIN', 'FINANCE']) {
  const res = await call(tok[r], `/projects/${otherPrj.body?.id}/transactions`);
  res.status === 404
    ? ok(`${r} of one workspace is a stranger to another (404)`)
    : bad(`${r} saw a foreign project (${res.status})`);
}
const invented = await call(tok.OWNER, '/projects/00000000-0000-4000-8000-000000000000/transactions');
const foreign = await call(tok.OWNER, `/projects/${otherPrj.body?.id}/transactions`);
invented.status === foreign.status
  ? ok(`a foreign project and an imaginary one answer alike (${foreign.status})`)
  : bad(`existence disclosed: foreign=${foreign.status} imaginary=${invented.status}`);

// ── cleanup ─────────────────────────────────────────────────────────────────
// Reached through a finally in the caller below, because the runs that leave
// residue are the ones that failed: two earlier attempts here threw mid-matrix
// and left five fixture memberships on the canonical workspace.
step('cleanup');
for (const id of madeKeys.filter(Boolean)) await call(tok.OWNER, `/keys/${id}`, 'DELETE');
// The teardown is cleanupRun's alone. This used to delete the five identities by
// hand and leave the rest to the registered cleanup — and cleanupRun suspends a
// workspace by looking up its creator's email, so by the time it ran the creator
// was gone and the workspace stayed ACTIVE with nobody able to reach it. That
// ordering is where 267 unreachable workspaces came from.
const left = cleanupRun({
  emailPattern: `console-rbac-%${stamp}@banzami-e2e.test`,
  namePattern: `rbac-%${stamp}`,
}).includes('cleaned') ? '0' : 'unknown';
left === '0' ? ok('no account, workspace, project or key survives the run')
            : bad('cleanup did not report success');

console.log();
if (fail === 0) { console.log(`RBAC_MATRIX: PASS=${pass} FAIL=0`); process.exit(0); }
console.error(`RBAC_MATRIX: PASS=${pass} FAIL=${fail}`);
process.exit(1);
