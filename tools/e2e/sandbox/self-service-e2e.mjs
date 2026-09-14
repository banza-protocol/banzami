#!/usr/bin/env node
/**
 * SANDBOX-SELF-SERVICE-001 — two developer journeys against the deployed Public
 * Sandbox, with no Banzami operator anywhere in them.
 *
 *   fresh        24 steps: a developer who has never used Banzami signs up,
 *                gets a test Business, a key, a webhook, a payment paid by a
 *                test payer and watched in real time, a receipt, refunds,
 *                simulated rail outcomes, the API Explorer and a reset.
 *   application  18 steps: an application (use case APPLICATION) collects
 *                into a campaign account, settles with its fee, shares its
 *                test Business with a second Project, and resets.
 *
 *   node tools/e2e/sandbox/self-service-e2e.mjs fresh | application | all
 *
 * Rules (the same the documentation harnesses keep):
 *   · sign-in through the product (request-otp → the message sent → verify);
 *     no fixture route, no internal key, no database write, no operator step;
 *   · every step ends PASS / FAIL / NOT_RUN and the summary is derived;
 *   · no key, token, PIN or signing secret is printed or written to evidence;
 *   · what the run creates is retired through the product (reset, key revoke,
 *     endpoint disable, project and workspace archive) and residue is measured.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import { assuranceDir } from '../lib/assurance-output.mjs';
import { mintSession } from '../console/lib/mint.mjs';

const API = process.env.BZ_DEV_API ?? 'https://developer-api.banzami.com';
const GW = process.env.BZ_GATEWAY ?? 'https://sandbox-api.banzami.com';
const ORIGIN = process.env.BZ_CONSOLE ?? 'https://developers.banzami.com';
const HOST = process.env.BZ_SANDBOX_HOST ?? 'root@217.160.9.248';
const SINK = process.env.BZ_WEBHOOK_SINK ?? 'https://sandbox-webhook.banzami.com/receive';

export const FRESH = [
  'Sign in with an email code', 'Create a workspace', 'Create a project',
  'Financial Setup starts unconfigured and self-service', 'Set up the Sandbox by use case (STANDARD)',
  'Synthetic Business: unverified, classified and priced by policy', 'Create a secret key',
  'GET /v1/me is SANDBOX', 'GET /v1/financial-setup is ready', 'Register a webhook endpoint',
  'Webhook test event arrives, synthetic, signature valid', 'Create a payment session with a realtime token',
  'Realtime refusals: token in URL, no token, wrong session', 'Realtime snapshot is ACTIVE',
  'Create a test payer', 'Fund it, idempotently', 'Pay by QR while the stream watches it turn PAID',
  'The session reads PAID with a refund source', 'payment_session.paid webhook arrives, signature valid',
  'Receipt verifies publicly', 'Refunds: partial, the rest, then refused', 'Simulations: DECLINED, then TIMEOUT recovered by retry',
  'API Explorer runs a request with no key in the browser, logged as the Explorer', 'Reset keeps history; cleanup leaves no residue',
];
export const APPLICATION = [
  'Sign in with an email code', 'Create a workspace and project A', 'Set up the Sandbox by use case (APPLICATION)',
  'Classification APPLICATION, reference pricing, unverified', 'Create a secret key with settlement scope',
  'The own Business is an eligible fee destination', 'Register a webhook endpoint for settlements',
  'Create a campaign account', 'Create a session into the campaign account', 'A test payer pays it',
  'Settle the campaign: gross = fee + net', 'Replay the settlement: the same one', 'application_settlement.completed arrives',
  'Share the test Business by code', 'Project B connects with the code', 'Project B takes a payment into the shared Business',
  'Project B resets only its own payers; A keeps its balance', 'Cleanup leaves no residue',
];

const VERDICTS = new Set(['PASS', 'FAIL', 'NOT_RUN']);
function journey(name, rubric) {
  const steps = rubric.map((title, i) => ({ n: i + 1, title, verdict: 'NOT_RUN', detail: '' }));
  const mark = (n, ok, detail = '') => {
    const verdict = ok === 'NOT_RUN' ? 'NOT_RUN' : ok ? 'PASS' : 'FAIL';
    if (!VERDICTS.has(verdict)) throw new Error(verdict);
    steps[n - 1] = { ...steps[n - 1], verdict, detail: String(detail).slice(0, 240) };
    const icon = verdict === 'PASS' ? '✓' : verdict === 'NOT_RUN' ? '·' : '✗';
    (verdict === 'FAIL' ? console.error : console.log)(`  ${icon} [${String(n).padStart(2, '0')}] ${steps[n - 1].title}${detail ? ` — ${steps[n - 1].detail}` : ''}`);
    return verdict === 'PASS';
  };
  return { name, steps, mark };
}
export function summarise(steps) {
  const passed = steps.filter((s) => s.verdict === 'PASS').length;
  return { passed, total: steps.length, verdict: passed === steps.length ? 'PASS' : 'FAIL' };
}

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
    return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) };
  };
}
const ssh = (cmd) => execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, cmd], { encoding: 'utf8', timeout: 60000 });
const sinkConfigure = (run) => ssh(`docker exec banzami-webhook-sink wget -qO- --post-data='{}' --header='content-type: application/json' 'http://127.0.0.1:8090/admin/configure?run=${run}'`);
const sinkRequests = (run) => JSON.parse(ssh(`docker exec banzami-webhook-sink wget -qO- 'http://127.0.0.1:8090/admin/requests?run=${run}'`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** banza-signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "t.raw")>. */
export function signatureValid(raw, header, secret) {
  const parts = Object.fromEntries(String(header ?? '').split(',').map((p) => p.split('=')));
  if (!parts.t || !parts.v1) return false;
  const want = createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
  return want === parts.v1;
}
async function waitForDelivery(run, pattern, tries = 30) {
  for (let i = 0; i < tries; i += 1) {
    const got = sinkRequests(run);
    const hit = (got.requests ?? []).find((r) => pattern.test(r.raw_body ?? ''));
    if (hit) return hit;
    await sleep(2000);
  }
  return null;
}

