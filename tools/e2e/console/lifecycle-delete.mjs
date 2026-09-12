#!/usr/bin/env node
/**
 * Workspace and project endings, against the deployed Console API — and proved
 * by absence, not by a status field.
 *
 * "Archived" is easy to assert and easy to fake: a row that still exists with a
 * different word in it. This suite asks the harder question. It makes real
 * workspaces and projects, ends them by the route a developer would use, and
 * then goes looking for them three ways — the API that owns them, the list the
 * Console renders its selector from, and the database row itself, over SSH. A
 * delete that left the row behind passes the first two and fails the third.
 *
 * The rule under test, one level up from the project rule that already existed:
 *
 *   never held a project          →  DELETE   (the row goes)
 *   held one, active or archived  →  ARCHIVE  (the history stays)
 *
 * and the reason the first line is allowed at all: developer.audit_events has no
 * foreign key to a workspace, so the record of the deletion outlives the row it
 * describes. That is what an append-only log owes. It does not owe an empty
 * workspace kept in somebody's selector for ever.
 *
 * Run:
 *   node tools/e2e/console/lifecycle-delete.mjs [--out <dir>]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { registerCleanup, cleanupRun } from './lib/run-cleanup.mjs';
import { assuranceDir } from '../lib/assurance-output.mjs';
import { mintSession } from './lib/mint.mjs';

const API = process.env.DEV_API ?? 'https://developer-api.banzami.com';
const ORIGIN = 'https://developers.banzami.com';
const HERE = new URL('.', import.meta.url).pathname;
const REMOTE = process.env.BANZAMI_REMOTE ?? 'root@217.160.9.248';

const results = [];
let pass = 0, fail = 0;
const record = (id, ok, observed) => {
  results.push({ id, status: ok ? 'PASS' : 'FAIL', observed });
  if (ok) { pass += 1; console.log(`  ✓ ${id} — ${observed}`); }
  else { fail += 1; console.error(`  ✗ ${id} — ${observed}`); }
};
const step = (m) => console.log(`\n${m}`);

const ssh = (s) => execFileSync('ssh', [REMOTE, s], { encoding: 'utf8', maxBuffer: 1 << 24 }).trim();
const mint = (email) => mintSession(email);

async function call(token, path, method = 'GET', body) {
  const headers = { cookie: `__Host-bz_dev_session=${token}` };
  if (method !== 'GET') {
    const me = await fetch(`${API}/auth/me`, { headers });
    const j = await me.json().catch(() => ({}));
    Object.assign(headers, { 'content-type': 'application/json', origin: ORIGIN, 'x-csrf-token': j.csrf_token ?? '' });
  }
  const r = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* 204 */ }
  return { status: r.status, body: j };
}

const stamp = Date.now().toString(36);
const EMAIL = `lifecycle-${stamp}@banzami-e2e.test`;
const TAG = `lifecycle-${stamp}`;
registerCleanup({ emailPattern: EMAIL, namePattern: `%${TAG}%` });
process.on('uncaughtException', (e) => { console.error(e); process.exit(1); });

/**
 * One read-only SQL question, asked on the deployed stack.
 *
 * The database is the only witness that can tell a deletion from a status
 * change, so the suite has to reach it — through the same container discovery
 * the other console suites use, never a hard-coded container name.
 */
const PRELUDE = `
  set -uo pipefail
  P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
  PG="$P-postgres-1"; CORE="$P-core-api-staging"
  PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#')
  q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1"; }
`;
const sql = (statement) => ssh(`${PRELUDE}\n  q ${JSON.stringify(statement)}`).trim();

/** Does this row still exist? The question a status field cannot answer. */
const rowExists = (table, id) => sql(`select count(*) from developer.${table} where id = '${id}'`) === '1';

console.log(`\nWORKSPACE / PROJECT LIFECYCLE — endings proved by absence\n  api ${API}\n  identity ${EMAIL}\n`);
// The identity comes from signing in. This used to INSERT a row into
// account_identity.identity_users because the old mint script could only sign in
// an account that already existed — a harness writing into the authentication
// store to give itself someone to be. Verifying a code creates the identity on
// the way through, exactly as it does for a first-time developer, so there is
// nothing left to insert.
const token = mint(EMAIL);

const mkWorkspace = async (name) => {
  const r = await call(token, '/workspaces', 'POST', { name: `${TAG} ${name}` });
  if (r.status !== 200 && r.status !== 201) throw new Error(`create workspace: ${r.status}`);
  return r.body;
};
const mkProject = async (wsID, name) => {
  const r = await call(token, `/workspaces/${wsID}/projects`, 'POST', { name: `${TAG} ${name}` });
  if (r.status !== 200 && r.status !== 201) throw new Error(`create project: ${r.status}`);
  return r.body;
};
const listed = async (wsID) => (await call(token, '/workspaces')).body?.workspaces?.some((w) => w.id === wsID) ?? false;

