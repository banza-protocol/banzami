#!/usr/bin/env node
/**
 * SANDBOX-SELF-SERVICE-001 §51, §54, §55 — acceptance suites on the deployed
 * Public Sandbox.
 *
 *   scenarios  every scenario GET /v1/sandbox/scenarios returns, produced the
 *              way the testing guide says, judged on the response — plus the
 *              TEST_SCENARIO_* counters §51 names
 *   workbench  the webhook workbench, end to end (§54)
 *   refunds    refund acceptance with only the public Sandbox (§55)
 *   selftest   each representative predicate is shown to FAIL on mutated
 *              evidence (no network)
 *
 *   node tools/e2e/sandbox/acceptance-suites.mjs scenarios | workbench | refunds | all | selftest
 *
 * The catalogue is read from the deployed API, so a scenario added to it
 * without a check here fails the suite (SCENARIO_WITHOUT_CHECK). Nothing is
 * hard-coded PASS: every verdict is a predicate over what the API answered.
 * Product sign-in, no internal route, nothing secret printed, retired through
 * the product, residue measured.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import { assuranceDir } from '../lib/assurance-output.mjs';

const API = process.env.BZ_DEV_API ?? 'https://developer-api.banzami.com';
const GW = process.env.BZ_GATEWAY ?? 'https://sandbox-api.banzami.com';
const ORIGIN = 'https://developers.banzami.com';
const HOST = process.env.BZ_SANDBOX_HOST ?? 'root@217.160.9.248';
const SINK = 'https://sandbox-webhook.banzami.com/receive';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, every = 2000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(every); } };
const ssh = (cmd) => execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, cmd], { encoding: 'utf8', timeout: 60000 });
const sinkOpen = (run, behaviour = {}) => ssh(`docker exec banzami-webhook-sink wget -qO- --post-data='${JSON.stringify(behaviour)}' --header='content-type: application/json' 'http://127.0.0.1:8090/admin/configure?run=${run}'`);
const sinkGot = (run) => JSON.parse(ssh(`docker exec banzami-webhook-sink wget -qO- 'http://127.0.0.1:8090/admin/requests?run=${run}'`)).requests ?? [];

// ── plumbing ─────────────────────────────────────────────────────────────────

function consoleCaller(token) {
  let csrf = '';
  return async (path, method = 'GET', body) => {
    const headers = { cookie: `__Host-bz_dev_session=${token}` };
    if (method !== 'GET') {
      if (!csrf) csrf = (await (await fetch(`${API}/auth/me`, { headers })).json().catch(() => ({}))).csrf_token ?? '';
      Object.assign(headers, { 'content-type': 'application/json', origin: ORIGIN, 'x-csrf-token': csrf });
    }
    const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
}
function keyCaller(secret) {
  return async (path, method = 'GET', body, extra = {}) => {
    const headers = { authorization: `Bearer ${secret}`, ...extra };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const r = await fetch(GW + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    return { status: r.status, headers: Object.fromEntries(r.headers), body: await r.json().catch(() => null) };
  };
}
const SCOPES = ['identity:read', 'payment_sessions:write', 'payment_sessions:read', 'payment_links:read', 'payment_links:write', 'webhooks:write', 'webhooks:read',
  'refunds:write', 'refunds:read', 'sandbox:read', 'sandbox:write', 'wallet_accounts:create', 'wallet_accounts:read', 'application_settlements:write'];

async function publishedSdk() {
  const room = mkdtempSync(join(tmpdir(), 'banzami-acceptance-sdk-'));
  writeFileSync(join(room, 'package.json'), JSON.stringify({ name: 'acceptance', private: true, type: 'module' }));
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', '@banzami/sdk@latest'], { cwd: room, stdio: 'ignore', timeout: 180000 });
  const mod = await import(pathToFileURL(join(room, 'node_modules/@banzami/sdk/dist/cjs/index.js')).href).catch(() => import(pathToFileURL(join(room, 'node_modules/@banzami/sdk/dist/index.js')).href));
  return { mod, dispose: () => rmSync(room, { recursive: true, force: true }) };
}

/** A developer with a workspace; projects are added on demand and retired at the end. */
async function developer(label) {
  const { mintSession } = await import('../console/lib/mint.mjs');
  const stamp = Date.now().toString(36) + randomBytes(2).toString('hex');
  const like = `acc-${label}-${stamp}`;
  const call = consoleCaller(mintSession(`e2e-${like}@banzami-e2e.test`));
  const ws = (await call('/workspaces', 'POST', { name: like })).body?.id;
  const projects = [];
  const project = async (name, useCase, scopes = SCOPES) => {
    const p = (await call(`/workspaces/${ws}/projects`, 'POST', { name: `${like}-${name}` })).body?.id;
    projects.push(p);
    if (useCase) await call(`/projects/${p}/financial-setup`, 'POST', { use_case: useCase });
    const k = await call(`/projects/${p}/keys`, 'POST', { kind: 'SECRET', name: `${like}-${name}`, scopes });
    return { id: p, keyId: k.body?.id, api: keyCaller(k.body?.secret ?? ''), secretPrefix: String(k.body?.secret ?? '').slice(0, 11) };
  };
  const cleanup = async () => {
    const done = [];
    for (const p of projects) {
      done.push((await call(`/projects/${p}/sandbox/reset`, 'POST', { confirm: 'RESET' })).status);
      for (const e of (await call(`/projects/${p}/webhooks/endpoints`)).body?.endpoints ?? []) {
        const del = await call(`/projects/${p}/webhooks/endpoints/${e.id}`, 'DELETE');
        done.push(del.status === 409 ? (await call(`/projects/${p}/webhooks/endpoints/${e.id}`, 'PATCH', { active: false })).status : del.status);
      }
      for (const k of ((await call(`/projects/${p}/keys`)).body?.keys ?? []).filter((x) => x.status === 'ACTIVE')) done.push((await call(`/keys/${k.id}`, 'DELETE')).status);
      const pr = await call(`/projects/${p}`);
      done.push((await call(`/projects/${p}/archive`, 'POST', { name: pr.body?.name })).status);
    }
    const w = await call(`/workspaces/${ws}`);
    done.push((await call(`/workspaces/${ws}/archive`, 'POST', { name: w.body?.name })).status);
    return done;
  };
  return { call, ws, like, stamp, project, cleanup };
}