/** Read an SSE stream with the token in the header; resolves with the events seen. */
function watchStream(sessionId, token, ms = 60000) {
  const controller = new AbortController();
  const events = [];
  const done = (async () => {
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(`${GW}/v1/realtime/payment-sessions/${sessionId}`, {
        headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' }, signal: controller.signal,
      });
      if (!res.ok || !res.body) return { status: res.status, events };
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
        let cut;
        while ((cut = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, cut); buf = buf.slice(cut + 2);
          const ev = /^event: (.+)$/m.exec(frame)?.[1];
          const data = /^data: (.+)$/m.exec(frame)?.[1];
          if (ev && data) events.push({ event: ev, status: JSON.parse(data).status, at: Date.now() });
          else if (frame.startsWith(':')) events.push({ event: 'heartbeat', at: Date.now() });
        }
      }
      return { status: res.status, events, closed: true };
    } catch (e) {
      return { status: 0, events, error: e.name };
    } finally {
      clearTimeout(timer);
    }
  })();
  return { done, stop: () => controller.abort() };
}

function measureResidue(like) {
  const sql = `SELECT (SELECT count(*) FROM developer.dev_workspaces WHERE name LIKE '${like}%' AND status='ACTIVE')`
    + ` + (SELECT count(*) FROM developer.dev_projects WHERE name LIKE '${like}%' AND status='ACTIVE')`
    + ` + (SELECT count(*) FROM developer.dev_api_keys k JOIN developer.dev_projects p ON p.id=k.project_id WHERE p.name LIKE '${like}%' AND k.status='ACTIVE')`
    + ` + (SELECT count(*) FROM sandbox_test_payers t JOIN developer.dev_projects p ON p.id=t.project_id WHERE p.name LIKE '${like}%' AND t.retired_at IS NULL)`;
  try {
    const out = ssh(`PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1); CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1); `
      + `PW=$(cat /root/.banzami/operator_db_url | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#'); `
      + `docker exec -e PGPASSWORD=$PW -e PGOPTIONS='-c default_transaction_read_only=on' $PG psql -U bl_app_runtime -d banzami_staging -At -c "${sql}"`);
    return Number(out.trim());
  } catch { return -1; }
}

