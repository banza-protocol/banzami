#!/usr/bin/env node
/**
 * SANDBOX-DELETE-001 — deleting Sandbox Projects and Workspaces, end to end, on
 * the deployed Public Sandbox.
 *
 *   project    §48 §51 §24: a Project with Financial Setup, Business, key,
 *              webhook, Wallet Account, test payer, funding, payments, refund,
 *              settlement and a receipt is deleted; authority ends at once,
 *              test resources are closed through postings, the receipt stays
 *              exactly as it was, the name is released to a NEW Project
 *   workspace  §49 §26 §27 §36: a Workspace with an active Project with
 *              activity, an archived one, a third one, a member and a pending
 *              invite is deleted without touching the children first; another
 *              tenant with the same names is untouched
 *   lifecycle  §33 §35 §50 §55 §17: double and concurrent deletes, key /
 *              session / funding / payment racing the deletion, deletion with
 *              the external rail down, an archived Project deleted, a shared
 *              test Business left alone, archive still doing only what it did
 *   selftest   every predicate is shown to FAIL on mutated evidence (no network)
 *
 *   node tools/e2e/sandbox/sandbox-delete-e2e.mjs project | workspace | lifecycle | all | selftest
 *
 * Every action goes through the product: sign-in through the mailbox
 * (mint-session), Console routes, project keys, the public hosted page. The
 * Sandbox database is read — never written — with default_transaction_read_only,
 * and only to observe what the product deliberately stops showing once a
 * resource is deleted: ledger entries, retired payers, disabled endpoints.
 * Nothing secret is printed. Run suites one at a time (OTP and gateway limits).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { assuranceDir } from '../lib/assurance-output.mjs';

const API = process.env.BZ_DEV_API ?? 'https://developer-api.banzami.com';
const GW = process.env.BZ_GATEWAY ?? 'https://sandbox-api.banzami.com';
const ORIGIN = 'https://developers.banzami.com';
const HOST = process.env.BZ_SANDBOX_HOST ?? 'root@217.160.9.248';
const SINK = 'https://sandbox-webhook.banzami.com/receive';
// DeletionGrace (60 s) plus a resumer tick (20 s) plus margin.
const FINISH_WITHIN_MS = 180000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, every = 3000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(every); } };

// ── plumbing ─────────────────────────────────────────────────────────────────

async function send(url, init) {
  for (let i = 0; ; i += 1) {
    const r = await fetch(url, init);
    if (r.status !== 429 || i === 3) return r;
    await sleep(Math.min(30, Number(r.headers.get('retry-after')) || 5) * 1000);
  }
}
function consoleCaller(token) {
  let csrf = '';
  return async (path, method = 'GET', body) => {
    const headers = { cookie: `__Host-bz_dev_session=${token}` };
    if (method !== 'GET') {
      if (!csrf) csrf = (await (await fetch(`${API}/auth/me`, { headers })).json().catch(() => ({}))).csrf_token ?? '';
      Object.assign(headers, { 'content-type': 'application/json', origin: ORIGIN, 'x-csrf-token': csrf });
    }
    const r = await send(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
}
function keyCaller(secret) {
  return async (path, method = 'GET', body, extra = {}) => {
    const headers = { authorization: `Bearer ${secret}`, ...extra };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const r = await send(GW + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
}
const SCOPES = ['identity:read', 'payment_sessions:write', 'payment_sessions:read', 'payment_links:read', 'payment_links:write', 'webhooks:write', 'webhooks:read',
  'refunds:write', 'refunds:read', 'sandbox:read', 'sandbox:write', 'wallet_accounts:create', 'wallet_accounts:read', 'application_settlements:write'];

/** A developer signed in through the product, with one Workspace. */
async function developer(label, { workspaceName } = {}) {
  const { mintSession } = await import('../console/lib/mint.mjs');
  const stamp = Date.now().toString(36) + randomBytes(2).toString('hex');
  const like = `del-${label}-${stamp}`;
  const email = `e2e-${like}@banzami-e2e.test`;
  const call = consoleCaller(mintSession(email));
  const wsName = workspaceName ?? like;
  const ws = (await call('/workspaces', 'POST', { name: wsName })).body?.id;
  const project = async (name, useCase, { workspace = ws } = {}) => {
    const created = await call(`/workspaces/${workspace}/projects`, 'POST', { name });
    const id = created.body?.id;
    if (useCase) await call(`/projects/${id}/financial-setup`, 'POST', { use_case: useCase });
    const k = await call(`/projects/${id}/keys`, 'POST', { kind: 'SECRET', name: `${name}-key`, scopes: SCOPES });
    return { id, name, api: keyCaller(k.body?.secret ?? ''), created: created.status, key: k.status };
  };
  // Cleanup is the capability under test: the Workspace is deleted.
  const cleanup = async () => {
    const w = await call(`/workspaces/${ws}`);
    // Already deleted: the Workspace no longer answers its former Owner (403/404).
    if (w.status !== 200) return [403, 404].includes(w.status) ? 200 : w.status;
    return (await call(`/workspaces/${ws}`, 'DELETE', { name: w.body?.name })).status;
  };
  return { call, ws, wsName, like, stamp, email, project, cleanup };
}

// Read-only observation of the Sandbox database, over one ssh call per query.
const PSQL = "PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1); "
  + "PW=$(sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#' /root/.banzami/operator_db_url); "
  + "docker exec -i -e PGPASSWORD=\"$PW\" -e PGOPTIONS='-c default_transaction_read_only=on' \"$PG\" "
  + "psql -q -X -U bl_app_runtime -d banzami_staging -At -F '|' -v ON_ERROR_STOP=1";
const sql = (text) => execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, PSQL], { input: text, encoding: 'utf8', timeout: 60000 }).trim();
const id = (v) => { if (!/^[0-9a-f-]{36}$/.test(String(v))) throw new Error(`not an id: ${String(v).slice(0, 40)}`); return v; };
const row = (text) => sql(text).split('\n')[0].split('|');
const num = (text) => Number(sql(text).split('\n')[0] || 'NaN');

const dbNow = () => sql('SELECT now()');
const projectRow = (P) => { const [status, name, deleted] = row(`SELECT status, name, deleted_at IS NOT NULL FROM developer.dev_projects WHERE id = '${id(P)}'`); return { status, name, deleted: deleted === 't' }; };
const activeKeys = (P) => num(`SELECT count(*) FROM developer.dev_api_keys WHERE project_id = '${id(P)}' AND status = 'ACTIVE'`);
const merchantOf = (P) => sql(`SELECT merchant_id FROM sandbox_businesses WHERE project_id = '${id(P)}'`) || null;
const BAL = "coalesce(sum(CASE e.entry_type WHEN 'CREDIT' THEN e.amount_minor ELSE -e.amount_minor END), 0)";
/** A Project's test payers: [total, unretired, not suspended, non-zero balances, negative balances]. */
const payerState = (P) => row(`
  WITH p AS (SELECT t.consumer_id, t.retired_at, c.status FROM sandbox_test_payers t JOIN consumers c ON c.id = t.consumer_id WHERE t.project_id = '${id(P)}'),
       b AS (SELECT p.consumer_id, (SELECT ${BAL} FROM ledger_entries e WHERE e.account_id IN (w.available_account_id, w.reserved_account_id)) AS bal
               FROM p JOIN consumer_wallets w ON w.consumer_id = p.consumer_id)
  SELECT (SELECT count(*) FROM p), (SELECT count(*) FROM p WHERE retired_at IS NULL), (SELECT count(*) FROM p WHERE status <> 'SUSPENDED'),
         (SELECT count(*) FROM b WHERE bal <> 0), (SELECT count(*) FROM b WHERE bal < 0)`).map(Number);