function residue(like) {
  const sql = `SELECT (SELECT count(*) FROM developer.dev_workspaces WHERE name LIKE '${like}%' AND status='ACTIVE')`
    + ` + (SELECT count(*) FROM developer.dev_projects WHERE name LIKE '${like}%' AND status='ACTIVE')`
    + ` + (SELECT count(*) FROM developer.dev_api_keys k JOIN developer.dev_projects p ON p.id=k.project_id WHERE p.name LIKE '${like}%' AND k.status='ACTIVE')`
    + ` + (SELECT count(*) FROM sandbox_test_payers t JOIN developer.dev_projects p ON p.id=t.project_id WHERE p.name LIKE '${like}%' AND t.retired_at IS NULL)`;
  try {
    return Number(ssh(`PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1); CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1); `
      + `PW=$(docker exec $CORE sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#'); `
      + `docker exec -e PGPASSWORD=$PW -e PGOPTIONS='-c default_transaction_read_only=on' $PG psql -U bl_app_runtime -d banzami_staging -At -c "${sql}"`).trim());
  } catch { return -1; }
}

const session = (api, ref, amount = 100000, extra = {}) => api('/v1/payment-sessions', 'POST',
  { purpose: 'ORDER', reference_type: 'PEDIDO', reference_id: ref, amount_minor: amount, currency: 'AOA', ...extra }, { 'Idempotency-Key': `acc_${ref}` });
const payer = (api, ref, body = {}) => api('/v1/sandbox/test-payers', 'POST', body, { 'Idempotency-Key': `acc_p_${ref}` });
const pay = (api, payerId, body, key) => api(`/v1/sandbox/test-payers/${payerId}/payments`, 'POST', body, key ? { 'Idempotency-Key': key } : {});
const deliveriesOf = async (api, eventId) => (await api(`/v1/webhooks/events/${eventId}/deliveries`)).body?.data ?? [];

// ── scenario predicates (pure: evidence → verdict) ───────────────────────────

export const PREDICATES = {
  PAYMENT_SUCCESS: (e) => e.pay === 200 && e.status === 'PAID',
  INSUFFICIENT_FUNDS: (e) => e.pay === 422 && e.code === 'INSUFFICIENT_FUNDS' && e.status === 'ACTIVE',
  PAYMENT_DECLINED: (e) => e.pay === 402 && e.code === 'PAYMENT_DECLINED' && e.simulated === true && e.status === 'ACTIVE',
  AMBIGUOUS_TIMEOUT: (e) => e.first === 503 && e.firstCode === 'SANDBOX_SIMULATED_TIMEOUT' && e.retry === 200 && e.status === 'PAID',
  PROVIDER_UNAVAILABLE: (e) => e.pay === 503 && e.code === 'PROVIDER_UNAVAILABLE' && Number(e.retryAfter) > 0 && e.simulated === true && e.status === 'ACTIVE',
  INVALID_PARAMETER: (e) => e.status === 400 && Boolean(e.code) && Boolean(e.requestId),
  INVALID_CURSOR: (e) => e.cursor === 400 && e.cursorCode === 'INVALID_PARAM' && e.limit === 400,
  INVALID_KEY: (e) => e.before === 200 && e.after === 401,
  MISSING_SCOPE: (e) => e.status === 403 && e.code === 'INSUFFICIENT_SCOPE',
  FINANCIAL_SETUP_NOT_READY: (e) => e.status === 403 && e.code === 'PAYMENTS_UNAVAILABLE',
  IDEMPOTENT_REPLAY: (e) => e.a === 201 && [200, 201].includes(e.b) && e.sameId === true,
  IDEMPOTENCY_PAYLOAD_CONFLICT: (e) => e.status === 409 && e.code === 'IDEMPOTENCY_KEY_REUSED',
  CONCURRENT_DUPLICATE: (e) => e.conflictSeen === true && e.distinctSessions === 1,
  WEBHOOK_SUCCESS: (e) => e.status === 202 && e.synthetic === true && e.verified === true,
  WEBHOOK_RETRY: (e) => e.firstAttemptStatus >= 500 && e.finalStatus === 'SUCCESS' && e.attempts >= 2,
  WEBHOOK_REPLAY: (e) => e.status === 201 && e.sameEventIdReceived === true && e.financialChange === false,
  WEBHOOK_SIGNATURE_INVALID: (e) => e.goodVerifies === true && e.wrongSecretRefused === true && e.alteredBodyRefused === true,
  REFUND_FULL: (e) => e.status === 201 && e.refundStatus === 'SUCCEEDED' && e.amount === e.paid,
  REFUND_PARTIAL: (e) => e.first === 201 && e.second === 201 && e.total <= e.paid,
  REFUND_CUMULATIVE_LIMIT: (e) => e.status === 422 && e.code === 'REFUND_EXCEEDS_CAPTURED',
  REFUND_NOT_ELIGIBLE: (e) => [404, 422].includes(e.otherProject) && [400, 404, 422].includes(e.unpaid) && e.moved === false,
  SETTLEMENT_SUCCESS: (e) => e.status === 201 && e.gross === e.fee + e.net && e.fee > 0,
  SETTLEMENT_REPLAY: (e) => [200, 201].includes(e.status) && e.sameId === true && e.balanceUnchanged === true,
  RECEIPT_VALID: (e) => e.status === 200 && e.exists === true,
  RECEIPT_NOT_FOUND: (e) => e.status === 404,
  REALTIME_STATUS: (e) => e.first === 'snapshot:ACTIVE' && e.paid === true && e.closed === true,
  RATE_LIMIT: (e) => e.limited > 0 && e.code === 'RATE_LIMITED' && Number(e.retryAfter) > 0,
  LIVE_FAIL_CLOSED: (e) => e.status === 401 && e.liveHost !== 200,
};