async function cleanup(call, projects, workspace) {
  const done = [];
  for (const p of projects) {
    const eps = (await call(`/projects/${p}/webhooks/endpoints`)).body?.endpoints ?? [];
    for (const e of eps) {
      const del = await call(`/projects/${p}/webhooks/endpoints/${e.id}`, 'DELETE');
      done.push(del.status === 409 ? (await call(`/projects/${p}/webhooks/endpoints/${e.id}`, 'PATCH', { active: false })).status : del.status);
    }
    for (const k of ((await call(`/projects/${p}/keys`)).body?.keys ?? []).filter((x) => x.status === 'ACTIVE')) done.push((await call(`/keys/${k.id}`, 'DELETE')).status);
    const pr = await call(`/projects/${p}`);
    done.push((await call(`/projects/${p}/archive`, 'POST', { name: pr.body?.name })).status);
  }
  if (workspace) {
    const ws = await call(`/workspaces/${workspace}`);
    done.push((await call(`/workspaces/${workspace}/archive`, 'POST', { name: ws.body?.name })).status);
  }
  return done;
}

const SCOPES = ['identity:read', 'payment_sessions:write', 'payment_sessions:read', 'webhooks:write', 'webhooks:read',
  'refunds:write', 'refunds:read', 'sandbox:read', 'sandbox:write'];

// ── the fresh developer ──────────────────────────────────────────────────────