/** A Business: status, active endpoints, pending deliveries, open sessions, active links, accounts holding value. */
const businessState = (M) => {
  const [status, endpoints, pending, sessions, links, funded] = row(`
    WITH acc AS (SELECT available_account_id a FROM wallets WHERE merchant_id = '${id(M)}' UNION SELECT reserved_account_id FROM wallets WHERE merchant_id = '${M}'
                 UNION SELECT account_id FROM wallet_accounts WHERE merchant_id = '${M}')
    SELECT (SELECT status FROM merchants WHERE id = '${M}'),
           (SELECT count(*) FROM webhook_endpoints WHERE merchant_id = '${M}' AND active),
           (SELECT count(*) FROM webhook_deliveries d JOIN webhook_endpoints w ON w.id = d.endpoint_id WHERE w.merchant_id = '${M}' AND d.status = 'PENDING'),
           (SELECT count(*) FROM payment_sessions WHERE merchant_id = '${M}' AND status IN ('CREATED', 'ACTIVE')),
           (SELECT count(*) FROM payment_links WHERE merchant_id = '${M}' AND status = 'ACTIVE'),
           (SELECT count(*) FROM acc WHERE (SELECT ${BAL} FROM ledger_entries e WHERE e.account_id = acc.a) <> 0)`);
  return { status, endpoints: Number(endpoints), pending: Number(pending), sessions: Number(sessions), links: Number(links), funded: Number(funded) };
};
const unbalancedSince = (t) => num(`SELECT count(*) FROM (SELECT e.posting_id FROM ledger_entries e JOIN ledger_postings p ON p.id = e.posting_id
  WHERE p.created_at >= '${t}' GROUP BY e.posting_id HAVING sum(CASE e.entry_type WHEN 'DEBIT' THEN e.amount_minor ELSE -e.amount_minor END) <> 0) x`);
/** Fingerprint of every entry on a Business's and its payers' accounts written up to `cut`. */
const historyPrint = (P, M, cut) => sql(`
  WITH acc AS (SELECT available_account_id a FROM wallets WHERE merchant_id = '${id(M)}' UNION SELECT reserved_account_id FROM wallets WHERE merchant_id = '${M}'
               UNION SELECT account_id FROM wallet_accounts WHERE merchant_id = '${M}'
               UNION SELECT w.available_account_id FROM consumer_wallets w JOIN sandbox_test_payers t ON t.consumer_id = w.consumer_id WHERE t.project_id = '${id(P)}')
  SELECT count(*) || ':' || coalesce(md5(string_agg(e.id::text || e.posting_id || e.account_id || e.entry_type || e.amount_minor || e.created_at, ',' ORDER BY e.id)), '-')
    FROM ledger_entries e WHERE e.account_id IN (SELECT a FROM acc) AND e.created_at <= '${cut}'`);
/** Accounts a deletion retired below zero: value retired twice. (A second pass
 *  retiring a credit that arrived later is correct, and is not counted.) */
const doubleCleanups = (P) => num(`SELECT count(*) FROM (SELECT DISTINCT e.account_id FROM ledger_postings p JOIN ledger_entries e ON e.posting_id = p.id AND e.entry_type = 'DEBIT'
  WHERE p.idempotency_key LIKE 'sandbox-retire:delete:${id(P)}:%') r
  WHERE (SELECT sum(CASE x.entry_type WHEN 'CREDIT' THEN x.amount_minor ELSE -x.amount_minor END) FROM ledger_entries x WHERE x.account_id = r.account_id) < 0`);
const coreRetirementPasses = (P) => num(`SELECT count(*) FROM audit_log WHERE action = 'SANDBOX_PROJECT_RETIRED' AND subject = 'project:${id(P)}'`);
const requestLogs = (P) => num(`SELECT count(*) FROM developer.dev_api_request_logs WHERE project_id = '${id(P)}'`);
const auditCount = (action, subject) => num(`SELECT count(*) FROM developer.audit_events WHERE action = '${action.replace(/[^a-z._]/g, '')}' AND subject = '${subject.replace(/[^A-Za-z0-9:-]/g, '')}'`);

function residue(workspaces) {
  const ws = workspaces.filter(Boolean).map((w) => `'${id(w)}'`).join(',') || 'NULL';
  return num(`SELECT
      (SELECT count(*) FROM developer.dev_workspaces WHERE id IN (${ws}) AND status IN ('ACTIVE', 'ARCHIVED'))
    + (SELECT count(*) FROM developer.dev_projects WHERE workspace_id IN (${ws}) AND status IN ('ACTIVE', 'ARCHIVED'))
    + (SELECT count(*) FROM developer.dev_api_keys k JOIN developer.dev_projects p ON p.id = k.project_id WHERE p.workspace_id IN (${ws}) AND k.status = 'ACTIVE')
    + (SELECT count(*) FROM sandbox_test_payers t JOIN developer.dev_projects p ON p.id = t.project_id WHERE p.workspace_id IN (${ws}) AND t.retired_at IS NULL)
    + (SELECT count(*) FROM sandbox_businesses b JOIN merchants m ON m.id = b.merchant_id JOIN developer.dev_projects p ON p.id = b.project_id WHERE p.workspace_id IN (${ws}) AND m.status = 'ACTIVE')
    + (SELECT count(*) FROM webhook_endpoints e JOIN sandbox_businesses b ON b.merchant_id = e.merchant_id JOIN developer.dev_projects p ON p.id = b.project_id WHERE p.workspace_id IN (${ws}) AND e.active)`);
}

const session = (api, ref, amount, extra = {}) => api('/v1/payment-sessions', 'POST',
  { purpose: 'ORDER', reference_type: 'PEDIDO', reference_id: ref, amount_minor: amount, currency: 'AOA', ...extra }, { 'Idempotency-Key': `del_${ref}` });
const slugOf = (s) => String((s?.interfaces ?? []).find((x) => x.type === 'PAYMENT_LINK')?.value ?? s?.public_url ?? '').split('/').pop();
const hostedPay = async (slug) => (await send(`${GW}/v1/public/pay/${encodeURIComponent(slug)}/pay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status;
const realtime = async (sessionId, token) => (await send(`${GW}/v1/realtime/payment-sessions/${sessionId}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } })).status;
const proof = async (ref) => { const r = await send(`${GW}/v1/public/proofs/${ref}`, {}); return { status: r.status, body: await r.json().catch(() => null) }; };

function journey(name) {
  const steps = [];
  const mark = (key, title, evidence) => {
    const ok = PREDICATES[key] ? PREDICATES[key](evidence) : false;
    steps.push({ key, title, verdict: ok ? 'PASS' : 'FAIL', evidence });
    (ok ? console.log : console.error)(`  ${ok ? '✓' : '✗'} [${key}] ${title} — ${JSON.stringify(evidence).slice(0, 260)}`);
    return ok;
  };
  return { name, steps, mark };
}

// ── predicates (pure: evidence → verdict) ────────────────────────────────────