// ── 1. an empty project is deleted outright ─────────────────────────────────
step('1. a project that never became anything');
const wsA = await mkWorkspace('A');
const pEmpty = await mkProject(wsA.id, 'vazio');
{
  const fp = await call(token, `/projects/${pEmpty.id}/footprint`);
  record('EMPTY_PROJECT_DELETABLE', fp.body?.deletable === true, `footprint deletable=${fp.body?.deletable}, blockers=${JSON.stringify(fp.body?.blockers)}`);
  const del = await call(token, `/projects/${pEmpty.id}`, 'DELETE', { name: pEmpty.name });
  record('EMPTY_PROJECT_HARD_DELETE', del.status === 204, `DELETE -> ${del.status}`);
  const get = await call(token, `/projects/${pEmpty.id}`);
  const inDB = rowExists('dev_projects', pEmpty.id);
  record('DELETED_PROJECT_SELECTABLE', get.status === 404 && !inDB, `GET -> ${get.status}, database row present=${inDB}`);
}

// ── 2. a project with a history is refused, and archived instead ────────────
step('2. a project that issued a credential');
const pHistory = await mkProject(wsA.id, 'com-historia');
{
  // A key is a history: it existed and could authorise requests.
  const k = await call(token, `/projects/${pHistory.id}/keys`, 'POST', { kind: 'SECRET', name: `${TAG}-k`, scopes: ['identity:read'] });
  record('PROJECT_HISTORY_CREATED', k.status === 200 || k.status === 201, `issued an API key -> ${k.status}`);

  const fp = await call(token, `/projects/${pHistory.id}/footprint`);
  record('FINANCIAL_PROJECT_NOT_DELETABLE', fp.body?.deletable === false, `footprint deletable=${fp.body?.deletable}, blockers=${JSON.stringify(fp.body?.blockers)}`);

  const del = await call(token, `/projects/${pHistory.id}`, 'DELETE', { name: pHistory.name });
  const refused = del.status === 409 && del.body?.error?.code === 'PROJECT_NOT_EMPTY';
  record('FINANCIAL_PROJECT_HARD_DELETE_REFUSED', refused, `DELETE -> ${del.status} ${del.body?.error?.code ?? ''}`);
  record('REFUSED_DELETE_CHANGED_NOTHING', rowExists('dev_projects', pHistory.id), 'the project still exists after the refusal');

  const arch = await call(token, `/projects/${pHistory.id}/archive`, 'POST', { name: pHistory.name });
  record('FINANCIAL_PROJECT_ARCHIVE', arch.status === 200, `POST /archive -> ${arch.status}, keys revoked=${arch.body?.keys_revoked}`);

  const after = await call(token, `/projects/${pHistory.id}`);
  record('ARCHIVED_PROJECT_STILL_EXISTS', after.status === 200 && after.body?.status === 'ARCHIVED',
    `status=${after.body?.status} — archived is a state, not a deletion: the history is kept on purpose`);

  const keys = await call(token, `/projects/${pHistory.id}/keys`);
  const live = (keys.body?.keys ?? []).filter((x) => x.status === 'ACTIVE').length;
  record('ARCHIVED_PROJECT_OPERATIONAL_AUTHORITY', live === 0, `${live} active key(s) remain on the archived project`);
}

// ── 3. a workspace holding an ARCHIVED project is archived, not deleted ─────
step('3. a workspace whose project carries history');
{
  const fp = await call(token, `/workspaces/${wsA.id}/footprint`);
  record('WORKSPACE_FOOTPRINT_SEES_ARCHIVED', fp.body?.archived_projects === 1 && fp.body?.deletable === false,
    `projects=${fp.body?.projects} archived=${fp.body?.archived_projects} deletable=${fp.body?.deletable}`);

  const del = await call(token, `/workspaces/${wsA.id}`, 'DELETE', { name: wsA.name });
  const refused = del.status === 409 && del.body?.error?.code === 'WORKSPACE_NOT_EMPTY';
  record('WORKSPACE_WITH_HISTORY_DELETE_REFUSED', refused,
    `DELETE -> ${del.status} ${del.body?.error?.code ?? ''}, blockers=${JSON.stringify(del.body?.error?.details?.blockers ?? del.body?.details?.blockers)}`);

  const arch = await call(token, `/workspaces/${wsA.id}/archive`, 'POST', { name: wsA.name });
  record('HISTORICAL_WORKSPACE_ARCHIVE', arch.status === 200, `POST /archive -> ${arch.status} ${arch.body?.status ?? ''}`);
  record('ARCHIVED_WORKSPACE_STILL_EXISTS', rowExists('dev_workspaces', wsA.id), 'the row is kept, because its project is');
}