async function fresh() {
  const j = journey('fresh', FRESH);
  const { mark } = j;
  const stamp = Date.now().toString(36);
  const like = `ss-fresh-${stamp}`;
  const email = `e2e-ss-fresh-${stamp}@banzami-e2e.test`;
  let token;
  try { token = mintSession(email); mark(1, true, 'product sign-in'); } catch (e) { mark(1, false, e.message); return j; }
  const call = consoleCaller(token);
  const ws = await call('/workspaces', 'POST', { name: like });
  mark(2, ws.status === 201, ws.status);
  const pr = await call(`/workspaces/${ws.body?.id}/projects`, 'POST', { name: like });
  mark(3, pr.status === 201, pr.status);
  const P = pr.body?.id;
  try {
    const fs0 = await call(`/projects/${P}/financial-setup`);
    mark(4, fs0.body?.state === 'UNCONFIGURED' && fs0.body?.self_service === true, `${fs0.body?.state} self_service=${fs0.body?.self_service}`);
    const fs1 = await call(`/projects/${P}/financial-setup`, 'POST', { use_case: 'STANDARD' });
    mark(5, fs1.status === 200 && ['READY', 'SEALED'].includes(fs1.body?.state), `${fs1.status} ${fs1.body?.state}`);
    const fs2 = (await call(`/projects/${P}/financial-setup`)).body;
    const b = fs2?.onboarding?.business;
    mark(6, b?.synthetic === true && b?.verified === false && b?.kyb_status === 'SANDBOX_SYNTHETIC' && fs2?.readiness?.pricing?.profile === 'sandbox-default' && fs2?.sandbox_use_case === 'STANDARD',
      `kyb=${b?.kyb_status} verified=${b?.verified} profile=${fs2?.readiness?.pricing?.profile}`);
    const key = await call(`/projects/${P}/keys`, 'POST', { kind: 'SECRET', name: like, scopes: SCOPES });
    const secret = key.body?.secret;
    mark(7, Boolean(secret) && String(secret).startsWith('bz_test_sk_'), key.status);
    const api = keyCaller(secret);
    const me = await api('/v1/me');
    mark(8, me.status === 200 && me.body?.environment === 'SANDBOX', me.status);
    const fsKey = await api('/v1/financial-setup');
    mark(9, fsKey.status === 200 && ['READY', 'SEALED'].includes(fsKey.body?.financial_setup?.state ?? fsKey.body?.state), fsKey.status);

    const run = `ssf${stamp}${randomUUID().slice(0, 6)}`;
    sinkConfigure(run);
    const ep = await api('/v1/webhooks/endpoints', 'POST', { url: `${SINK}/${run}`, events: ['payment_session.paid', 'refund.completed'] });
    const whSecret = ep.body?.secret;
    mark(10, ep.status === 201 && Boolean(whSecret), ep.status);
    const te = await api(`/v1/webhooks/endpoints/${ep.body?.id}/test`, 'POST');
    const testHit = te.status === 202 ? await waitForDelivery(run, /webhook\.test/) : null;
    mark(11, te.status === 202 && te.body?.synthetic === true && testHit && signatureValid(testHit.raw_body, testHit.headers?.['banza-signature'], whSecret),
      `test ${te.status}; delivered=${Boolean(testHit)}`);

    const sess = await api('/v1/payment-sessions', 'POST', { purpose: 'ORDER', reference_type: 'PEDIDO', reference_id: `ord_${stamp}`, amount_minor: 250000, currency: 'AOA' }, { 'Idempotency-Key': `ss_${stamp}_s1` });
    const S = sess.body?.session_id;
    const rt = sess.body?.realtime;
    mark(12, sess.status === 201 && rt?.token?.startsWith('bzst_') && rt?.path === `/v1/realtime/payment-sessions/${S}`, `${sess.status} realtime=${Boolean(rt)}`);
    const inUrl = await fetch(`${GW}/v1/realtime/payment-sessions/${S}?token=${encodeURIComponent(rt?.token ?? '')}`);
    const none = await fetch(`${GW}/v1/realtime/payment-sessions/${S}`);
    const other = await api('/v1/payment-sessions', 'POST', { purpose: 'ORDER', reference_type: 'PEDIDO', reference_id: `ord_${stamp}_b`, amount_minor: 100000, currency: 'AOA' }, { 'Idempotency-Key': `ss_${stamp}_s2` });
    const wrong = await fetch(`${GW}/v1/realtime/payment-sessions/${other.body?.session_id}`, { headers: { authorization: `Bearer ${rt?.token}` } });
    mark(13, inUrl.status === 400 && none.status === 401 && wrong.status === 403, `url=${inUrl.status} none=${none.status} wrong=${wrong.status}`);
    const snap = await fetch(`${GW}/v1/realtime/payment-sessions/${S}`, { headers: { authorization: `Bearer ${rt?.token}`, accept: 'application/json' } });
    const snapBody = await snap.json().catch(() => ({}));
    mark(14, snap.status === 200 && snapBody.status === 'ACTIVE' && !('merchant_id' in snapBody), `${snap.status} ${snapBody.status}`);

    const payer = await api('/v1/sandbox/test-payers', 'POST', { label: 'Fresh journey payer' }, { 'Idempotency-Key': `ss_${stamp}_p1` });
    const T = payer.body?.id;
    mark(15, payer.status === 201 && !('pin' in (payer.body ?? {})) && payer.body?.balance_minor === 1000000, `${payer.status} balance=${payer.body?.balance_minor} pin_returned=${'pin' in (payer.body ?? {})}`);
    const f1 = await api(`/v1/sandbox/test-payers/${T}/fund`, 'POST', { amount_minor: 500000 }, { 'Idempotency-Key': `ss_${stamp}_f1` });
    const f2 = await api(`/v1/sandbox/test-payers/${T}/fund`, 'POST', { amount_minor: 500000 }, { 'Idempotency-Key': `ss_${stamp}_f1` });
    const after = await api(`/v1/sandbox/test-payers/${T}`);
    mark(16, f1.status === 200 && f2.status === 200 && after.body?.balance_minor === 1500000, `fund=${f1.status}/${f2.status} balance=${after.body?.balance_minor}`);

    const watch = watchStream(S, rt?.token, 45000);
    await sleep(1500);
    const t0 = Date.now();
    const pay = await api(`/v1/sandbox/test-payers/${T}/payments`, 'POST', { payment_session_id: S, via: 'QR' }, { 'Idempotency-Key': `ss_${stamp}_pay1` });
    const seen = await watch.done;
    const paidEvent = seen.events.find((e) => e.status === 'PAID');
    const latency = paidEvent ? paidEvent.at - t0 : null;
    mark(17, pay.status === 200 && pay.body?.status === 'PAID' && seen.events[0]?.event === 'snapshot' && seen.events[0]?.status === 'ACTIVE' && Boolean(paidEvent) && seen.closed === true,
      `pay=${pay.status} events=${seen.events.map((e) => `${e.event}:${e.status ?? ''}`).join(',')} paid_after_ms=${latency}`);
    const read = await api(`/v1/payment-sessions/${S}`);
    mark(18, read.body?.status === 'PAID' && Boolean(read.body?.refund_source), read.body?.status);
    const paidHit = await waitForDelivery(run, /payment_session\.paid/);
    mark(19, paidHit && signatureValid(paidHit.raw_body, paidHit.headers?.['banza-signature'], whSecret), `delivered=${Boolean(paidHit)}`);
    const proof = pay.body?.proof_reference ? await fetch(`${GW}/v1/public/proofs/${pay.body.proof_reference}`) : null;
    const proofBody = proof ? await proof.json().catch(() => ({})) : {};
    mark(20, proof?.status === 200 && proofBody.exists === true, `proof=${proof?.status ?? 'none'} ${proofBody.status ?? ''}`);

    const src = read.body?.refund_source ?? {};
    const r1 = await api('/v1/refunds', 'POST', { ...src, amount_minor: 100000, currency: 'AOA', idempotency_key: `ss_${stamp}_r1`, reason: 'partial' });
    const r2 = await api('/v1/refunds', 'POST', { ...src, amount_minor: 150000, currency: 'AOA', idempotency_key: `ss_${stamp}_r2`, reason: 'rest' });
    const r3 = await api('/v1/refunds', 'POST', { ...src, amount_minor: 1, currency: 'AOA', idempotency_key: `ss_${stamp}_r3`, reason: 'excess' });
    mark(21, r1.status === 201 && r2.status === 201 && r3.status === 422, `${r1.status}/${r2.status}/${r3.status} ${r3.body?.code ?? ''}`);

    const s3 = await api('/v1/payment-sessions', 'POST', { purpose: 'ORDER', reference_type: 'PEDIDO', reference_id: `ord_${stamp}_c`, amount_minor: 50000, currency: 'AOA' }, { 'Idempotency-Key': `ss_${stamp}_s3` });
    const dec = await api(`/v1/sandbox/test-payers/${T}/payments`, 'POST', { payment_session_id: s3.body?.session_id, simulate: 'DECLINED' });
    const stillActive = (await api(`/v1/payment-sessions/${s3.body?.session_id}`)).body?.status;
    const to = await api(`/v1/sandbox/test-payers/${T}/payments`, 'POST', { payment_session_id: s3.body?.session_id, simulate: 'TIMEOUT' }, { 'Idempotency-Key': `ss_${stamp}_to` });
    const retry = await api(`/v1/sandbox/test-payers/${T}/payments`, 'POST', { payment_session_id: s3.body?.session_id, simulate: 'TIMEOUT' }, { 'Idempotency-Key': `ss_${stamp}_to` });
    const s3read = (await api(`/v1/payment-sessions/${s3.body?.session_id}`)).body?.status;
    mark(22, dec.status === 402 && dec.body?.simulated === true && stillActive === 'ACTIVE' && to.status === 503 && to.body?.code === 'SANDBOX_SIMULATED_TIMEOUT' && retry.status === 200 && s3read === 'PAID',
      `declined=${dec.status} active=${stillActive} timeout=${to.status} retry=${retry.status} final=${s3read}`);

    const ex = await call(`/projects/${P}/explorer/requests`, 'POST', { operation_id: 'getMe' });
    const exText = JSON.stringify(ex.body ?? {});
    await sleep(2000);
    const logs = await call(`/projects/${P}/logs?source=API_EXPLORER&limit=20`);
    const logged = (logs.body?.logs ?? []).some((l) => l.path === '/v1/me' && l.source === 'API_EXPLORER' && l.request_id === ex.body?.request_id);
    const keysAfter = (await call(`/projects/${P}/keys`)).body?.keys ?? [];
    mark(23, ex.status === 200 && ex.body?.status === 200 && !/bz_test_sk_/.test(exText) && logged && keysAfter.length === 1,
      `explorer=${ex.status}/${ex.body?.status} logged=${logged} listed_keys=${keysAfter.length}`);

    const reset = await call(`/projects/${P}/sandbox/reset`, 'POST', { confirm: 'RESET' });
    const payersAfter = await api('/v1/sandbox/test-payers');
    const txAfter = (await call(`/projects/${P}/transactions`)).body?.transactions ?? [];
    const cleaned = await cleanup(call, [P], ws.body?.id);
    const residue = measureResidue(like);
    mark(24, reset.status === 200 && reset.body?.business_reset === true && (payersAfter.body?.data ?? []).length === 0 && txAfter.length > 0 && residue === 0,
      `reset=${reset.status} payers_after=${(payersAfter.body?.data ?? []).length} history=${txAfter.length} cleanup=${cleaned.join(',')} residue=${residue}`);
  } catch (e) {
    console.error(`  ! aborted: ${String(e.stack ?? e).split('\n')[0]}`);
    try { await cleanup(call, [P], ws.body?.id); } catch { /* best effort */ }
  }
  return j;
}