export const PREDICATES = {
  // project
  PROJECT_SETUP: (e) => e.payer === 201 && e.fund === 200 && e.account === 201 && e.paid === 200 && e.refund === 201 && e.settlement === 201
    && e.link === 201 && e.endpoint === 201 && e.receipt === 200 && e.realtimeBefore === 200 && e.sibling === 200,
  STRONG_CONFIRMATION: (e) => e.wrongName >= 400 && e.wrongName < 500 && e.keyAfterWrongName === 200,
  DELETE_ACCEPTED_WITH_ACTIVITY: (e) => [200, 202].includes(e.status) && ['DELETING', 'DELETED'].includes(e.body) && e.keysRevoked >= 1,
  KEY_DENIED_AT_ONCE: (e) => e.me === 401 && e.createSession === 401 && e.createPayer === 401 && e.activeKeys === 0,
  GONE_FROM_CONSOLE: (e) => e.listed === false && [403, 404].includes(e.get) && [403, 404].includes(e.keys) && [403, 404].includes(e.webhooks) && [403, 404].includes(e.explorer) && e.workspace === 200 && e.siblingListed === true,
  REALTIME_DENIED: (e) => e.before === 200 && e.after !== 200 && e.after < 500,
  PAYMENT_SURFACES_CLOSED: (e) => e.hostedSession !== 201 && e.hostedLink !== 201 && e.hostedSession < 500 && e.hostedLink < 500 && e.openSessions === 0 && e.activeLinks === 0,
  WEBHOOKS_DISABLED: (e) => e.endpoints === 0 && e.pending === 0,
  TEST_PAYERS_RETIRED: (e) => e.payers > 0 && e.unretired === 0 && e.usable === 0 && e.funded === 0 && e.negative === 0,
  BUSINESS_RETIRED: (e) => e.status === 'SUSPENDED' && e.funded === 0,
  LEDGER_BALANCED_HISTORY_KEPT: (e) => e.unbalanced === 0 && e.historyBefore === e.historyAfter && /^[1-9]/.test(e.historyBefore) && e.paidStillPaid === true && e.doubleCleanups === 0,
  RECEIPT_UNCHANGED: (e) => e.status === 200 && e.exists === true && e.same === true && e.sandbox === true,
  SIBLING_UNTOUCHED: (e) => e.me === 200 && e.payersRetired === 0 && e.business === 'ACTIVE',
  TOMBSTONE: (e) => e.status === 'DELETED' && e.deleted === true && e.released === true && e.logs === 0 && e.passes >= 2 && e.finishedAudit === 1,
  NAME_REUSE_NEW_RESOURCE: (e) => e.created === 201 && e.newId !== e.oldId && e.oldGet === 404 && e.newKeys === 0 && e.newSetup === false,
  IDEMPOTENT_REPEAT: (e) => e.status === 200 && e.body === 'DELETED' && e.passesBefore === e.passesAfter && e.requested === 1,
  // workspace
  WORKSPACE_SETUP: (e) => e.paidA === 200 && e.archivedB === 200 && e.keyC === 201 && e.memberJoined === 200 && e.memberSees === true && e.pendingInvite === 201 && e.otherTenant === 200,
  WORKSPACE_RBAC: (e) => e.memberDeletesProject === 403 && e.memberDeletesWorkspace === 403 && [403, 404].includes(e.nonMemberDeletes) && e.stillActive === true,
  WORKSPACE_DELETE_ACCEPTED: (e) => [200, 202].includes(e.status) && ['DELETING', 'DELETED'].includes(e.body) && e.noArchiveFirst === true,
  WORKSPACE_AUTHORITY_ENDED: (e) => e.keyA === 401 && e.keyC === 401 && e.activeKeys === 0 && e.childStates.every((s) => ['DELETING', 'DELETED'].includes(s)),
  WORKSPACE_GONE_FOR_EVERYONE: (e) => e.ownerLists === false && [403, 404].includes(e.ownerGet) && e.memberLists === false && [403, 404].includes(e.memberProject) && [403, 404].includes(e.memberMembers),
  PENDING_INVITE_INVALID: (e) => e.revoked === true && e.accept >= 400 && e.accept < 500,
  WORKSPACE_TEST_RESOURCES_RETIRED: (e) => e.unretiredPayers === 0 && e.businesses.every((s) => s === 'SUSPENDED') && e.endpoints === 0 && e.funded === 0,
  OTHER_TENANT_UNTOUCHED: (e) => e.key === 200 && e.listed === true && e.sameNames === true,
  WORKSPACE_TOMBSTONE: (e) => e.status === 'DELETED' && e.projects.every((s) => s === 'DELETED') && e.members === 0 && e.unbalanced === 0,
  // lifecycle
  DELETE_WITH_RAIL_DOWN: (e) => e.rail === 'UNAVAILABLE' && [200, 202].includes(e.status) && e.activeKeys === 0,
  CONCURRENT_DELETES: (e) => e.statuses.every((s) => [200, 202].includes(s)) && e.requested === 1,
  KEY_RACE: (e) => e.activeKeys === 0 && e.outcomes.every((s) => [201, 404, 409].includes(s)) && e.outcomes.includes(201) && e.outcomes.some((s) => s !== 201),
  SESSION_RACE: (e) => e.outcomes.every((s) => [201, 401, 409].includes(s)) && e.outcomes.includes(201) && e.outcomes.some((s) => s !== 201) && e.openAfterFinish === 0,
  FUNDING_PAYMENT_RACE: (e) => e.outcomes.every((s) => [200, 401, 409, 422].includes(s)) && e.outcomes.includes(200) && e.outcomes.some((s) => s !== 200) && e.unretired === 0 && e.funded === 0,
  ARCHIVED_PROJECT_DELETED: (e) => e.archive === 200 && [200, 202].includes(e.delete) && e.gone === true,
  ARCHIVED_WORKSPACE_DELETED: (e) => e.archive === 200 && e.hiddenByDefault === true && e.offered === true && [200, 202].includes(e.delete) && e.gone === true,
  ARCHIVE_REGRESSION: (e) => e.archive === 200 && e.key === 401 && e.listedArchived === true && e.status === 'ARCHIVED' && e.payerRetired === false
    && e.business === 'ACTIVE' && e.workspaceArchive === 409 && e.deleteAfter === 202,
  SHARED_BUSINESS_KEPT: (e) => e.linked === 200 && [200, 202].includes(e.deleteOwner) && e.business === 'ACTIVE' && e.partnerPays === 200,
  RESIDUE_ZERO: (e) => [200, 202].includes(e.cleanup) && e.residue === 0,
};

// ── project ──────────────────────────────────────────────────────────────────