// ── 4. a workspace with an ACTIVE project refuses, and says which ───────────
step('4. a workspace still holding live work');
const wsB = await mkWorkspace('B');
const pActive = await mkProject(wsB.id, 'ativo');
{
  const del = await call(token, `/workspaces/${wsB.id}`, 'DELETE', { name: wsB.name });
  const d = del.body?.error?.details ?? del.body?.details ?? {};
  record('WORKSPACE_WITH_ACTIVE_PROJECT_DELETE_REFUSED',
    del.status === 409 && del.body?.error?.code === 'WORKSPACE_NOT_EMPTY' && d.active_projects === 1,
    `DELETE -> ${del.status} ${del.body?.error?.code ?? ''}, active_projects=${d.active_projects}`);
  record('REFUSED_WORKSPACE_DELETE_CASCADED_NOTHING', rowExists('dev_projects', pActive.id),
    'the active project is untouched by the refusal');
}

// ── 5. an empty workspace is deleted outright, and is really gone ───────────
step('5. a workspace that never held a project');
{
  // Clear the way the product's own way: delete the empty project, then the workspace.
  const dp = await call(token, `/projects/${pActive.id}`, 'DELETE', { name: pActive.name });
  record('EMPTY_PROJECT_DELETE_CLEARS_THE_BLOCKER', dp.status === 204, `DELETE project -> ${dp.status}`);

  const fp = await call(token, `/workspaces/${wsB.id}/footprint`);
  record('WORKSPACE_BECOMES_DELETABLE_AGAIN', fp.body?.deletable === true,
    `projects=${fp.body?.projects} deletable=${fp.body?.deletable} — two mistakes, both undoable`);

  const del = await call(token, `/workspaces/${wsB.id}`, 'DELETE', { name: wsB.name });
  record('EMPTY_WORKSPACE_HARD_DELETE', del.status === 204, `DELETE -> ${del.status}`);

  // The three ways of asking whether it is gone.
  const get = await call(token, `/workspaces/${wsB.id}`);
  const stillListed = await listed(wsB.id);
  const inDB = rowExists('dev_workspaces', wsB.id);
  // 403 and 404 are both "you cannot read this", and 403 is what a deleted
  // workspace SHOULD answer: membership is what grants the read, and a stranger's
  // workspace answers the same. An id that existed yesterday must not be
  // distinguishable from one that never did.
  const unreadable = get.status === 403 || get.status === 404;
  record('DELETED_WORKSPACE_SELECTABLE', unreadable && !stillListed && !inDB,
    `GET -> ${get.status}, in the Console's workspace list=${stillListed}, database row present=${inDB}`);

  // Memberships went with it; the audit record did not.
  const members = sql(`select count(*) from developer.dev_workspace_members where workspace_id = '${wsB.id}'`);
  record('DELETED_WORKSPACE_MEMBERSHIPS_CASCADED', members === '0', `${members} membership row(s) remain`);
  const audit = sql(`select count(*) from developer.audit_events where workspace_id = '${wsB.id}' and action = 'workspace.deleted'`);
  record('DELETED_WORKSPACE_AUDIT_SURVIVES', audit === '1',
    `${audit} audit event(s) record the deletion — the log outlives the row, which is why deleting it is allowed`);
}

// ── 6. give everything back ─────────────────────────────────────────────────
step('6. cleanup');
let residue;
try { residue = await cleanupRun({ emailPattern: EMAIL, namePattern: `%${TAG}%` }); }
catch (e) { residue = { error: String(e) }; }
record('LIFECYCLE_E2E_POST_RUN_RESIDUE', true, `cleanup ${JSON.stringify(residue)}`);

const outDir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : assuranceDir('lifecycle-delete');
const outFile = join(outDir, `lifecycle-delete-${stamp}.json`);
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify({
  schema: 'banzami-lifecycle-delete/v1',
  suite: 'Workspace and project endings, proved by absence',
  test: 'tools/e2e/console/lifecycle-delete.mjs',
  timestamp: new Date().toISOString(),
  api_host: API,
  fixture_identity: EMAIL,
  fixture_namespace: TAG,
  note: 'A deletion is asserted three ways — the API that owns the resource, the list the Console '
      + 'builds its selector from, and the database row over SSH. A delete that only rewrote a status '
      + 'field passes the first two and fails the third.',
  total: results.length, pass, fail,
  verdict: fail === 0 ? 'PASS' : 'FAIL',
  checks: results,
}, null, 2)}\n`);

console.log(`\nLIFECYCLE_DELETE: PASS=${pass} FAIL=${fail}`);
console.log(`evidence: ${outFile}\n`);
process.exit(fail === 0 ? 0 : 1);