// ── the application ──────────────────────────────────────────────────────────

async function application() {
  const j = journey('application', APPLICATION);
  const { mark } = j;
  const stamp = Date.now().toString(36);
  const like = `ss-app-${stamp}`;
  const email = `e2e-ss-app-${stamp}@banzami-e2e.test`;
  let token;
  try { token = mintSession(email); mark(1, true, 'product sign-in'); } catch (e) { mark(1, false, e.message); return j; }
  const call = consoleCaller(token);
  const ws = await call('/workspaces', 'POST', { name: like });
  const pa = await call(`/workspaces/${ws.body?.id}/projects`, 'POST', { name: `${like}-a` });
  mark(2, ws.status === 201 && pa.status === 201, `${ws.status}/${pa.status}`);
  const A = pa.body?.id;
  let B = null;
  try {
    const fs1 = await call(`/projects/${A}/financial-setup`, 'POST', { use_case: 'APPLICATION' });
    mark(3, fs1.status === 200 && ['READY', 'SEALED'].includes(fs1.body?.state), `${fs1.status} ${fs1.body?.state}`);
    const fs2 = (await call(`/projects/${A}/financial-setup`)).body;
    mark(4, fs2?.readiness?.pricing?.profile === 'sandbox-reference' && fs2?.onboarding?.business?.verified === false && fs2?.readiness?.fee_destination?.type_allowed === true,
      `profile=${fs2?.readiness?.pricing?.profile} type_allowed=${fs2?.readiness?.fee_destination?.type_allowed}`);
    const key = await call(`/projects/${A}/keys`, 'POST', { kind: 'SECRET', name: `${like}-a`, scopes: [...SCOPES, 'wallet_accounts:create', 'wallet_accounts:read', 'application_settlements:write'] });
    const api = keyCaller(key.body?.secret);
    mark(5, Boolean(key.body?.secret), key.status);
    const handle = fs2?.readiness?.financial_identity?.handle;
    const ready = await api(`/v1/financial-setup?fee_destination=${encodeURIComponent(handle ?? '')}`);
    const fd = ready.body?.readiness?.fee_destination ?? ready.body?.fee_destination;
    mark(6, ready.status === 200 && fd?.eligible === true, `handle=${handle} eligible=${fd?.eligible} blocker=${fd?.blocker}`);
    const run = `ssa${stamp}${randomUUID().slice(0, 6)}`;
    sinkConfigure(run);
    const ep = await api('/v1/webhooks/endpoints', 'POST', { url: `${SINK}/${run}`, events: ['application_settlement.completed', 'payment_session.paid'] });
    mark(7, ep.status === 201, ep.status);
    const acct = await api('/v1/wallet-accounts', 'POST', { purpose: 'CAMPAIGN', reference_type: 'CAMPANHA', reference_id: `camp_${stamp}`, label: 'Campanha de teste' }, { 'Idempotency-Key': `ssa_${stamp}_acct` });
    const W = acct.body?.id ?? acct.body?.wallet_account_id;
    mark(8, acct.status === 201 && Boolean(W), acct.status);
    const sess = await api('/v1/payment-sessions', 'POST', { purpose: 'DONATION', reference_type: 'CAMPANHA', reference_id: `camp_${stamp}`, amount_minor: 250000, currency: 'AOA', wallet_account_id: W }, { 'Idempotency-Key': `ssa_${stamp}_s1` });
    mark(9, sess.status === 201, sess.status);
    const payer = await api('/v1/sandbox/test-payers', 'POST', { label: 'Doador de teste' }, { 'Idempotency-Key': `ssa_${stamp}_p` });
    const pay = await api(`/v1/sandbox/test-payers/${payer.body?.id}/payments`, 'POST', { payment_session_id: sess.body?.session_id, via: 'LINK' }, { 'Idempotency-Key': `ssa_${stamp}_pay` });
    mark(10, pay.status === 200 && pay.body?.status === 'PAID', `${pay.status}`);
    const settleBody = { source_account_id: W, beneficiary_banza_name: `@${payer.body?.handle}`, fee_destination_banza_name: handle, reference_id: `camp_${stamp}`, reason: 'Campanha encerrada', idempotency_key: `ssa_${stamp}_settle` };
    const st = await api('/v1/application-settlements', 'POST', settleBody);
    const g = st.body?.gross_amount_minor, fee = st.body?.application_fee_minor, net = st.body?.net_amount_minor;
    mark(11, st.status === 201 && g === 250000 && fee > 0 && g === fee + net, `${st.status} ${st.body?.code ?? ''} gross=${g} fee=${fee} net=${net}`);
    const st2 = await api('/v1/application-settlements', 'POST', settleBody);
    mark(12, [200, 201].includes(st2.status) && st2.body?.id === st.body?.id, `${st2.status} same=${st2.body?.id === st.body?.id}`);
    const hit = await waitForDelivery(run, /application_settlement\.completed/);
    mark(13, Boolean(hit), `delivered=${Boolean(hit)}`);

    const share = await call(`/projects/${A}/financial-setup/share-code`, 'POST');
    mark(14, share.status === 201 && /^[A-Z0-9-]{12,16}$/.test(share.body?.code ?? ''), share.status);
    const pb = await call(`/workspaces/${ws.body?.id}/projects`, 'POST', { name: `${like}-b` });
    B = pb.body?.id;
    const link = await call(`/projects/${B}/financial-onboarding/link`, 'POST', { code: share.body?.code });
    mark(15, link.status === 200 && link.body?.business?.synthetic === true, `${link.status} synthetic=${link.body?.business?.synthetic}`);
    const keyB = await call(`/projects/${B}/keys`, 'POST', { kind: 'SECRET', name: `${like}-b`, scopes: SCOPES });
    const apiB = keyCaller(keyB.body?.secret);
    const sB = await apiB('/v1/payment-sessions', 'POST', { purpose: 'ORDER', reference_type: 'PEDIDO', reference_id: `b_${stamp}`, amount_minor: 30000, currency: 'AOA' }, { 'Idempotency-Key': `ssa_${stamp}_bs` });
    const payerB = await apiB('/v1/sandbox/test-payers', 'POST', {}, { 'Idempotency-Key': `ssa_${stamp}_bp` });
    const payB = await apiB(`/v1/sandbox/test-payers/${payerB.body?.id}/payments`, 'POST', { payment_session_id: sB.body?.session_id }, { 'Idempotency-Key': `ssa_${stamp}_bpay` });
    mark(16, sB.status === 201 && payB.status === 200, `${sB.status}/${payB.status}`);
    const balBefore = (await call(`/projects/${A}/balances`)).body?.accounts ?? [];
    const resetB = await call(`/projects/${B}/sandbox/reset`, 'POST', { confirm: 'RESET' });
    const balAfter = (await call(`/projects/${A}/balances`)).body?.accounts ?? [];
    const sum = (xs) => xs.reduce((a, x) => a + Number(x.balance_minor ?? 0), 0);
    const aPayers = (await api('/v1/sandbox/test-payers')).body?.data ?? [];
    mark(17, resetB.status === 200 && resetB.body?.business_reset === false && resetB.body?.test_payers_retired === 1 && sum(balBefore) === sum(balAfter) && aPayers.length === 1,
      `reset=${resetB.status} business_reset=${resetB.body?.business_reset} A_balance ${sum(balBefore)}→${sum(balAfter)} A_payers=${aPayers.length}`);
    const resetA = await call(`/projects/${A}/sandbox/reset`, 'POST', { confirm: 'RESET' });
    const cleaned = await cleanup(call, [A, B], ws.body?.id);
    const residue = measureResidue(like);
    mark(18, resetA.status === 200 && residue === 0, `resetA=${resetA.status} cleanup=${cleaned.join(',')} residue=${residue}`);
  } catch (e) {
    console.error(`  ! aborted: ${String(e.stack ?? e).split('\n')[0]}`);
    try { await cleanup(call, [A, B].filter(Boolean), ws.body?.id); } catch { /* best effort */ }
  }
  return j;
}