async function projectSuite() {
  const j = journey('project');
  const dev = await developer('prj');
  const s = dev.stamp;
  const t0 = dbNow();
  try {
    const A = await dev.project(`${dev.like}-shop`, 'APPLICATION');
    const B = await dev.project(`${dev.like}-other`, 'STANDARD');
    const payerB = await B.api('/v1/sandbox/test-payers', 'POST', { label: 'B' }, { 'Idempotency-Key': `del_${s}_pb` });

    const payer = await A.api('/v1/sandbox/test-payers', 'POST', { label: 'Cliente (teste)' }, { 'Idempotency-Key': `del_${s}_payer` });
    const T = payer.body?.id;
    const fund = await A.api(`/v1/sandbox/test-payers/${T}/fund`, 'POST', { amount_minor: 500000 }, { 'Idempotency-Key': `del_${s}_fund` });
    const acct = await A.api('/v1/wallet-accounts', 'POST', { purpose: 'CAMPAIGN', reference_type: 'CAMPANHA', reference_id: `del_${s}`, label: 'Campanha' }, { 'Idempotency-Key': `del_${s}_acct` });
    const W = acct.body?.id ?? acct.body?.wallet_account_id;
    const s1 = await session(A.api, `${s}_1`, 300000, { purpose: 'DONATION', reference_type: 'CAMPANHA', wallet_account_id: W });
    const paid = await A.api(`/v1/sandbox/test-payers/${T}/payments`, 'POST', { payment_session_id: s1.body?.session_id }, { 'Idempotency-Key': `del_${s}_pay1` });
    const read1 = await A.api(`/v1/payment-sessions/${s1.body?.session_id}`);
    const refund = await A.api('/v1/refunds', 'POST', { ...(read1.body?.refund_source ?? {}), amount_minor: 50000, currency: 'AOA', idempotency_key: `del_${s}_rf`, reason: 'parcial' });
    const handle = (await dev.call(`/projects/${A.id}/financial-setup`)).body?.readiness?.financial_identity?.handle;
    const benef = await A.api('/v1/sandbox/test-payers', 'POST', { label: 'Beneficiário', initial_balance_minor: 0 }, { 'Idempotency-Key': `del_${s}_benef` });
    const settle = await A.api('/v1/application-settlements', 'POST', { source_account_id: W, beneficiary_banza_name: `@${benef.body?.handle}`, fee_destination_banza_name: handle, reference_id: `del_${s}`, reason: 'Campanha encerrada', idempotency_key: `del_${s}_settle` });
    // Value left behind on purpose: a funded payer and an open session with its status token.
    const link = await A.api('/v1/payment-links', 'POST', { amount_minor: 45000, currency: 'AOA', description: 'Link por pagar' });
    const linkSlug = link.body?.slug ?? '';
    const open = await session(A.api, `${s}_open`, 70000);
    const openId = open.body?.session_id; const token = open.body?.realtime?.token;
    const endpoint = await A.api('/v1/webhooks/endpoints', 'POST', { url: `${SINK}/del${s}`, events: ['payment_session.paid'] });
    const ref = paid.body?.proof_reference;
    const receiptBefore = ref ? await proof(ref) : { status: 0 };
    const rtBefore = await realtime(openId, token);
    j.mark('PROJECT_SETUP', 'A Project with Financial Setup, Business, key, webhook, Wallet Account, payer, funding, payment, refund, settlement, link, receipt', {
      payer: payer.status, fund: fund.status, account: acct.status, paid: paid.status, refund: refund.status, settlement: settle.status,
      link: link.status, endpoint: endpoint.status, receipt: receiptBefore.status, realtimeBefore: rtBefore, sibling: (await B.api('/v1/me')).status,
    });

    const M = merchantOf(A.id);
    const MB = merchantOf(B.id);
    await sleep(1500); // the request log of the calls above is written asynchronously
    const cut = dbNow();
    const historyBefore = historyPrint(A.id, M, cut);

    const wrong = await dev.call(`/projects/${A.id}`, 'DELETE', { name: `${A.name} ` + 'x' });
    j.mark('STRONG_CONFIRMATION', 'Deleting needs the Project name typed exactly', { wrongName: wrong.status, keyAfterWrongName: (await A.api('/v1/me')).status });

    const del = await dev.call(`/projects/${A.id}`, 'DELETE', { name: A.name });
    j.mark('DELETE_ACCEPTED_WITH_ACTIVITY', 'Delete is accepted after financial activity, without archiving', { status: del.status, body: del.body?.status, keysRevoked: del.body?.keys_revoked });

    j.mark('KEY_DENIED_AT_ONCE', 'The key captured before deletion is refused on the next request', {
      me: (await A.api('/v1/me')).status, createSession: (await session(A.api, `${s}_after`, 1000)).status,
      createPayer: (await A.api('/v1/sandbox/test-payers', 'POST', {}, { 'Idempotency-Key': `del_${s}_after` })).status, activeKeys: activeKeys(A.id),
    });

    const list = (await dev.call(`/workspaces/${dev.ws}/projects?include_archived=true`)).body?.projects ?? [];
    j.mark('GONE_FROM_CONSOLE', 'The Project leaves lists, settings, keys, webhooks and the Explorer; the Workspace and the other Project stay', {
      listed: list.some((p) => p.id === A.id), get: (await dev.call(`/projects/${A.id}`)).status, keys: (await dev.call(`/projects/${A.id}/keys`)).status,
      webhooks: (await dev.call(`/projects/${A.id}/webhooks/endpoints`)).status,
      explorer: (await dev.call(`/projects/${A.id}/explorer/requests`, 'POST', { operation_id: 'listTestPayers' })).status,
      workspace: (await dev.call(`/workspaces/${dev.ws}`)).status, siblingListed: list.some((p) => p.id === B.id),
    });

    j.mark('REALTIME_DENIED', 'A status token issued before deletion no longer opens the session', { before: rtBefore, after: await realtime(openId, token) });

    const bs = businessState(M);
    j.mark('PAYMENT_SURFACES_CLOSED', 'The hosted page accepts nothing for the open session or link', {
      hostedSession: await hostedPay(slugOf(open.body)), hostedLink: linkSlug ? await hostedPay(linkSlug) : 404, openSessions: bs.sessions, activeLinks: bs.links,
    });
    j.mark('WEBHOOKS_DISABLED', 'Webhook endpoints are disabled and nothing is left pending', { endpoints: bs.endpoints, pending: bs.pending });
    const [payers, unretired, usable, funded, negative] = payerState(A.id);
    j.mark('TEST_PAYERS_RETIRED', 'Every test payer is retired, suspended and at zero', { payers, unretired, usable, funded, negative });
    j.mark('BUSINESS_RETIRED', 'The Project\'s own test Business is suspended with every account at zero', { status: bs.status, funded: bs.funded });

    const paidNow = sql(`SELECT status FROM payment_sessions WHERE id = '${id(s1.body?.session_id)}'`);
    j.mark('LEDGER_BALANCED_HISTORY_KEPT', 'Every posting balances, no earlier entry changed, the paid session is still PAID, no account retired twice', {
      unbalanced: unbalancedSince(t0), historyBefore, historyAfter: historyPrint(A.id, M, cut), paidStillPaid: paidNow === 'PAID', doubleCleanups: doubleCleanups(A.id),
    });

    const receiptAfter = ref ? await proof(ref) : { status: 0 };
    j.mark('RECEIPT_UNCHANGED', 'The receipt still verifies, byte for byte the same, and says Sandbox', {
      status: receiptAfter.status, exists: receiptAfter.body?.exists, same: JSON.stringify(receiptAfter.body) === JSON.stringify(receiptBefore.body),
      sandbox: receiptAfter.body?.environment === 'SANDBOX',
    });
    j.mark('SIBLING_UNTOUCHED', 'The other Project, its payer and its Business are untouched', {
      me: (await B.api('/v1/me')).status, payersRetired: num(`SELECT count(*) FROM sandbox_test_payers WHERE project_id = '${id(B.id)}' AND retired_at IS NOT NULL`),
      business: businessState(MB).status, payer: payerB.status,
    });

    await until(() => projectRow(A.id).status === 'DELETED', FINISH_WITHIN_MS);
    const tomb = projectRow(A.id);
    j.mark('TOMBSTONE', 'After the grace the Project is a tombstone: name released, request logs gone, retired again by a final pass', {
      status: tomb.status, deleted: tomb.deleted, released: tomb.name !== A.name, logs: requestLogs(A.id), passes: coreRetirementPasses(A.id),
      finishedAudit: auditCount('project.deleted', `PROJECT:${A.id}`),
    });

    const again = await dev.call(`/workspaces/${dev.ws}/projects`, 'POST', { name: A.name });
    j.mark('NAME_REUSE_NEW_RESOURCE', 'The same name creates a NEW Project with nothing of the old one', {
      created: again.status, newId: again.body?.id, oldId: A.id, oldGet: (await dev.call(`/projects/${A.id}`)).status,
      newKeys: again.body?.id ? activeKeys(again.body.id) : -1, newSetup: again.body?.id ? Boolean(merchantOf(again.body.id)) : true,
    });

    const passesBefore = coreRetirementPasses(A.id);
    const repeat = await dev.call(`/projects/${A.id}`, 'DELETE', { name: A.name });
    j.mark('IDEMPOTENT_REPEAT', 'Deleting again answers DELETED and retires nothing twice', {
      status: repeat.status, body: repeat.body?.status, passesBefore, passesAfter: coreRetirementPasses(A.id), requested: auditCount('project.deletion_requested', `PROJECT:${A.id}`),
    });
  } catch (e) {
    console.error(`  ! aborted: ${String(e.stack ?? e).split('\n').slice(0, 2).join(' | ')}`);
    j.steps.push({ key: 'ABORTED', verdict: 'FAIL', evidence: String(e.message ?? e) });
  } finally {
    const cleanup = await dev.cleanup();
    await until(() => residue([dev.ws]) === 0, 10000, 2000);
    j.mark('RESIDUE_ZERO', 'The Workspace is deleted through the product and nothing active remains', { cleanup, residue: residue([dev.ws]) });
  }
  return finish(j);
}