/** The §51 counters, each the verdict of the scenario(s) that produce it. */
export const COUNTERS = {
  TEST_SCENARIO_PAYMENT_SUCCESS: ['PAYMENT_SUCCESS'], TEST_SCENARIO_DECLINED: ['PAYMENT_DECLINED'],
  TEST_SCENARIO_INSUFFICIENT_FUNDS: ['INSUFFICIENT_FUNDS'], TEST_SCENARIO_TIMEOUT: ['AMBIGUOUS_TIMEOUT'],
  TEST_SCENARIO_PROVIDER_UNAVAILABLE: ['PROVIDER_UNAVAILABLE'], TEST_SCENARIO_INVALID_PARAM: ['INVALID_PARAMETER'],
  TEST_SCENARIO_INVALID_CURSOR: ['INVALID_CURSOR'], TEST_SCENARIO_INVALID_KEY: ['INVALID_KEY'],
  TEST_SCENARIO_MISSING_SCOPE: ['MISSING_SCOPE'], TEST_SCENARIO_IDEMPOTENT_REPLAY: ['IDEMPOTENT_REPLAY'],
  TEST_SCENARIO_IDEMPOTENCY_CONFLICT: ['IDEMPOTENCY_PAYLOAD_CONFLICT'], TEST_SCENARIO_CONCURRENT_DUPLICATE: ['CONCURRENT_DUPLICATE'],
  TEST_SCENARIO_WEBHOOK_RETRY: ['WEBHOOK_RETRY'], TEST_SCENARIO_REFUND: ['REFUND_FULL', 'REFUND_PARTIAL', 'REFUND_CUMULATIVE_LIMIT'],
  TEST_SCENARIO_SETTLEMENT: ['SETTLEMENT_SUCCESS', 'SETTLEMENT_REPLAY'], TEST_SCENARIO_RECEIPT_NOT_FOUND: ['RECEIPT_NOT_FOUND'],
  TEST_SCENARIO_RATE_LIMIT: ['RATE_LIMIT'], TEST_SCENARIO_LIVE_FAIL_CLOSED: ['LIVE_FAIL_CLOSED'],
};