// ── entry ────────────────────────────────────────────────────────────────────

function report(results) {
  const out = join(assuranceDir('sandbox-self-service'), `sandbox-self-service-${Date.now()}.json`);
  mkdirSync(dirname(out), { recursive: true });
  const summaries = Object.fromEntries(results.map((r) => [r.name, summarise(r.steps)]));
  writeFileSync(out, `${JSON.stringify({ ran_at: new Date().toISOString(), gateway: GW, journeys: results.map((r) => ({ name: r.name, steps: r.steps, summary: summaries[r.name] })) }, null, 2)}\n`);
  console.log('');
  for (const r of results) {
    const s = summaries[r.name];
    console.log(`SANDBOX_${r.name.toUpperCase()}_JOURNEY=${s.verdict} (${s.passed}/${s.total})`);
  }
  console.log(`evidence: ${out}`);
  process.exitCode = results.every((r) => summaries[r.name].verdict === 'PASS') ? 0 : 1;
}

if (process.argv[1] && process.argv[1].endsWith('self-service-e2e.mjs')) {
  const which = process.argv[2] ?? 'all';
  const results = [];
  if (which === 'fresh' || which === 'all') { console.log('fresh developer journey\n'); results.push(await fresh()); }
  if (which === 'application' || which === 'all') { console.log('\napplication journey\n'); results.push(await application()); }
  if (!results.length) { console.error('usage: self-service-e2e.mjs fresh | application | all'); process.exit(2); }
  report(results);
}