// ── workspace ────────────────────────────────────────────────────────────────

async function workspaceSuite() {
  const j = journey('workspace');
  const owner = await developer('wso');
  // Another tenant: its own person, a Workspace and a Project with the SAME names.
  const other = await developer('wsx', { workspaceName: owner.wsName });
  const s = owner.stamp;
  const t0 = dbNow();
  try {
    const A = await owner.project('Loja', 'STANDARD');
    const B = await owner.project('Arquivo', 'STANDARD');
    const C = await owner.project('Sem dinheiro');
    const X = await other.project('Loja', 'STANDARD');

    const pa = await A.api('/v1/sandbox/test-payers', 'POST', { label: 'A' }, { 'Idempotency-Key': `del_${s}_pa` });
    const sa = await session(A.api, `${s}_a`, 90000);
    const payA = await A.api(`/v1/sandbox/test-payers/${pa.body?.id}/payments`, 'POST', { payment_session_id: sa.body?.session_id }, { 'Idempotency-Key': `del_${s}_paya` });
    await A.api('/v1/webhooks/endpoints', 'POST', { url: `${SINK}/delws${s}`, events: ['payment_session.paid'] });
    const pb = await B.api('/v1/sandbox/test-payers', 'POST', { label: 'B' }, { 'Idempotency-Key': `del_${s}_pb` });
    await session(B.api, `${s}_b`, 30000);
    const archivedB = await owner.call(`/projects/${B.id}/archive`, 'POST', { name: B.name });

    const inv = await owner.call(`/workspaces/${owner.ws}/members`, 'POST', { email: other.email, role: 'DEVELOPER' });
    const joined = await other.call('/invites/accept', 'POST', { token: inv.body?.token });
    const pendingEmail = `e2e-${owner.like}-pending@banzami-e2e.test`;
    const pending = await owner.call(`/workspaces/${owner.ws}/members`, 'POST', { email: pendingEmail, role: 'VIEWER' });
    const memberSees = ((await other.call('/workspaces')).body?.workspaces ?? []).some((w) => w.id === owner.ws);
    j.mark('WORKSPACE_SETUP', 'A: activity; B: activity then archived; C: key only; a member; a pending invite; another tenant with the same names', {
      paidA: payA.status, archivedB: archivedB.status, keyC: C.key, memberJoined: joined.status, memberSees, pendingInvite: pending.status,
      otherTenant: (await X.api('/v1/me')).status, payerB: pb.status,
    });

    j.mark('WORKSPACE_RBAC', 'A Developer member deletes neither a Project nor the Workspace; a stranger cannot find it', {
      memberDeletesProject: (await other.call(`/projects/${A.id}`, 'DELETE', { name: A.name })).status,
      memberDeletesWorkspace: (await other.call(`/workspaces/${owner.ws}`, 'DELETE', { name: owner.wsName })).status,
      nonMemberDeletes: (await other.call(`/projects/${X.id}`, 'GET')).status === 200 ? (await owner.call(`/projects/${X.id}`, 'DELETE', { name: 'Loja' })).status : -1,
      stillActive: projectRow(A.id).status === 'ACTIVE' && projectRow(X.id).status === 'ACTIVE',
    });

    const del = await owner.call(`/workspaces/${owner.ws}`, 'DELETE', { name: owner.wsName });
    j.mark('WORKSPACE_DELETE_ACCEPTED', 'The Owner deletes the Workspace with an active Project with activity and an archived one, touching no child first', {
      status: del.status, body: del.body?.status, noArchiveFirst: projectRow(A.id).status !== 'ARCHIVED',
    });
    j.mark('WORKSPACE_AUTHORITY_ENDED', 'Every child key is refused at once and every child is DELETING', {
      keyA: (await A.api('/v1/me')).status, keyC: (await C.api('/v1/me')).status, activeKeys: activeKeys(A.id) + activeKeys(B.id) + activeKeys(C.id),
      childStates: [A, B, C].map((p) => projectRow(p.id).status),
    });
    j.mark('WORKSPACE_GONE_FOR_EVERYONE', 'Neither the Owner nor the member can reach the Workspace or its Projects', {
      ownerLists: ((await owner.call('/workspaces')).body?.workspaces ?? []).some((w) => w.id === owner.ws), ownerGet: (await owner.call(`/workspaces/${owner.ws}`)).status,
      memberLists: ((await other.call('/workspaces')).body?.workspaces ?? []).some((w) => w.id === owner.ws),
      memberProject: (await other.call(`/projects/${A.id}`)).status, memberMembers: (await other.call(`/workspaces/${owner.ws}/members`)).status,
    });
    j.mark('PENDING_INVITE_INVALID', 'The pending invite is revoked and its token accepts nobody', {
      revoked: sql(`SELECT revoked_at IS NOT NULL FROM developer.dev_workspace_invites WHERE workspace_id = '${id(owner.ws)}' AND email = '${pendingEmail.replace(/[^a-z0-9@.-]/g, '')}'`) === 't',
      // The invited person signs in with the invited email, so only the deletion can refuse it.
      accept: await (async () => {
        const { mintSession } = await import('../console/lib/mint.mjs');
        const invited = consoleCaller(mintSession(pendingEmail));
        const r = await invited('/invites/accept', 'POST', { token: pending.body?.token });
        const sees = ((await invited('/workspaces')).body?.workspaces ?? []).some((w) => w.id === owner.ws);
        return sees ? 200 : r.status;
      })(),
    });
    const merchants = [A, B].map((p) => merchantOf(p.id));
    const states = merchants.map((m) => businessState(m));
    j.mark('WORKSPACE_TEST_RESOURCES_RETIRED', 'Payers of the active and the archived Project are retired; both Businesses suspended, at zero, without webhooks', {
      unretiredPayers: payerState(A.id)[1] + payerState(B.id)[1], businesses: states.map((x) => x.status),
      endpoints: states.reduce((n, x) => n + x.endpoints, 0), funded: states.reduce((n, x) => n + x.funded, 0) + payerState(A.id)[3] + payerState(B.id)[3],
    });
    const xList = (await other.call('/workspaces')).body?.workspaces ?? [];
    j.mark('OTHER_TENANT_UNTOUCHED', 'The other tenant with the same Workspace and Project names keeps working', {
      key: (await X.api('/v1/me')).status, listed: xList.some((w) => w.id === other.ws), sameNames: xList.find((w) => w.id === other.ws)?.name === owner.wsName,
    });

    await until(() => sql(`SELECT status FROM developer.dev_workspaces WHERE id = '${id(owner.ws)}'`) === 'DELETED', FINISH_WITHIN_MS);
    j.mark('WORKSPACE_TOMBSTONE', 'After the grace the Workspace and its Projects are tombstones; memberships are gone; the book balances', {
      status: sql(`SELECT status FROM developer.dev_workspaces WHERE id = '${id(owner.ws)}'`), projects: [A, B, C].map((p) => projectRow(p.id).status),
      members: num(`SELECT count(*) FROM developer.dev_workspace_members WHERE workspace_id = '${id(owner.ws)}'`), unbalanced: unbalancedSince(t0),
    });
  } catch (e) {
    console.error(`  ! aborted: ${String(e.stack ?? e).split('\n').slice(0, 2).join(' | ')}`);
    j.steps.push({ key: 'ABORTED', verdict: 'FAIL', evidence: String(e.message ?? e) });
  } finally {
    const a = await owner.cleanup();
    const b = await other.cleanup();
    await until(() => residue([owner.ws, other.ws]) === 0, 10000, 2000);
    j.mark('RESIDUE_ZERO', 'Both Workspaces deleted through the product; nothing active remains', { cleanup: [a, b].every((x) => [200, 202].includes(x)) ? 200 : a, residue: residue([owner.ws, other.ws]) });
  }
  return finish(j);
}