async function streamStatus(sessionId, token, ms, onOpen) {
  const c = new AbortController(); const seen = []; let closed = false;
  const t = setTimeout(() => c.abort(), ms);
  try {
    const res = await fetch(`${GW}/v1/realtime/payment-sessions/${sessionId}`, { headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' }, signal: c.signal });
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; let opened = false;
    for (;;) {
      const { value, done } = await reader.read(); if (done) { closed = true; break; }
      buf += dec.decode(value, { stream: true }); let cut;
      while ((cut = buf.indexOf('\n\n')) >= 0) {
        const f = buf.slice(0, cut); buf = buf.slice(cut + 2);
        const ev = /^event: (.+)$/m.exec(f)?.[1]; const data = /^data: (.+)$/m.exec(f)?.[1];
        if (ev && data) { seen.push(`${ev}:${JSON.parse(data).status}`); if (!opened) { opened = true; onOpen?.(); } }
      }
    }
  } catch { /* aborted */ } finally { clearTimeout(t); }
  return { seen, closed };
}

// ── scenarios ────────────────────────────────────────────────────────────────

async function scenarios(sdk) {
  const results = {};
  const record = (id, evidence) => {
    const pass = PREDICATES[id] ? PREDICATES[id](evidence) : false;
    results[id] = { verdict: pass ? 'PASS' : 'FAIL', evidence };
    (pass ? console.log : console.error)(`  ${pass ? '✓' : '✗'} ${id} — ${JSON.stringify(evidence).slice(0, 220)}`);
  };
  const dev = await developer('scn');
  const s = dev.stamp;
  let catalogue = [];
  try {
    const A = await dev.project('a', 'STANDARD');
    const App = await dev.project('app', 'APPLICATION');
    const B = await dev.project('b', 'STANDARD');
    catalogue = ((await A.api('/v1/sandbox/scenarios')).body?.scenarios ?? []).map((x) => x.id);

    // The retry receiver answers its FIRST request 500. It subscribes to nothing
    // that happens before the test event, so that first request is the test event.
    const run = `scn${s}`;
    sinkOpen(run, { status: 500, fail_first: 1, then_status: 200 });
    const ep = await A.api('/v1/webhooks/endpoints', 'POST', { url: `${SINK}/${run}`, events: ['application_settlement.completed'] });
    const whSecret = ep.body?.secret;

    const tp = await payer(A.api, `${s}_1`);
    const T = tp.body?.id;
    const s1 = await session(A.api, `${s}_1`, 300000);
    const p1 = await pay(A.api, T, { payment_session_id: s1.body?.session_id }, `acc_${s}_pay1`);
    const r1 = await A.api(`/v1/payment-sessions/${s1.body?.session_id}`);
    record('PAYMENT_SUCCESS', { pay: p1.status, status: r1.body?.status });

    const broke = await payer(A.api, `${s}_0`, { initial_balance_minor: 0 });
    const s2 = await session(A.api, `${s}_2`, 50000);
    const p2 = await pay(A.api, broke.body?.id, { payment_session_id: s2.body?.session_id }, `acc_${s}_pay2`);
    record('INSUFFICIENT_FUNDS', { pay: p2.status, code: p2.body?.code, status: (await A.api(`/v1/payment-sessions/${s2.body?.session_id}`)).body?.status });

    const s3 = await session(A.api, `${s}_3`, 40000);
    const dec = await pay(A.api, T, { payment_session_id: s3.body?.session_id, simulate: 'DECLINED' });
    record('PAYMENT_DECLINED', { pay: dec.status, code: dec.body?.code, simulated: dec.body?.simulated, status: (await A.api(`/v1/payment-sessions/${s3.body?.session_id}`)).body?.status });
    const un = await pay(A.api, T, { payment_session_id: s3.body?.session_id, simulate: 'PROVIDER_UNAVAILABLE' });
    record('PROVIDER_UNAVAILABLE', { pay: un.status, code: un.body?.code, retryAfter: un.headers['retry-after'], simulated: un.body?.simulated, status: (await A.api(`/v1/payment-sessions/${s3.body?.session_id}`)).body?.status });
    const to1 = await pay(A.api, T, { payment_session_id: s3.body?.session_id, simulate: 'TIMEOUT' }, `acc_${s}_to`);
    const to2 = await pay(A.api, T, { payment_session_id: s3.body?.session_id }, `acc_${s}_to`);
    record('AMBIGUOUS_TIMEOUT', { first: to1.status, firstCode: to1.body?.code, retry: to2.status, status: (await A.api(`/v1/payment-sessions/${s3.body?.session_id}`)).body?.status });

    const bad = await A.api('/v1/payment-sessions', 'POST', { purpose: 'ORDER', reference_type: 'PEDIDO', reference_id: `${s}_bad`, amount_minor: 0, currency: 'AOA' }, { 'Idempotency-Key': `acc_${s}_bad` });
    record('INVALID_PARAMETER', { status: bad.status, code: bad.body?.code, requestId: bad.body?.request_id ?? bad.headers['x-request-id'] });
    const cur = await A.api('/v1/payment-links?cursor=abc');
    const lim = await A.api('/v1/payment-links?limit=500');
    record('INVALID_CURSOR', { cursor: cur.status, cursorCode: cur.body?.code, limit: lim.status });

    const narrow = await dev.call(`/projects/${A.id}/keys`, 'POST', { kind: 'SECRET', name: `${dev.like}-narrow`, scopes: ['identity:read'] });
    const nApi = keyCaller(narrow.body?.secret ?? '');
    const ms = await nApi('/v1/payment-sessions', 'POST', { purpose: 'ORDER', reference_type: 'PEDIDO', reference_id: `${s}_ms`, amount_minor: 1000, currency: 'AOA' });
    record('MISSING_SCOPE', { status: ms.status, code: ms.body?.code });
    const before = (await nApi('/v1/me')).status;
    await dev.call(`/keys/${narrow.body?.id}`, 'DELETE');
    record('INVALID_KEY', { before, after: (await nApi('/v1/me')).status });

    const U = await dev.project('unset', null);
    const ns = await U.api('/v1/payment-sessions', 'POST', { purpose: 'ORDER', reference_type: 'PEDIDO', reference_id: `${s}_ns`, amount_minor: 1000, currency: 'AOA' });
    record('FINANCIAL_SETUP_NOT_READY', { status: ns.status, code: ns.body?.code });

    const body = { purpose: 'ORDER', reference_type: 'PEDIDO', reference_id: `${s}_idem`, amount_minor: 7000, currency: 'AOA' };
    const i1 = await A.api('/v1/payment-sessions', 'POST', body, { 'Idempotency-Key': `acc_${s}_idem` });
    const i2 = await A.api('/v1/payment-sessions', 'POST', body, { 'Idempotency-Key': `acc_${s}_idem` });
    record('IDEMPOTENT_REPLAY', { a: i1.status, b: i2.status, sameId: Boolean(i1.body?.session_id) && i1.body?.session_id === i2.body?.session_id });
    const i3 = await A.api('/v1/payment-sessions', 'POST', { ...body, amount_minor: 7001 }, { 'Idempotency-Key': `acc_${s}_idem` });
    record('IDEMPOTENCY_PAYLOAD_CONFLICT', { status: i3.status, code: i3.body?.code });
    let conflictSeen = false; let distinct = 0;
    for (let i = 0; i < 6 && !conflictSeen; i += 1) {
      const b2 = { ...body, reference_id: `${s}_race${i}` };
      const both = await Promise.all([0, 1].map(() => A.api('/v1/payment-sessions', 'POST', b2, { 'Idempotency-Key': `acc_${s}_race${i}` })));
      conflictSeen = both.some((x) => x.status === 409 && x.body?.code === 'IDEMPOTENCY_CONFLICT');
      distinct = new Set(both.map((x) => x.body?.session_id).filter(Boolean)).size;
    }
    record('CONCURRENT_DUPLICATE', { conflictSeen, distinctSessions: distinct });

    // Webhooks: the endpoint fails its first request and succeeds after.
    const test = await A.api(`/v1/webhooks/endpoints/${ep.body?.id}/test`, 'POST');
    const retried = await until(async () => {
      const d = (await deliveriesOf(A.api, test.body?.event_id))[0];
      return d && d.status === 'SUCCESS' ? d : null;
    }, 150000, 5000);
    record('WEBHOOK_RETRY', { firstAttemptStatus: retried?.attempts?.[0]?.status_code ?? (sinkGot(run).length >= 2 ? 500 : 0), finalStatus: retried?.status, attempts: retried?.attempt_number ?? 0 });
    const got = sinkGot(run);
    const testReqs = got.filter((q) => q.raw_body.includes(test.body?.event_id ?? '#'));
    const verify = (raw, sig, secret) => { try { sdk.constructEvent(raw, sig, secret, { tolerance: 0 }); return true; } catch { return false; } };
    const good = testReqs.at(-1);
    record('WEBHOOK_SUCCESS', { status: test.status, synthetic: test.body?.synthetic, verified: Boolean(good) && verify(good.raw_body, good.headers?.['banza-signature'], whSecret) });
    record('WEBHOOK_SIGNATURE_INVALID', {
      goodVerifies: Boolean(good) && verify(good.raw_body, good.headers?.['banza-signature'], whSecret),
      wrongSecretRefused: Boolean(good) && !verify(good.raw_body, good.headers?.['banza-signature'], `whsec_${randomBytes(16).toString('hex')}`),
      alteredBodyRefused: Boolean(good) && !verify(good.raw_body.replace('synthetic', 'Synthetic'), good.headers?.['banza-signature'], whSecret),
    });
    const ledgerBefore = (await dev.call(`/projects/${A.id}/transactions`)).body?.transactions?.length ?? -1;
    const rp = await A.api(`/v1/webhooks/deliveries/${test.body?.delivery_id}/replay`, 'POST');
    const again = await until(() => sinkGot(run).filter((q) => q.raw_body.includes(test.body?.event_id ?? '#')).length > testReqs.length, 60000, 3000);
    const ledgerAfter = (await dev.call(`/projects/${A.id}/transactions`)).body?.transactions?.length ?? -2;
    record('WEBHOOK_REPLAY', { status: rp.status, sameEventIdReceived: Boolean(again), financialChange: ledgerBefore !== ledgerAfter });

    // Refunds of the 3 000 Kz payment.
    const src = r1.body?.refund_source ?? {};
    const rp1 = await A.api('/v1/refunds', 'POST', { ...src, amount_minor: 50000, currency: 'AOA', idempotency_key: `acc_${s}_rf1`, reason: 'parcial 1' });
    const rp2 = await A.api('/v1/refunds', 'POST', { ...src, amount_minor: 70000, currency: 'AOA', idempotency_key: `acc_${s}_rf2`, reason: 'parcial 2' });
    const listed = (await A.api(`/v1/refunds?source_id=${src.source_id}&limit=100`)).body?.data ?? [];
    record('REFUND_PARTIAL', { first: rp1.status, second: rp2.status, total: listed.reduce((a, x) => a + x.amount_minor, 0), paid: 300000 });
    const rest = await A.api('/v1/refunds', 'POST', { ...src, amount_minor: 180000, currency: 'AOA', idempotency_key: `acc_${s}_rf3`, reason: 'resto' });
    const over = await A.api('/v1/refunds', 'POST', { ...src, amount_minor: 1, currency: 'AOA', idempotency_key: `acc_${s}_rf4`, reason: 'excesso' });
    record('REFUND_CUMULATIVE_LIMIT', { status: over.status, code: over.body?.code });
    const sFull = await session(A.api, `${s}_full`, 90000);
    await pay(A.api, T, { payment_session_id: sFull.body?.session_id }, `acc_${s}_payfull`);
    const fullSrc = (await A.api(`/v1/payment-sessions/${sFull.body?.session_id}`)).body?.refund_source ?? {};
    const full = await A.api('/v1/refunds', 'POST', { ...fullSrc, amount_minor: 90000, currency: 'AOA', idempotency_key: `acc_${s}_full`, reason: 'total' });
    record('REFUND_FULL', { status: full.status, refundStatus: full.body?.status, amount: full.body?.amount_minor, paid: 90000, rest: rest.status });
    const balBefore = (await dev.call(`/projects/${A.id}/balances`)).body;
    const cross = await B.api('/v1/refunds', 'POST', { ...fullSrc, amount_minor: 1, currency: 'AOA', idempotency_key: `acc_${s}_x`, reason: 'outro projeto' });
    const sUnpaid = await session(A.api, `${s}_unpaid`, 1000);
    const unpaidSrc = (await A.api(`/v1/payment-sessions/${sUnpaid.body?.session_id}`)).body?.refund_source;
    const unpaid = await A.api('/v1/refunds', 'POST', { source_type: unpaidSrc?.source_type ?? 'WALLET_PAYMENT', source_id: unpaidSrc?.source_id ?? randomUUID(), amount_minor: 1, currency: 'AOA', idempotency_key: `acc_${s}_unpaid`, reason: 'não paga' });
    const balAfter = (await dev.call(`/projects/${A.id}/balances`)).body;
    record('REFUND_NOT_ELIGIBLE', { otherProject: cross.status, unpaid: unpaid.status, moved: JSON.stringify(balBefore) !== JSON.stringify(balAfter) });

    // Settlement on the APPLICATION project.
    const fsApp = (await dev.call(`/projects/${App.id}/financial-setup`)).body;
    const acct = await App.api('/v1/wallet-accounts', 'POST', { purpose: 'CAMPAIGN', reference_type: 'CAMPANHA', reference_id: `acc_${s}`, label: 'Campanha' }, { 'Idempotency-Key': `acc_${s}_acct` });
    const W = acct.body?.id ?? acct.body?.wallet_account_id;
    const sa = await App.api('/v1/payment-sessions', 'POST', { purpose: 'DONATION', reference_type: 'CAMPANHA', reference_id: `acc_${s}`, amount_minor: 150000, currency: 'AOA', wallet_account_id: W }, { 'Idempotency-Key': `acc_${s}_sa` });
    const donor = await payer(App.api, `${s}_donor`);
    const benef = await payer(App.api, `${s}_benef`, { initial_balance_minor: 0 });
    await pay(App.api, donor.body?.id, { payment_session_id: sa.body?.session_id }, `acc_${s}_dpay`);
    const settleBody = { source_account_id: W, beneficiary_banza_name: `@${benef.body?.handle}`, fee_destination_banza_name: fsApp?.readiness?.financial_identity?.handle, reference_id: `acc_${s}`, reason: 'Campanha encerrada', idempotency_key: `acc_${s}_settle` };
    const st1 = await App.api('/v1/application-settlements', 'POST', settleBody);
    record('SETTLEMENT_SUCCESS', { status: st1.status, gross: st1.body?.gross_amount_minor, fee: st1.body?.application_fee_minor, net: st1.body?.net_amount_minor, code: st1.body?.code });
    const bBefore = (await App.api(`/v1/sandbox/test-payers/${benef.body?.id}`)).body?.balance_minor;
    const st2 = await App.api('/v1/application-settlements', 'POST', settleBody);
    const bAfter = (await App.api(`/v1/sandbox/test-payers/${benef.body?.id}`)).body?.balance_minor;
    record('SETTLEMENT_REPLAY', { status: st2.status, sameId: Boolean(st1.body?.id) && st1.body?.id === st2.body?.id, balanceUnchanged: bBefore === bAfter });

    const ref = p1.body?.proof_reference ?? '';
    const pv = await fetch(`${GW}/v1/public/proofs/${ref}`);
    record('RECEIPT_VALID', { status: pv.status, exists: (await pv.json().catch(() => ({}))).exists });
    const alt = ref ? ref.slice(0, -1) + (ref.endsWith('A') ? 'B' : 'A') : 'BZM-NOPE';
    record('RECEIPT_NOT_FOUND', { status: (await fetch(`${GW}/v1/public/proofs/${alt}`)).status });

    const sr = await session(A.api, `${s}_rt`, 20000);
    let payNow; const opened = new Promise((r) => { payNow = r; });
    const watching = streamStatus(sr.body?.session_id, sr.body?.realtime?.token, 30000, () => payNow());
    await Promise.race([opened, sleep(8000)]);
    await pay(A.api, T, { payment_session_id: sr.body?.session_id }, `acc_${s}_rt`);
    const rt = await watching;
    record('REALTIME_STATUS', { first: rt.seen[0], paid: rt.seen.some((x) => x.endsWith(':PAID')), closed: rt.closed });

    const fakeLive = ['bz', 'live', 'sk', randomBytes(20).toString('hex')].join('_');
    const lv = await keyCaller(fakeLive)('/v1/me');
    const liveHost = await fetch('https://api.banzami.com/v1/me', { headers: { authorization: `Bearer ${fakeLive}` } }).then((r) => r.status).catch(() => 0);
    record('LIVE_FAIL_CLOSED', { status: lv.status, liveHost });

    // Last: it spends this client's allowance for a minute.
    const burst = await Promise.all(Array.from({ length: 75 }, () => A.api('/v1/me')));
    const hit = burst.find((x) => x.status === 429);
    record('RATE_LIMIT', { limited: burst.filter((x) => x.status === 429).length, code: hit?.body?.code, retryAfter: hit?.headers['retry-after'] });
    await sleep(61000);
  } catch (e) {
    console.error(`  ! aborted: ${String(e.stack ?? e).split('\n').slice(0, 2).join(' | ')}`);
  }
  const cleaned = await dev.cleanup();
  const left = residue(dev.like);
  const withoutCheck = catalogue.filter((id) => !(id in PREDICATES));
  const notRun = catalogue.filter((id) => !(id in results));
  const counters = Object.fromEntries(Object.entries(COUNTERS).map(([k, ids]) => [k, ids.every((id) => results[id]?.verdict === 'PASS') ? 'PASS' : 'FAIL']));
  const passed = Object.values(results).filter((r) => r.verdict === 'PASS').length;
  const verdict = catalogue.length > 0 && withoutCheck.length === 0 && notRun.length === 0 && passed === catalogue.length && left === 0 && Object.values(counters).every((v) => v === 'PASS');
  console.log('');
  for (const [k, v] of Object.entries(counters)) console.log(`${k}=${v}`);
  console.log(`SCENARIOS_IN_CATALOGUE=${catalogue.length}\nSCENARIO_WITHOUT_CHECK=${withoutCheck.length}${withoutCheck.length ? ` (${withoutCheck.join(',')})` : ''}\nSCENARIOS_PASSED=${passed}/${catalogue.length}`);
  console.log(`cleanup=${cleaned.join(',')} residue=${left}`);
  console.log(`SANDBOX_DETERMINISTIC_SCENARIOS=${verdict ? 'PASS' : 'FAIL'}`);
  return { name: 'scenarios', verdict: verdict ? 'PASS' : 'FAIL', results, counters, catalogue, residue: left };
}

// ── webhook workbench (§54) ──────────────────────────────────────────────────

async function workbench(sdk) {
  const steps = [];
  const mark = (title, ok, detail) => { steps.push({ title, verdict: ok ? 'PASS' : 'FAIL', detail }); (ok ? console.log : console.error)(`  ${ok ? '✓' : '✗'} ${title} — ${String(detail).slice(0, 220)}`); };
  const dev = await developer('whk');
  const s = dev.stamp;
  try {
    const A = await dev.project('a', 'STANDARD');
    const run = `whk${s}`;
    sinkOpen(run, { status: 500, fail_first: 1, then_status: 200 });
    const ep = await A.api('/v1/webhooks/endpoints', 'POST', { url: `${SINK}/${run}`, events: ['payment_session.paid'] });
    const E = ep.body?.id; let secret = ep.body?.secret;
    const read = await A.api(`/v1/webhooks/endpoints/${E}`);
    const listed = await dev.call(`/projects/${A.id}/webhooks/endpoints`);
    mark('Create endpoint; the secret is revealed once', ep.status === 201 && /^whsec_/.test(secret ?? '') && !JSON.stringify(read.body).includes(secret) && !JSON.stringify(listed.body).includes(secret), `create=${ep.status} get_has_secret=${JSON.stringify(read.body).includes(secret)}`);
    const verify = (q, sec) => { try { return sdk.constructEvent(q.raw_body, q.headers?.['banza-signature'], sec, { tolerance: 0 }); } catch { return null; } };

    const t1 = await A.api(`/v1/webhooks/endpoints/${E}/test`, 'POST');
    const firstReq = await until(() => sinkGot(run).find((q) => q.raw_body.includes(t1.body?.event_id)), 30000, 2000);
    mark('Synthetic test event with a valid signature', t1.status === 202 && t1.body?.synthetic === true && Boolean(firstReq && verify(firstReq, secret)), `test=${t1.status} verified=${Boolean(firstReq && verify(firstReq, secret))}`);
    const failedLog = await until(async () => { const d = (await deliveriesOf(A.api, t1.body?.event_id))[0]; return d && (d.attempts ?? []).some((a) => (a.status_code ?? 0) >= 500) ? d : null; }, 30000, 3000);
    mark('Failed endpoint: the attempt is in the delivery log', Boolean(failedLog), `status=${failedLog?.status} attempts=${JSON.stringify((failedLog?.attempts ?? []).map((a) => a.status_code))}`);
    const retried = await until(async () => { const d = (await deliveriesOf(A.api, t1.body?.event_id))[0]; return d?.status === 'SUCCESS' ? d : null; }, 150000, 5000);
    mark('Retry: delivered after the failure', Boolean(retried) && retried.attempt_number >= 2, `status=${retried?.status} attempts=${retried?.attempt_number}`);

    const tp = await payer(A.api, `${s}_w`);
    const sp = await session(A.api, `${s}_w`, 25000);
    await pay(A.api, tp.body?.id, { payment_session_id: sp.body?.session_id }, `acc_${s}_wpay`);
    const paidReq = await until(() => sinkGot(run).find((q) => verify(q, secret)?.type === 'payment_session.paid'), 60000, 3000);
    const paidEvent = paidReq ? verify(paidReq, secret) : null;
    mark('A real financial event arrives signed', Boolean(paidEvent) && paidEvent.synthetic !== true, `type=${paidEvent?.type}`);

    const evs = (await A.api('/v1/webhooks/events?limit=20')).body?.data ?? [];
    const paidEv = evs.find((e) => e.event_type === 'payment_session.paid');
    const paidDelivery = paidEv ? (await deliveriesOf(A.api, paidEv.id))[0] : null;
    const replayReal = paidDelivery ? await A.api(`/v1/webhooks/deliveries/${paidDelivery.id}/replay`, 'POST') : { status: 0, body: {} };
    const replayTest = await A.api(`/v1/webhooks/deliveries/${t1.body?.delivery_id}/replay`, 'POST');
    const twice = await until(() => sinkGot(run).filter((q) => q.raw_body.includes(t1.body?.event_id)).length >= 3, 60000, 3000);
    mark('Replay: a succeeded real delivery is not sent again; a test delivery is, with the same event id', replayReal.status === 409 && replayReal.body?.code === 'DELIVERY_ALREADY_SUCCEEDED' && replayTest.status === 201 && Boolean(twice), `real=${replayReal.status} test=${replayTest.status} same_id_received=${Boolean(twice)}`);
    // A duplicate-safe receiver: processes each event id once.
    const processed = new Set(); let duplicates = 0;
    for (const q of sinkGot(run)) { const ev = verify(q, secret); if (!ev) continue; if (processed.has(ev.id)) duplicates += 1; else processed.add(ev.id); }
    mark('Duplicate-safe receiver: repeated event ids are recognised by id', duplicates >= 1 && processed.size >= 2, `unique=${processed.size} duplicates_ignored=${duplicates}`);

    const rot = await A.api(`/v1/webhooks/endpoints/${E}/rotate-secret`, 'POST');
    const oldSecret = secret; secret = rot.body?.secret;
    const t2 = await A.api(`/v1/webhooks/endpoints/${E}/test`, 'POST');
    const afterRot = await until(() => sinkGot(run).find((q) => q.raw_body.includes(t2.body?.event_id ?? '#')), 30000, 2000);
    mark('Rotate secret: the old secret is rejected, the new one works', rot.status === 200 && Boolean(secret) && secret !== oldSecret && Boolean(afterRot) && !verify(afterRot, oldSecret) && Boolean(verify(afterRot, secret)), `rotate=${rot.status} old_refused=${Boolean(afterRot) && !verify(afterRot, oldSecret)} new_ok=${Boolean(afterRot && verify(afterRot, secret))}`);

    const off = await dev.call(`/projects/${A.id}/webhooks/endpoints/${E}`, 'PATCH', { active: false });
    const tOff = await A.api(`/v1/webhooks/endpoints/${E}/test`, 'POST');
    const countOff = sinkGot(run).length;
    const sp2 = await session(A.api, `${s}_w2`, 15000);
    await pay(A.api, tp.body?.id, { payment_session_id: sp2.body?.session_id }, `acc_${s}_wpay2`);
    await sleep(15000);
    mark('Disable: the endpoint receives nothing', off.status === 200 && tOff.status === 409 && tOff.body?.code === 'ENDPOINT_DISABLED' && sinkGot(run).length === countOff, `disable=${off.status} test=${tOff.status} received_while_off=${sinkGot(run).length - countOff}`);
    const on = await dev.call(`/projects/${A.id}/webhooks/endpoints/${E}`, 'PATCH', { active: true });
    const tOn = await A.api(`/v1/webhooks/endpoints/${E}/test`, 'POST');
    const gotOn = await until(() => sinkGot(run).find((q) => q.raw_body.includes(tOn.body?.event_id ?? '#')), 30000, 2000);
    mark('Re-enable: deliveries resume', on.status === 200 && tOn.status === 202 && Boolean(gotOn && verify(gotOn, secret)), `enable=${on.status} test=${tOn.status} delivered=${Boolean(gotOn)}`);
  } catch (e) {
    console.error(`  ! aborted: ${String(e.stack ?? e).split('\n').slice(0, 2).join(' | ')}`);
  }
  const cleaned = await dev.cleanup();
  const left = residue(dev.like);
  const ok = steps.length === 10 && steps.every((x) => x.verdict === 'PASS') && left === 0;
  console.log(`\ncleanup=${cleaned.join(',')} residue=${left}\nWEBHOOK_WORKBENCH_E2E=${ok ? 'PASS' : 'FAIL'} (${steps.filter((x) => x.verdict === 'PASS').length}/10)`);
  return { name: 'workbench', verdict: ok ? 'PASS' : 'FAIL', steps, residue: left };
}

// ── refunds (§55) ────────────────────────────────────────────────────────────

async function refunds(sdk) {
  const steps = [];
  const mark = (title, ok, detail) => { steps.push({ title, verdict: ok ? 'PASS' : 'FAIL', detail }); (ok ? console.log : console.error)(`  ${ok ? '✓' : '✗'} ${title} — ${String(detail).slice(0, 220)}`); };
  const dev = await developer('rfd');
  const s = dev.stamp;
  try {
    const A = await dev.project('a', 'STANDARD');
    const run = `rfd${s}`;
    sinkOpen(run);
    const ep = await A.api('/v1/webhooks/endpoints', 'POST', { url: `${SINK}/${run}`, events: ['payment_session.paid', 'refund.completed'] });
    const tp = await payer(A.api, `${s}_r`);
    const before = (await A.api(`/v1/sandbox/test-payers/${tp.body?.id}`)).body?.balance_minor;
    const sp = await session(A.api, `${s}_r`, 200000);
    const paid = await pay(A.api, tp.body?.id, { payment_session_id: sp.body?.session_id }, `acc_${s}_rpay`);
    const src = (await A.api(`/v1/payment-sessions/${sp.body?.session_id}`)).body?.refund_source ?? {};
    mark('A successful payment', paid.status === 200 && Boolean(src.source_id), `pay=${paid.status}`);
    const r1 = await A.api('/v1/refunds', 'POST', { ...src, amount_minor: 50000, currency: 'AOA', idempotency_key: `acc_${s}_r1`, reason: 'parcial 1' });
    mark('Partial refund', r1.status === 201 && r1.body?.status === 'SUCCEEDED', `${r1.status} ${r1.body?.status}`);
    const r2 = await A.api('/v1/refunds', 'POST', { ...src, amount_minor: 30000, currency: 'AOA', idempotency_key: `acc_${s}_r2`, reason: 'parcial 2' });
    mark('Second partial refund', r2.status === 201 && r2.body?.status === 'SUCCEEDED', `${r2.status}`);
    const listed = (await A.api(`/v1/refunds?source_id=${src.source_id}&limit=100`)).body?.data ?? [];
    const mid = (await A.api(`/v1/sandbox/test-payers/${tp.body?.id}`)).body?.balance_minor;
    mark('Cumulative accounting: listed refunds and the payer balance agree', listed.length === 2 && listed.reduce((a, x) => a + x.amount_minor, 0) === 80000 && mid === before - 200000 + 80000, `listed=${listed.length} sum=${listed.reduce((a, x) => a + x.amount_minor, 0)} payer ${before}→${mid}`);
    const r1again = await A.api('/v1/refunds', 'POST', { ...src, amount_minor: 50000, currency: 'AOA', idempotency_key: `acc_${s}_r1`, reason: 'parcial 1' });
    const afterReplay = (await A.api(`/v1/sandbox/test-payers/${tp.body?.id}`)).body?.balance_minor;
    mark('Idempotent replay returns the same refund and moves nothing', [200, 201].includes(r1again.status) && r1again.body?.id === r1.body?.id && afterReplay === mid, `${r1again.status} same=${r1again.body?.id === r1.body?.id}`);
    const r3 = await A.api('/v1/refunds', 'POST', { ...src, amount_minor: 120000, currency: 'AOA', idempotency_key: `acc_${s}_r3`, reason: 'resto' });
    const r4 = await A.api('/v1/refunds', 'POST', { ...src, amount_minor: 1, currency: 'AOA', idempotency_key: `acc_${s}_r4`, reason: 'excesso' });
    const end = (await A.api(`/v1/sandbox/test-payers/${tp.body?.id}`)).body?.balance_minor;
    mark('Full remaining refund, then nothing more', r3.status === 201 && r4.status === 422 && r4.body?.code === 'REFUND_EXCEEDS_CAPTURED' && end === before, `rest=${r3.status} over=${r4.status} payer back to ${end} (${before})`);
    const verified = await until(() => {
      const evs = sinkGot(run).map((q) => { try { return sdk.constructEvent(q.raw_body, q.headers?.['banza-signature'], ep.body?.secret, { tolerance: 0 }); } catch { return null; } }).filter(Boolean);
      const n = evs.filter((e) => e.type === 'refund.completed').length;
      return n >= 3 ? n : null;
    }, 90000, 3000);
    mark('refund.completed events, one per refund, signed', verified === 3, `refund.completed=${verified}`);
    const proof = await fetch(`${GW}/v1/public/proofs/${paid.body?.proof_reference}`);
    const pb = await proof.json().catch(() => ({}));
    mark('Receipt shows the reversal', proof.status === 200 && pb.status === 'REVERSED', `proof=${proof.status} status=${pb.status}`);
  } catch (e) {
    console.error(`  ! aborted: ${String(e.stack ?? e).split('\n').slice(0, 2).join(' | ')}`);
  }
  const cleaned = await dev.cleanup();
  const left = residue(dev.like);
  const ok = steps.length === 8 && steps.every((x) => x.verdict === 'PASS') && left === 0;
  console.log(`\ncleanup=${cleaned.join(',')} residue=${left}\nREFUND_PUBLIC_SANDBOX_E2E=${ok ? 'PASS' : 'FAIL'} (${steps.filter((x) => x.verdict === 'PASS').length}/8)`);
  return { name: 'refunds', verdict: ok ? 'PASS' : 'FAIL', steps, residue: left };
}

// ── selftest: predicates fail on mutated evidence ────────────────────────────

function selftest() {
  const cases = [
    ['PAYMENT_DECLINED', { pay: 402, code: 'PAYMENT_DECLINED', simulated: true, status: 'ACTIVE' }, { status: 'PAID' }],
    ['AMBIGUOUS_TIMEOUT', { first: 503, firstCode: 'SANDBOX_SIMULATED_TIMEOUT', retry: 200, status: 'PAID' }, { retry: 402 }],
    ['CONCURRENT_DUPLICATE', { conflictSeen: true, distinctSessions: 1 }, { distinctSessions: 2 }],
    ['REFUND_CUMULATIVE_LIMIT', { status: 422, code: 'REFUND_EXCEEDS_CAPTURED' }, { status: 201 }],
    ['WEBHOOK_SIGNATURE_INVALID', { goodVerifies: true, wrongSecretRefused: true, alteredBodyRefused: true }, { alteredBodyRefused: false }],
    ['SETTLEMENT_SUCCESS', { status: 201, gross: 100, fee: 2, net: 98 }, { net: 99 }],
    ['LIVE_FAIL_CLOSED', { status: 401, liveHost: 503 }, { liveHost: 200 }],
    ['RATE_LIMIT', { limited: 3, code: 'RATE_LIMITED', retryAfter: '30' }, { retryAfter: undefined }],
  ];
  let bad = 0;
  for (const [id, good, mutation] of cases) {
    const okGood = PREDICATES[id](good); const okMut = PREDICATES[id]({ ...good, ...mutation });
    const fine = okGood && !okMut;
    if (!fine) bad += 1;
    console.log(`  ${fine ? '✓' : '✗'} ${id}: real evidence passes, ${JSON.stringify(mutation)} fails`);
  }
  const missing = Object.values(COUNTERS).flat().filter((id) => !(id in PREDICATES));
  console.log(`\nSCENARIO_PREDICATES_MUTATION_PROVEN=${bad === 0 && missing.length === 0 ? 'PASS' : 'FAIL'}`);
  process.exitCode = bad === 0 && missing.length === 0 ? 0 : 1;
}

// ── entry ────────────────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith('acceptance-suites.mjs')) {
  const which = process.argv[2] ?? 'all';
  if (which === 'selftest') selftest();
  else {
    const { mod, dispose } = await publishedSdk();
    const out = [];
    try {
      if (which === 'scenarios' || which === 'all') { console.log('scenarios\n'); out.push(await scenarios(mod)); }
      if (which === 'workbench' || which === 'all') { console.log('\nwebhook workbench\n'); out.push(await workbench(mod)); }
      if (which === 'refunds' || which === 'all') { console.log('\nrefunds\n'); out.push(await refunds(mod)); }
    } finally { dispose(); }
    const file = join(assuranceDir('sandbox-self-service'), `acceptance-${which}-${Date.now()}.json`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ ran_at: new Date().toISOString(), suites: out }, null, 2)}\n`);
    console.log(`evidence: ${file}`);
    process.exitCode = out.length && out.every((r) => r.verdict === 'PASS') ? 0 : 1;
  }
}