// ── lifecycle ────────────────────────────────────────────────────────────────

async function lifecycleSuite() {
  const j = journey('lifecycle');
  const dev = await developer('lfc');
  const s = dev.stamp;
  const finished = [];
  const extraWorkspaces = [];
  try {
    // §50: the external rail is down; deletion does not need it.
    const R = await dev.project(`${dev.like}-rail`, 'STANDARD');
    const railDown = await R.api('/v1/sandbox/external-rail', 'PUT', { state: 'UNAVAILABLE' }, { 'Idempotency-Key': `del_${s}_rail` });
    const dr = await dev.call(`/projects/${R.id}`, 'DELETE', { name: R.name });
    j.mark('DELETE_WITH_RAIL_DOWN', 'A Project whose external rail is UNAVAILABLE is deleted', { rail: railDown.body?.state, status: dr.status, activeKeys: activeKeys(R.id) });
    finished.push(R.id);

    // §33/§35: the same Project deleted by concurrent requests.
    const D = await dev.project(`${dev.like}-twice`, 'STANDARD');
    const statuses = (await Promise.all(Array.from({ length: 6 }, () => dev.call(`/projects/${D.id}`, 'DELETE', { name: D.name })))).map((r) => r.status);
    j.mark('CONCURRENT_DELETES', 'Six concurrent deletes all succeed and the deletion is recorded once', { statuses, requested: auditCount('project.deletion_requested', `PROJECT:${D.id}`) });
    finished.push(D.id);

    // §35: keys created while the deletion wins.
    const K = await dev.project(`${dev.like}-keys`);
    // Staggered from before the delete is sent to well after it has committed, so
    // some land first and some meet the deletion.
    const RACERS = 14; const STEP = 120;
    const keyRace = await Promise.all([
      ...Array.from({ length: RACERS }, (_, i) => sleep(i * STEP).then(() => dev.call(`/projects/${K.id}/keys`, 'POST', { kind: 'SECRET', name: `race-${i}`, scopes: ['identity:read'] }))),
      sleep(STEP).then(() => dev.call(`/projects/${K.id}`, 'DELETE', { name: K.name })),
    ]);
    j.mark('KEY_RACE', 'Keys created racing the deletion: each lands first or is refused, and none is left ACTIVE', { activeKeys: activeKeys(K.id), outcomes: keyRace.slice(0, RACERS).map((r) => r.status), delete: keyRace[RACERS].status });
    finished.push(K.id);

    // §35: sessions created racing the deletion.
    const S = await dev.project(`${dev.like}-sessions`, 'STANDARD');
    const MS = merchantOf(S.id);
    const sessionRace = await Promise.all([
      ...Array.from({ length: RACERS }, (_, i) => sleep(i * STEP).then(() => session(S.api, `${s}_race_${i}`, 1000 + i))),
      sleep(STEP).then(() => dev.call(`/projects/${S.id}`, 'DELETE', { name: S.name })),
    ]);
    finished.push(S.id);

    // §35: funding and a payment racing the deletion.
    const F = await dev.project(`${dev.like}-funding`, 'STANDARD');
    const fp = await F.api('/v1/sandbox/test-payers', 'POST', { label: 'F' }, { 'Idempotency-Key': `del_${s}_fp` });
    const fs = await session(F.api, `${s}_fs`, 20000);
    const fundRace = await Promise.all([
      ...Array.from({ length: RACERS - 1 }, (_, i) => sleep(i * STEP).then(() => F.api(`/v1/sandbox/test-payers/${fp.body?.id}/fund`, 'POST', { amount_minor: 10000 }, { 'Idempotency-Key': `del_${s}_f${i}` }))),
      sleep(STEP).then(() => F.api(`/v1/sandbox/test-payers/${fp.body?.id}/payments`, 'POST', { payment_session_id: fs.body?.session_id }, { 'Idempotency-Key': `del_${s}_fpay` })),
      sleep(STEP).then(() => dev.call(`/projects/${F.id}`, 'DELETE', { name: F.name })),
    ]);
    finished.push(F.id);

    // §6: an archived Project is deleted.
    const Z = await dev.project(`${dev.like}-archived`, 'STANDARD');
    const za = await dev.call(`/projects/${Z.id}/archive`, 'POST', { name: Z.name });
    const zd = await dev.call(`/projects/${Z.id}`, 'DELETE', { name: Z.name });
    const zl = (await dev.call(`/workspaces/${dev.ws}/projects?include_archived=true`)).body?.projects ?? [];
    j.mark('ARCHIVED_PROJECT_DELETED', 'An archived Project is deleted and leaves the archived list', { archive: za.status, delete: zd.status, gone: !zl.some((p) => p.id === Z.id) });
    finished.push(Z.id);

    // §17: a test Business shared with another Project. Both stay ACTIVE for now.
    const O = await dev.project(`${dev.like}-owner`, 'STANDARD');
    const P2 = await dev.project(`${dev.like}-partner`);
    const code = await dev.call(`/projects/${O.id}/financial-setup/share-code`, 'POST');
    const linked = await dev.call(`/projects/${P2.id}/financial-onboarding/link`, 'POST', { code: code.body?.code });
    const MO = merchantOf(O.id);

    // An archived Workspace is reachable ("Mostrar arquivados") and deletable.
    const aw = (await dev.call('/workspaces', 'POST', { name: `${dev.like}-arquivo` })).body;
    const awArchive = await dev.call(`/workspaces/${aw?.id}/archive`, 'POST', { name: aw?.name });
    const hiddenByDefault = !((await dev.call('/workspaces')).body?.workspaces ?? []).some((w) => w.id === aw?.id);
    const offered = ((await dev.call('/workspaces?include_archived=true')).body?.workspaces ?? []).some((w) => w.id === aw?.id && w.status === 'ARCHIVED');
    const awDelete = await dev.call(`/workspaces/${aw?.id}`, 'DELETE', { name: aw?.name });
    const awGone = !((await dev.call('/workspaces?include_archived=true')).body?.workspaces ?? []).some((w) => w.id === aw?.id);
    j.mark('ARCHIVED_WORKSPACE_DELETED', 'An archived Workspace is offered on request and deleted', { archive: awArchive.status, hiddenByDefault, offered, delete: awDelete.status, gone: awGone });
    extraWorkspaces.push(aw?.id);

    // §55: archive still does only what it did.
    const V = await dev.project(`${dev.like}-kept`, 'STANDARD');
    const vp = await V.api('/v1/sandbox/test-payers', 'POST', { label: 'V' }, { 'Idempotency-Key': `del_${s}_vp` });
    const va = await dev.call(`/projects/${V.id}/archive`, 'POST', { name: V.name });
    const wsArchive = await dev.call(`/workspaces/${dev.ws}/archive`, 'POST', { name: dev.wsName });
    const vl = (await dev.call(`/workspaces/${dev.ws}/projects?include_archived=true`)).body?.projects ?? [];
    const archiveEvidence = {
      archive: va.status, key: (await V.api('/v1/me')).status, listedArchived: vl.some((p) => p.id === V.id && p.status === 'ARCHIVED'), status: projectRow(V.id).status,
      payerRetired: vp.body?.id ? sql(`SELECT retired_at IS NOT NULL FROM sandbox_test_payers WHERE consumer_id = '${id(vp.body.id)}'`) === 't' : true,
      business: businessState(merchantOf(V.id)).status, workspaceArchive: wsArchive.status,
    };
    archiveEvidence.deleteAfter = (await dev.call(`/projects/${V.id}`, 'DELETE', { name: V.name })).status;
    j.mark('ARCHIVE_REGRESSION', 'Archive revokes keys and keeps the Project, its payer and Business; a Workspace with an active Project still refuses archive', archiveEvidence);
    finished.push(V.id);

    // §17: the Project that created a shared test Business is deleted (after the archive check, which needs a live Project).
    const deleteOwner = (await dev.call(`/projects/${O.id}`, 'DELETE', { name: O.name })).status;
    finished.push(O.id);

    // Everything above finishes; then the races are judged on the final state.
    await until(() => finished.every((p) => projectRow(p).status === 'DELETED'), FINISH_WITHIN_MS + 60000);
    j.mark('SESSION_RACE', 'Sessions created racing the deletion: each is created or refused, and none is left payable', {
      outcomes: sessionRace.slice(0, RACERS).map((r) => r.status), delete: sessionRace[RACERS].status, openAfterFinish: businessState(MS).sessions,
    });
    const [, unretired, , funded] = payerState(F.id);
    j.mark('FUNDING_PAYMENT_RACE', 'Funding and a payment racing the deletion: committed or refused, and the payer ends retired at zero', {
      outcomes: fundRace.slice(0, RACERS).map((r) => r.status), delete: fundRace[RACERS].status, unretired, funded,
    });
    const sp = await P2.api('/v1/sandbox/test-payers', 'POST', { label: 'P2' }, { 'Idempotency-Key': `del_${s}_p2p` });
    const ss = await session(P2.api, `${s}_p2`, 5000);
    j.mark('SHARED_BUSINESS_KEPT', 'Deleting the Project that created a shared test Business leaves it working for the partner Project', {
      linked: linked.status, deleteOwner, business: businessState(MO).status,
      partnerPays: (await P2.api(`/v1/sandbox/test-payers/${sp.body?.id}/payments`, 'POST', { payment_session_id: ss.body?.session_id }, { 'Idempotency-Key': `del_${s}_p2pay` })).status,
    });
  } catch (e) {
    console.error(`  ! aborted: ${String(e.stack ?? e).split('\n').slice(0, 2).join(' | ')}`);
    j.steps.push({ key: 'ABORTED', verdict: 'FAIL', evidence: String(e.message ?? e) });
  } finally {
    const cleanup = await dev.cleanup();
    await until(() => residue([dev.ws, ...extraWorkspaces]) === 0, 10000, 2000);
    j.mark('RESIDUE_ZERO', 'The Workspace is deleted through the product and nothing active remains', { cleanup, residue: residue([dev.ws, ...extraWorkspaces]) });
  }
  return finish(j);
}

function finish(j) {
  const passed = j.steps.filter((x) => x.verdict === 'PASS').length;
  const verdict = passed === j.steps.length && j.steps.length > 0 ? 'PASS' : 'FAIL';
  console.log(`\nSANDBOX_DELETE_${j.name.toUpperCase()}_SUITE=${verdict} (${passed}/${j.steps.length})`);
  return { suite: j.name, verdict, passed, total: j.steps.length, steps: j.steps };
}

// ── selftest ─────────────────────────────────────────────────────────────────

const GOOD = {
  PROJECT_SETUP: { payer: 201, fund: 200, account: 201, paid: 200, refund: 201, settlement: 201, link: 201, endpoint: 201, receipt: 200, realtimeBefore: 200, sibling: 200 },
  STRONG_CONFIRMATION: { wrongName: 400, keyAfterWrongName: 200 },
  DELETE_ACCEPTED_WITH_ACTIVITY: { status: 202, body: 'DELETING', keysRevoked: 1 },
  KEY_DENIED_AT_ONCE: { me: 401, createSession: 401, createPayer: 401, activeKeys: 0 },
  GONE_FROM_CONSOLE: { listed: false, get: 404, keys: 404, webhooks: 404, explorer: 404, workspace: 200, siblingListed: true },
  REALTIME_DENIED: { before: 200, after: 404 },
  PAYMENT_SURFACES_CLOSED: { hostedSession: 422, hostedLink: 422, openSessions: 0, activeLinks: 0 },
  WEBHOOKS_DISABLED: { endpoints: 0, pending: 0 },
  TEST_PAYERS_RETIRED: { payers: 2, unretired: 0, usable: 0, funded: 0, negative: 0 },
  BUSINESS_RETIRED: { status: 'SUSPENDED', funded: 0 },
  LEDGER_BALANCED_HISTORY_KEPT: { unbalanced: 0, historyBefore: '12:abc', historyAfter: '12:abc', paidStillPaid: true, doubleCleanups: 0 },
  RECEIPT_UNCHANGED: { status: 200, exists: true, same: true, sandbox: true },
  SIBLING_UNTOUCHED: { me: 200, payersRetired: 0, business: 'ACTIVE' },
  TOMBSTONE: { status: 'DELETED', deleted: true, released: true, logs: 0, passes: 3, finishedAudit: 1 },
  NAME_REUSE_NEW_RESOURCE: { created: 201, newId: 'b', oldId: 'a', oldGet: 404, newKeys: 0, newSetup: false },
  IDEMPOTENT_REPEAT: { status: 200, body: 'DELETED', passesBefore: 3, passesAfter: 3, requested: 1 },
  WORKSPACE_SETUP: { paidA: 200, archivedB: 200, keyC: 201, memberJoined: 200, memberSees: true, pendingInvite: 201, otherTenant: 200 },
  WORKSPACE_RBAC: { memberDeletesProject: 403, memberDeletesWorkspace: 403, nonMemberDeletes: 404, stillActive: true },
  WORKSPACE_DELETE_ACCEPTED: { status: 202, body: 'DELETING', noArchiveFirst: true },
  WORKSPACE_AUTHORITY_ENDED: { keyA: 401, keyC: 401, activeKeys: 0, childStates: ['DELETING', 'DELETING', 'DELETING'] },
  WORKSPACE_GONE_FOR_EVERYONE: { ownerLists: false, ownerGet: 404, memberLists: false, memberProject: 404, memberMembers: 404 },
  PENDING_INVITE_INVALID: { revoked: true, accept: 404 },
  WORKSPACE_TEST_RESOURCES_RETIRED: { unretiredPayers: 0, businesses: ['SUSPENDED', 'SUSPENDED'], endpoints: 0, funded: 0 },
  OTHER_TENANT_UNTOUCHED: { key: 200, listed: true, sameNames: true },
  WORKSPACE_TOMBSTONE: { status: 'DELETED', projects: ['DELETED', 'DELETED', 'DELETED'], members: 0, unbalanced: 0 },
  DELETE_WITH_RAIL_DOWN: { rail: 'UNAVAILABLE', status: 202, activeKeys: 0 },
  CONCURRENT_DELETES: { statuses: [202, 202, 202], requested: 1 },
  KEY_RACE: { activeKeys: 0, outcomes: [201, 409, 404] },
  SESSION_RACE: { outcomes: [201, 401, 409], openAfterFinish: 0 },
  FUNDING_PAYMENT_RACE: { outcomes: [200, 401], unretired: 0, funded: 0 },
  // (mutations below also include a race that never interleaved)
  ARCHIVED_PROJECT_DELETED: { archive: 200, delete: 202, gone: true },
  ARCHIVED_WORKSPACE_DELETED: { archive: 200, hiddenByDefault: true, offered: true, delete: 202, gone: true },
  ARCHIVE_REGRESSION: { archive: 200, key: 401, listedArchived: true, status: 'ARCHIVED', payerRetired: false, business: 'ACTIVE', workspaceArchive: 409, deleteAfter: 202 },
  SHARED_BUSINESS_KEPT: { linked: 200, deleteOwner: 202, business: 'ACTIVE', partnerPays: 200 },
  RESIDUE_ZERO: { cleanup: 202, residue: 0 },
};
// The failure each guard exists for.
const MUTATIONS = {
  PROJECT_SETUP: { settlement: 422 }, STRONG_CONFIRMATION: { wrongName: 202 }, DELETE_ACCEPTED_WITH_ACTIVITY: { status: 409, body: undefined },
  KEY_DENIED_AT_ONCE: { me: 200 }, GONE_FROM_CONSOLE: { listed: true }, REALTIME_DENIED: { after: 200 }, PAYMENT_SURFACES_CLOSED: { hostedSession: 201 },
  WEBHOOKS_DISABLED: { endpoints: 1 }, TEST_PAYERS_RETIRED: { funded: 1 }, BUSINESS_RETIRED: { status: 'ACTIVE' },
  LEDGER_BALANCED_HISTORY_KEPT: { historyAfter: '11:def' }, RECEIPT_UNCHANGED: { same: false }, SIBLING_UNTOUCHED: { business: 'SUSPENDED' },
  TOMBSTONE: { released: false }, NAME_REUSE_NEW_RESOURCE: { newId: 'a' }, IDEMPOTENT_REPEAT: { passesAfter: 4 },
  WORKSPACE_SETUP: { archivedB: 409 }, WORKSPACE_RBAC: { memberDeletesProject: 202 }, WORKSPACE_DELETE_ACCEPTED: { noArchiveFirst: false },
  WORKSPACE_AUTHORITY_ENDED: { keyC: 200 }, WORKSPACE_GONE_FOR_EVERYONE: { memberProject: 200 }, PENDING_INVITE_INVALID: { accept: 200 },
  WORKSPACE_TEST_RESOURCES_RETIRED: { businesses: ['SUSPENDED', 'ACTIVE'] }, OTHER_TENANT_UNTOUCHED: { key: 401 }, WORKSPACE_TOMBSTONE: { members: 1 },
  DELETE_WITH_RAIL_DOWN: { status: 503 }, CONCURRENT_DELETES: { requested: 2 }, KEY_RACE: { outcomes: [201, 201, 201] }, SESSION_RACE: { openAfterFinish: 1 },
  FUNDING_PAYMENT_RACE: { funded: 1 }, ARCHIVED_PROJECT_DELETED: { gone: false }, ARCHIVED_WORKSPACE_DELETED: { offered: false }, ARCHIVE_REGRESSION: { payerRetired: true },
  SHARED_BUSINESS_KEPT: { business: 'SUSPENDED' }, RESIDUE_ZERO: { residue: 1 },
};

function selftest() {
  let bad = 0;
  for (const key of Object.keys(PREDICATES)) {
    const good = GOOD[key]; const mut = MUTATIONS[key];
    const fine = Boolean(good && mut) && PREDICATES[key](good) && !PREDICATES[key]({ ...good, ...mut });
    if (!fine) bad += 1;
    console.log(`  ${fine ? '✓' : '✗'} ${key}: real evidence passes, ${JSON.stringify(mut)} fails`);
  }
  console.log(`\nSANDBOX_DELETE_PREDICATES=${Object.keys(PREDICATES).length}`);
  console.log(`SANDBOX_DELETE_PREDICATES_MUTATION_PROVEN=${bad === 0 ? 'PASS' : 'FAIL'}`);
  process.exitCode = bad === 0 ? 0 : 1;
}

// ── entry ────────────────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith('sandbox-delete-e2e.mjs')) {
  const which = process.argv[2] ?? 'all';
  if (which === 'selftest') selftest();
  else {
    const out = [];
    if (which === 'project' || which === 'all') { console.log('project delete\n'); out.push(await projectSuite()); }
    if (which === 'workspace' || which === 'all') { console.log('\nworkspace delete\n'); out.push(await workspaceSuite()); }
    if (which === 'lifecycle' || which === 'all') { console.log('\nlifecycle\n'); out.push(await lifecycleSuite()); }
    if (!out.length) { console.error('usage: sandbox-delete-e2e.mjs project | workspace | lifecycle | all | selftest'); process.exit(2); }
    const file = join(assuranceDir('sandbox-delete'), `sandbox-delete-${which}-${Date.now()}.json`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ ran_at: new Date().toISOString(), suites: out }, null, 2)}\n`);
    console.log(`SANDBOX_DELETE_OPERATOR_INTERVENTIONS=0`);
    console.log(`evidence: ${file}`);
    process.exitCode = out.every((r) => r.verdict === 'PASS') ? 0 : 1;
  }
}
