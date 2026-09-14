#!/usr/bin/env node
/**
 * SANDBOX-SELF-SERVICE-001 / REALTIME-001 — the realtime status channel and the
 * tenant boundary, proved against the deployed Public Sandbox through Cloudflare
 * and nginx.
 *
 *   realtime   16 steps: token placement, snapshot, stream framing, heartbeat,
 *              reconnect, stream limits, CORS, tampering, terminal close,
 *              latency samples and the GET fallback.
 *   isolation  14 steps: a second Project (and a second developer) reaching for
 *              the first Project's sessions, refunds, test payers, webhooks,
 *              logs, Explorer, reset and sharing — and a Sandbox credential
 *              reaching for Live.
 *   expiry      2 steps: a status token is refused once its 30 minutes are over
 *              (runs for ~31 minutes; separate so the other modes stay quick).
 *
 *   node tools/e2e/sandbox/realtime-isolation-e2e.mjs realtime | isolation | expiry | all
 *
 * Same rules as self-service-e2e.mjs: product sign-in only, no internal route,
 * no database write, nothing secret printed, everything created is retired
 * through the product and residue is measured. `all` does not include expiry.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { assuranceDir } from '../lib/assurance-output.mjs';
import { mintSession } from '../console/lib/mint.mjs';

const API = process.env.BZ_DEV_API ?? 'https://developer-api.banzami.com';
const GW = process.env.BZ_GATEWAY ?? 'https://sandbox-api.banzami.com';
const LIVE_GW = process.env.BZ_LIVE_GATEWAY ?? 'https://api.banzami.com';
const ORIGIN = process.env.BZ_CONSOLE ?? 'https://developers.banzami.com';
const HOST = process.env.BZ_SANDBOX_HOST ?? 'root@217.160.9.248';

export const REALTIME = [
  'Sign in, project, Sandbox set up, secret key', 'Session carries a bzst_ token, a path and an expiry',
  'Token in the query is refused before it is read', 'No token and a tampered token are refused',
  "Another session's token is refused for this session", 'Snapshot (JSON) carries public fields only',
  'CORS preflight: any origin, no credentials, GET only', 'Stream: event-stream, retry, snapshot first, no caching',
  'Heartbeat arrives while nothing changes', 'Reconnect gets a fresh snapshot',
  'A fourth stream on one session is refused with Retry-After', 'A closed stream frees its place',
  'Payment turns the stream PAID and the stream closes', 'A stream opened on a PAID session closes after its snapshot',
  'Latency samples: PAID within the 2 s target', 'GET fallback reads the same status with the key',
];
export const ISOLATION = [
  'Two projects set up (A and B), a second developer signed in', "B's key cannot read A's session",
  "B's test payer cannot pay A's session", "B's key cannot refund A's payment",
  "B's key cannot read, fund, pay with or retire A's test payer", "B's lists contain nothing of A's",
  "B's key cannot read, test, replay or delete A's webhook endpoint", "A realtime token grants no API access",
  'The second developer cannot open A or its logs', 'The second developer cannot use Explorer on A',
  'The second developer cannot reset A or issue its share code', 'Keys minted in the Sandbox are Sandbox keys only',
  'A Sandbox key is refused by the Live host', 'Cleanup leaves no residue',
];
export const EXPIRY = ['A token is minted and works', 'After 30 minutes the same token is refused as expired'];

const VERDICTS = new Set(['PASS', 'FAIL']);
function journey(name, rubric) {
  const steps = rubric.map((title, i) => ({ n: i + 1, title, verdict: 'NOT_RUN', detail: '' }));
  const mark = (n, ok, detail = '') => {
    const verdict = ok ? 'PASS' : 'FAIL';
    if (!VERDICTS.has(verdict)) throw new Error(verdict);
    steps[n - 1] = { ...steps[n - 1], verdict, detail: String(detail).slice(0, 300) };
    (ok ? console.log : console.error)(`  ${ok ? '✓' : '✗'} [${String(n).padStart(2, '0')}] ${steps[n - 1].title}${detail ? ` — ${steps[n - 1].detail}` : ''}`);
    return ok;
  };
  return { name, steps, mark };
}
export function summarise(steps) {
  const passed = steps.filter((s) => s.verdict === 'PASS').length;
  return { passed, total: steps.length, verdict: passed === steps.length ? 'PASS' : 'FAIL' };
}

// ── plumbing ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
function keyCaller(secret, base = GW) {
  return async (path, method = 'GET', body, extra = {}) => {
    const headers = { authorization: `Bearer ${secret}`, ...extra };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) };
  };
}
const rt = (id, token, accept = 'application/json', query = '') => fetch(`${GW}/v1/realtime/payment-sessions/${id}${query}`, {
  headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), accept },
});
const code = async (res) => (await res.json().catch(() => ({}))).code ?? '';

/** Open an SSE stream with the token in the header. Events are recorded with arrival time. */
function openStream(sessionId, token) {
  const controller = new AbortController();
  const events = [];
  let resolveOpen;
  const opened = new Promise((r) => { resolveOpen = r; });
  const done = (async () => {
    try {
      const res = await fetch(`${GW}/v1/realtime/payment-sessions/${sessionId}`, {
        headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' }, signal: controller.signal,
      });
      const meta = { status: res.status, type: res.headers.get('content-type') ?? '', cache: res.headers.get('cache-control') ?? '', retryAfter: res.headers.get('retry-after') };
      if (!res.ok || !res.body) {
        meta.code = await code(res);
        resolveOpen(meta);
        return { ...meta, events, closed: false };
      }
      resolveOpen(meta);
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
          if (/^retry: \d+/m.test(frame) && !/^event:/m.test(frame)) { events.push({ event: 'retry', at: Date.now() }); continue; }
          const ev = /^event: (.+)$/m.exec(frame)?.[1];
          const data = /^data: (.+)$/m.exec(frame)?.[1];
          if (/^retry: \d+/m.test(frame)) events.push({ event: 'retry', at: Date.now() });
          if (ev && data) events.push({ event: ev, data: JSON.parse(data), status: JSON.parse(data).status, at: Date.now() });
          else if (frame.startsWith(':')) events.push({ event: 'heartbeat', at: Date.now() });
        }
      }
      return { ...meta, events, closed: true };
    } catch (e) {
      resolveOpen({ status: 0, error: e.name });
      return { status: 0, events, aborted: e.name === 'AbortError' };
    }
  })();
  return { opened, done, events, stop: () => controller.abort() };
}
async function until(pred, ms, step = 100) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (pred()) return true; await sleep(step); }
  return pred();
}

function measureResidue(like) {
  const sql = `SELECT (SELECT count(*) FROM developer.dev_workspaces WHERE name LIKE '${like}%' AND status='ACTIVE')`
    + ` + (SELECT count(*) FROM developer.dev_projects WHERE name LIKE '${like}%' AND status='ACTIVE')`
    + ` + (SELECT count(*) FROM developer.dev_api_keys k JOIN developer.dev_projects p ON p.id=k.project_id WHERE p.name LIKE '${like}%' AND k.status='ACTIVE')`
    + ` + (SELECT count(*) FROM sandbox_test_payers t JOIN developer.dev_projects p ON p.id=t.project_id WHERE p.name LIKE '${like}%' AND t.retired_at IS NULL)`;
  try {
    const out = execSsh(`PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1); CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1); `
      + `PW=$(docker exec $CORE sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#'); `
      + `docker exec -e PGPASSWORD=$PW -e PGOPTIONS='-c default_transaction_read_only=on' $PG psql -U bl_app_runtime -d banzami_staging -At -c "${sql}"`);
    return Number(out.trim());
  } catch { return -1; }
}
function execSsh(cmd) { return execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, cmd], { encoding: 'utf8', timeout: 60000 }); }

async function cleanup(call, projects, workspace) {
  const done = [];
  for (const p of projects.filter(Boolean)) {
    await call(`/projects/${p}/sandbox/reset`, 'POST', { confirm: 'RESET' });
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

/** A signed-in developer with a workspace and n Sandbox-ready projects, each with a key. */
async function developer(like, email, n) {
  const token = mintSession(email);
  const call = consoleCaller(token);
  const ws = await call('/workspaces', 'POST', { name: like });
  const projects = [];
  for (let i = 0; i < n; i += 1) {
    const pr = await call(`/workspaces/${ws.body?.id}/projects`, 'POST', { name: `${like}-${'ab'[i]}` });
    const setup = await call(`/projects/${pr.body?.id}/financial-setup`, 'POST', { use_case: 'STANDARD' });
    const key = await call(`/projects/${pr.body?.id}/keys`, 'POST', { kind: 'SECRET', name: `${like}-${'ab'[i]}`, scopes: SCOPES });
    projects.push({ id: pr.body?.id, setup: setup.status, keyStatus: key.status, api: keyCaller(key.body?.secret ?? ''), secretShape: String(key.body?.secret ?? '').slice(0, 11) });
  }
  return { call, workspace: ws.body?.id, wsStatus: ws.status, projects };
}
const newSession = (api, ref, amount = 150000) => api('/v1/payment-sessions', 'POST',
  { purpose: 'ORDER', reference_type: 'PEDIDO', reference_id: ref, amount_minor: amount, currency: 'AOA' }, { 'Idempotency-Key': `rti_${ref}` });

// ── realtime ─────────────────────────────────────────────────────────────────

async function realtime() {
  const j = journey('realtime', REALTIME);
  const { mark } = j;
  const stamp = Date.now().toString(36);
  const like = `rt-${stamp}`;
  let dev;
  try {
    dev = await developer(like, `e2e-rt-${stamp}@banzami-e2e.test`, 1);
    const P = dev.projects[0];
    mark(1, dev.wsStatus === 201 && P.setup === 200 && P.keyStatus === 201, `ws=${dev.wsStatus} setup=${P.setup} key=${P.keyStatus}`);
    const api = P.api;
    const s1 = await newSession(api, `${stamp}_1`);
    const S = s1.body?.session_id;
    const tok = s1.body?.realtime?.token;
    const expIn = Date.parse(s1.body?.realtime?.expires_at ?? '') - Date.now();
    mark(2, s1.status === 201 && tok?.startsWith('bzst_') && s1.body?.realtime?.path === `/v1/realtime/payment-sessions/${S}` && expIn > 0 && expIn <= 30 * 60 * 1000 + 5000,
      `${s1.status} expires_in_s=${Math.round(expIn / 1000)}`);

    const inQuery = await rt(S, null, 'application/json', `?token=${encodeURIComponent(tok)}`);
    const inQueryWithHeader = await rt(S, tok, 'application/json', `?access_token=x`);
    mark(3, inQuery.status === 400 && (await code(inQuery)) === 'REALTIME_TOKEN_IN_URL' && inQueryWithHeader.status === 400,
      `token=${inQuery.status} access_token+header=${inQueryWithHeader.status}`);

    const none = await rt(S, null);
    const [enc, sig] = tok.slice(5).split('.');
    const flipped = `bzst_${enc}.${sig.slice(0, -2)}${sig.endsWith('AA') ? 'BB' : 'AA'}`;
    const forged = await rt(S, flipped);
    const notOurs = await rt(S, 'bz_test_sk_notastatustoken');
    mark(4, none.status === 401 && (await code(none)) === 'REALTIME_TOKEN_REQUIRED' && forged.status === 401 && (await code(forged)) === 'REALTIME_TOKEN_INVALID' && notOurs.status === 401,
      `none=${none.status} tampered=${forged.status} api_key=${notOurs.status}`);

    const s2 = await newSession(api, `${stamp}_2`);
    const wrong = await rt(S, s2.body?.realtime?.token);
    const unknown = await rt('00000000-0000-0000-0000-000000000000', tok);
    mark(5, wrong.status === 403 && (await code(wrong)) === 'REALTIME_TOKEN_WRONG_RESOURCE' && unknown.status === 403,
      `other=${wrong.status} unknown_id=${unknown.status}`);

    const snap = await rt(S, tok);
    const sb = await snap.json().catch(() => ({}));
    const allowed = ['session_id', 'status', 'amount_minor', 'currency', 'expires_at', 'terminal', 'observed_at'];
    mark(6, snap.status === 200 && sb.status === 'ACTIVE' && Object.keys(sb).every((k) => allowed.includes(k)) && snap.headers.get('cache-control') === 'no-store',
      `${snap.status} ${sb.status} keys=${Object.keys(sb).join(',')}`);

    const pre = await fetch(`${GW}/v1/realtime/payment-sessions/${S}`, { method: 'OPTIONS', headers: { origin: 'https://shop.example', 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } });
    const h = (n) => pre.headers.get(n) ?? '';
    mark(7, [200, 204].includes(pre.status) && h('access-control-allow-origin') === '*' && !h('access-control-allow-credentials') && /authorization/i.test(h('access-control-allow-headers')) && !/POST|PUT|DELETE/.test(h('access-control-allow-methods')),
      `${pre.status} origin=${h('access-control-allow-origin')} methods=${h('access-control-allow-methods')} credentials=${h('access-control-allow-credentials') || 'absent'}`);

    const st = openStream(S, tok);
    const meta = await st.opened;
    await until(() => st.events.some((e) => e.event === 'snapshot'), 8000);
    const firstData = st.events.find((e) => e.event !== 'retry');
    mark(8, meta.status === 200 && meta.type.startsWith('text/event-stream') && /no-store|no-cache/.test(meta.cache) && st.events[0]?.event === 'retry' && firstData?.event === 'snapshot' && firstData?.status === 'ACTIVE',
      `${meta.status} ${meta.type} cache=${meta.cache} first=${st.events.slice(0, 2).map((e) => e.event).join(',')}`);
    const t0 = Date.now();
    const beat = await until(() => st.events.some((e) => e.event === 'heartbeat'), 8000, 250);
    mark(9, beat, `heartbeat_after_ms=${beat ? st.events.find((e) => e.event === 'heartbeat').at - t0 : 'none'}`);
    st.stop();
    await st.done;

    const again = openStream(S, tok);
    await again.opened;
    const fresh = await until(() => again.events.some((e) => e.event === 'snapshot'), 8000);
    mark(10, fresh && again.events.find((e) => e.event === 'snapshot')?.status === 'ACTIVE', `snapshot=${fresh}`);

    const extra = [openStream(S, tok), openStream(S, tok)];
    await Promise.all(extra.map((x) => x.opened));
    await until(() => extra.every((x) => x.events.some((e) => e.event === 'snapshot')), 8000);
    const fourth = openStream(S, tok);
    const fm = await fourth.opened;
    mark(11, fm.status === 429 && fm.code === 'REALTIME_STREAM_LIMIT' && Number(fm.retryAfter) > 0, `4th=${fm.status} ${fm.code ?? ''} retry-after=${fm.retryAfter}`);
    // Behind Cloudflare a closed stream is noticed at the next write: the place
    // must be free within one heartbeat (5 s) plus a poll and network margin.
    extra[1].stop();
    await extra[1].done;
    const closedAt = Date.now();
    let replacement; let rm;
    for (;;) {
      await sleep(1000);
      replacement = openStream(S, tok);
      rm = await replacement.opened;
      if (rm.status === 200 || Date.now() - closedAt > 9000) break;
    }
    const freedMs = Date.now() - closedAt;
    mark(12, rm.status === 200 && freedMs <= 9000, `after_close=${rm.status} freed_within_ms=${freedMs}`);

    const payer = await api('/v1/sandbox/test-payers', 'POST', { label: 'Realtime payer' }, { 'Idempotency-Key': `rt_${stamp}_p` });
    const T = payer.body?.id;
    const tp = Date.now();
    const pay = await api(`/v1/sandbox/test-payers/${T}/payments`, 'POST', { payment_session_id: S, via: 'QR' }, { 'Idempotency-Key': `rt_${stamp}_pay` });
    const watchers = [again, extra[0], replacement];
    const results = await Promise.all(watchers.map((w) => Promise.race([w.done, sleep(15000).then(() => ({ timeout: true, events: w.events }))])));
    const allPaid = results.every((r) => r.closed === true && r.events.some((e) => e.event === 'status' && e.status === 'PAID'));
    const paidAt = results.map((r) => r.events.find((e) => e.status === 'PAID')?.at).filter(Boolean);
    mark(13, pay.status === 200 && allPaid, `pay=${pay.status} streams_closed_paid=${results.filter((r) => r.closed && r.events.some((e) => e.status === 'PAID')).length}/3 first_paid_ms=${paidAt.length ? Math.min(...paidAt) - tp : 'none'}`);

    const late = openStream(S, tok);
    const lateRes = await Promise.race([late.done, sleep(8000).then(() => ({ timeout: true, events: late.events }))]);
    mark(14, lateRes.closed === true && lateRes.events.some((e) => e.event === 'snapshot' && e.status === 'PAID' && e.data?.terminal === true), `closed=${lateRes.closed} events=${lateRes.events.map((e) => `${e.event}:${e.status ?? ''}`).join(',')}`);

    const samples = [];
    for (let i = 0; i < 5; i += 1) {
      const s = await newSession(api, `${stamp}_lat${i}`, 10000 + i);
      const w = openStream(s.body?.session_id, s.body?.realtime?.token);
      await w.opened;
      await until(() => w.events.some((e) => e.event === 'snapshot'), 8000);
      const at = Date.now();
      await api(`/v1/sandbox/test-payers/${T}/payments`, 'POST', { payment_session_id: s.body?.session_id, via: i % 2 ? 'QR' : 'LINK' }, { 'Idempotency-Key': `rt_${stamp}_lat${i}` });
      const done = await Promise.race([w.done, sleep(10000).then(() => ({ events: w.events }))]);
      const hit = done.events.find((e) => e.status === 'PAID' && e.event === 'status');
      samples.push(hit ? hit.at - at : null);
      w.stop();
    }
    const ok = samples.filter((x) => x !== null).sort((a, b) => a - b);
    mark(15, ok.length === 5 && ok[4] <= 2000, `samples_ms=${samples.join(',')} p50=${ok[2]} max=${ok[4]}`);

    const fallback = await api(`/v1/payment-sessions/${S}`);
    const snapAfter = await (await rt(S, tok)).json().catch(() => ({}));
    mark(16, fallback.status === 200 && fallback.body?.status === 'PAID' && snapAfter.status === 'PAID', `get=${fallback.body?.status} snapshot=${snapAfter.status}`);
  } catch (e) {
    console.error(`  ! aborted: ${String(e.stack ?? e).split('\n')[0]}`);
  } finally {
    if (dev) {
      const cleaned = await cleanup(dev.call, dev.projects.map((p) => p.id), dev.workspace);
      j.cleanup = { cleaned, residue: measureResidue(like) };
      console.log(`  cleanup=${cleaned.join(',')} residue=${j.cleanup.residue}`);
      if (j.cleanup.residue !== 0) j.steps.push({ n: j.steps.length + 1, title: 'Residue', verdict: 'FAIL', detail: String(j.cleanup.residue) });
    }
  }
  return j;
}

// ── isolation ────────────────────────────────────────────────────────────────

async function isolation() {
  const j = journey('isolation', ISOLATION);
  const { mark } = j;
  const stamp = Date.now().toString(36);
  const like = `iso-${stamp}`;
  let dev; let other;
  try {
    dev = await developer(like, `e2e-iso-${stamp}@banzami-e2e.test`, 2);
    other = await developer(`${like}-x`, `e2e-iso-x-${stamp}@banzami-e2e.test`, 0);
    const [A, B] = dev.projects;
    mark(1, dev.projects.every((p) => p.setup === 200 && p.keyStatus === 201) && other.wsStatus === 201, `A=${A.setup}/${A.keyStatus} B=${B.setup}/${B.keyStatus} other_ws=${other.wsStatus}`);

    const sA = await newSession(A.api, `${stamp}_a`);
    const SA = sA.body?.session_id;
    const readB = await B.api(`/v1/payment-sessions/${SA}`);
    const linkB = await B.api(`/v1/payment-sessions/${SA}/link`);
    const qrB = await B.api(`/v1/payment-sessions/${SA}/qr`);
    mark(2, readB.status === 404 && linkB.status === 404 && qrB.status === 404, `get=${readB.status} link=${linkB.status} qr=${qrB.status}`);

    const payerA = await A.api('/v1/sandbox/test-payers', 'POST', { label: 'A payer' }, { 'Idempotency-Key': `iso_${stamp}_pa` });
    const payerB = await B.api('/v1/sandbox/test-payers', 'POST', { label: 'B payer' }, { 'Idempotency-Key': `iso_${stamp}_pb` });
    const crossPay = await B.api(`/v1/sandbox/test-payers/${payerB.body?.id}/payments`, 'POST', { payment_session_id: SA, via: 'QR' }, { 'Idempotency-Key': `iso_${stamp}_x` });
    const stillActive = (await A.api(`/v1/payment-sessions/${SA}`)).body?.status;
    mark(3, crossPay.status === 404 && stillActive === 'ACTIVE' && payerB.body?.balance_minor === 1000000, `pay=${crossPay.status} A_session=${stillActive}`);

    const paid = await A.api(`/v1/sandbox/test-payers/${payerA.body?.id}/payments`, 'POST', { payment_session_id: SA }, { 'Idempotency-Key': `iso_${stamp}_pay` });
    const src = (await A.api(`/v1/payment-sessions/${SA}`)).body?.refund_source ?? {};
    const refundB = await B.api('/v1/refunds', 'POST', { ...src, amount_minor: 1000, currency: 'AOA', idempotency_key: `iso_${stamp}_rb`, reason: 'cross-tenant' });
    const afterRefund = (await A.api(`/v1/payment-sessions/${SA}`)).body;
    mark(4, paid.status === 200 && Boolean(src.source_type ?? src.transfer_id ?? Object.keys(src).length) && [403, 404, 422].includes(refundB.status) && refundB.status !== 201,
      `paid=${paid.status} refund_by_B=${refundB.status} ${refundB.body?.code ?? ''} A_refunded=${afterRefund?.refunded_amount_minor ?? afterRefund?.amount_refunded_minor ?? 0}`);

    const TA = payerA.body?.id;
    const g = await B.api(`/v1/sandbox/test-payers/${TA}`);
    const f = await B.api(`/v1/sandbox/test-payers/${TA}/fund`, 'POST', { amount_minor: 1000 }, { 'Idempotency-Key': `iso_${stamp}_f` });
    const sB = await newSession(B.api, `${stamp}_b`);
    const p = await B.api(`/v1/sandbox/test-payers/${TA}/payments`, 'POST', { payment_session_id: sB.body?.session_id }, { 'Idempotency-Key': `iso_${stamp}_p` });
    const del = await B.api(`/v1/sandbox/test-payers/${TA}`, 'DELETE');
    const aStill = await A.api(`/v1/sandbox/test-payers/${TA}`);
    mark(5, g.status === 404 && f.status === 404 && p.status === 404 && del.status === 404 && aStill.status === 200 && !aStill.body?.retired_at,
      `get=${g.status} fund=${f.status} pay=${p.status} retire=${del.status} A_intact=${aStill.status}`);

    const listS = (await B.api('/v1/payment-sessions?limit=100')).body;
    const listP = (await B.api('/v1/sandbox/test-payers')).body?.data ?? [];
    const sessionsB = listS?.data ?? listS?.sessions ?? listS?.items ?? [];
    mark(6, !JSON.stringify(sessionsB).includes(SA) && listP.every((x) => x.id !== TA) && listP.length === 1, `B_sessions=${sessionsB.length} B_payers=${listP.length}`);

    const epA = await A.api('/v1/webhooks/endpoints', 'POST', { url: 'https://sandbox-webhook.banzami.com/receive/iso', events: ['payment_session.paid'] });
    const EA = epA.body?.id;
    await A.api(`/v1/webhooks/endpoints/${EA}/test`, 'POST');
    let eventA; let deliveryA;
    for (let i = 0; i < 15 && !deliveryA; i += 1) {
      await sleep(2000);
      const evs = (await A.api('/v1/webhooks/events?limit=20')).body;
      eventA = (evs?.data ?? evs?.events ?? [])[0]?.id;
      if (eventA) deliveryA = ((await A.api(`/v1/webhooks/events/${eventA}/deliveries`)).body?.deliveries ?? [])[0]?.id;
    }
    const deny = (x) => [403, 404].includes(x.status);
    const eg = await B.api(`/v1/webhooks/endpoints/${EA}`);
    const eh = await B.api(`/v1/webhooks/endpoints/${EA}/health`);
    const et = await B.api(`/v1/webhooks/endpoints/${EA}/test`, 'POST');
    const ers = await B.api(`/v1/webhooks/endpoints/${EA}/rotate-secret`, 'POST');
    const ed = await B.api(`/v1/webhooks/endpoints/${EA}`, 'DELETE');
    const evd = await B.api(`/v1/webhooks/events/${eventA}/deliveries`);
    const er = await B.api(`/v1/webhooks/deliveries/${deliveryA}/replay`, 'POST');
    const bLists = JSON.stringify([(await B.api('/v1/webhooks/endpoints')).body, (await B.api('/v1/webhooks/events?limit=50')).body]);
    const aStillActive = (await A.api(`/v1/webhooks/endpoints/${EA}`)).body;
    const leaked = evd.status === 200 && (evd.body?.deliveries ?? []).length > 0;
    mark(7, epA.status === 201 && Boolean(deliveryA) && deny(eg) && deny(eh) && deny(et) && deny(ers) && deny(ed) && deny(er) && !leaked && !bLists.includes(EA) && !bLists.includes(eventA) && (aStillActive?.active ?? aStillActive?.status === 'ACTIVE') !== false,
      `get=${eg.status} health=${eh.status} test=${et.status} rotate=${ers.status} delete=${ed.status} event_deliveries=${evd.status}/${(evd.body?.deliveries ?? []).length} replay=${er.status} A_delivery=${Boolean(deliveryA)}`);

    const tok = sA.body?.realtime?.token;
    const tokAsKey = await keyCaller(tok)(`/v1/payment-sessions/${SA}`);
    const tokMe = await keyCaller(tok)('/v1/me');
    const tokDev = await fetch(`${API}/projects/${A.id}`, { headers: { authorization: `Bearer ${tok}` } });
    mark(8, tokAsKey.status === 401 && tokMe.status === 401 && [401, 403].includes(tokDev.status), `session=${tokAsKey.status} me=${tokMe.status} console=${tokDev.status}`);

    const oc = other.call;
    const op = await oc(`/projects/${A.id}`);
    const ol = await oc(`/projects/${A.id}/logs`);
    const ofs = await oc(`/projects/${A.id}/financial-setup`);
    const ok = await oc(`/projects/${A.id}/keys`);
    mark(9, [403, 404].includes(op.status) && [403, 404].includes(ol.status) && [403, 404].includes(ofs.status) && [403, 404].includes(ok.status),
      `project=${op.status} logs=${ol.status} setup=${ofs.status} keys=${ok.status}`);
    const eo = await oc(`/projects/${A.id}/explorer/operations`);
    const er2 = await oc(`/projects/${A.id}/explorer/requests`, 'POST', { operation_id: 'getMe' });
    mark(10, [403, 404].includes(eo.status) && [403, 404].includes(er2.status) && !JSON.stringify(er2.body ?? {}).includes('SANDBOX'), `operations=${eo.status} request=${er2.status}`);
    const orr = await oc(`/projects/${A.id}/sandbox/reset`, 'POST', { confirm: 'RESET' });
    const osc = await oc(`/projects/${A.id}/financial-setup/share-code`, 'POST');
    const aPayers = (await A.api('/v1/sandbox/test-payers')).body?.data ?? [];
    mark(11, [403, 404].includes(orr.status) && [403, 404].includes(osc.status) && aPayers.length === 1, `reset=${orr.status} share=${osc.status} A_payers=${aPayers.length}`);

    const liveKey = await dev.call(`/projects/${A.id}/keys`, 'POST', { kind: 'SECRET', name: `${like}-live`, scopes: ['identity:read'], environment: 'LIVE' });
    const keys = (await dev.call(`/projects/${A.id}/keys`)).body?.keys ?? [];
    const allSandbox = keys.every((k) => (k.environment ?? 'SANDBOX') === 'SANDBOX' && !String(k.key_prefix ?? k.prefix ?? '').startsWith('bz_live_'));
    const liveSecret = String(liveKey.body?.secret ?? '');
    mark(12, (liveKey.status >= 400 || (liveSecret.startsWith('bz_test_') && liveKey.body?.environment !== 'LIVE')) && allSandbox && A.secretShape === 'bz_test_sk_',
      `environment=LIVE → ${liveKey.status} ${liveKey.body?.code ?? ''} minted_live=${liveSecret.startsWith('bz_live_')} all_sandbox=${allSandbox}`);

    const liveMe = await fetch(`${LIVE_GW}/v1/me`, { headers: { authorization: `Bearer ${await secretOf(dev, A.id, like)}` } }).catch(() => ({ status: 0 }));
    mark(13, liveMe.status !== 200 && liveMe.status !== 0, `live_host=${liveMe.status}`);

    const cleanedOther = await cleanup(other.call, [], other.workspace);
    const cleaned = await cleanup(dev.call, dev.projects.map((x) => x.id), dev.workspace);
    const residue = measureResidue(like);
    mark(14, residue === 0, `cleanup=${[...cleaned, ...cleanedOther].join(',')} residue=${residue}`);
    dev = null; other = null;
  } catch (e) {
    console.error(`  ! aborted: ${String(e.stack ?? e).split('\n')[0]}`);
  } finally {
    if (dev) await cleanup(dev.call, dev.projects.map((x) => x.id), dev.workspace).catch(() => {});
    if (other) await cleanup(other.call, [], other.workspace).catch(() => {});
  }
  return j;
}

/** A fresh key for the Live-host probe, so no earlier secret is kept in memory longer than needed. */
async function secretOf(dev, projectId, like) {
  const k = await dev.call(`/projects/${projectId}/keys`, 'POST', { kind: 'SECRET', name: `${like}-probe`, scopes: ['identity:read'] });
  return k.body?.secret ?? '';
}

// ── expiry ───────────────────────────────────────────────────────────────────

async function expiry() {
  const j = journey('expiry', EXPIRY);
  const { mark } = j;
  const stamp = Date.now().toString(36);
  const like = `rtx-${stamp}`;
  const dev = await developer(like, `e2e-rtx-${stamp}@banzami-e2e.test`, 1);
  try {
    const s = await newSession(dev.projects[0].api, `${stamp}_x`);
    const tok = s.body?.realtime?.token;
    const exp = Date.parse(s.body?.realtime?.expires_at ?? '');
    const first = await rt(s.body?.session_id, tok);
    mark(1, first.status === 200, `${first.status} expires_at=${s.body?.realtime?.expires_at}`);
    const wait = exp - Date.now() + 15000;
    console.log(`  … waiting ${Math.round(wait / 1000)} s for the token to expire`);
    await sleep(wait);
    const later = await rt(s.body?.session_id, tok);
    const reread = await dev.projects[0].api(`/v1/payment-sessions/${s.body?.session_id}`);
    const renewed = await rt(s.body?.session_id, reread.body?.realtime?.token);
    mark(2, later.status === 401 && (await code(later)) === 'REALTIME_TOKEN_EXPIRED' && renewed.status === 200, `expired=${later.status} reread_token=${renewed.status}`);
  } finally {
    const cleaned = await cleanup(dev.call, dev.projects.map((x) => x.id), dev.workspace);
    console.log(`  cleanup=${cleaned.join(',')} residue=${measureResidue(like)}`);
  }
  return j;
}

// ── entry ────────────────────────────────────────────────────────────────────

function report(results) {
  const out = join(assuranceDir('sandbox-self-service'), `realtime-isolation-${Date.now()}.json`);
  mkdirSync(dirname(out), { recursive: true });
  const summaries = Object.fromEntries(results.map((r) => [r.name, summarise(r.steps)]));
  writeFileSync(out, `${JSON.stringify({ ran_at: new Date().toISOString(), gateway: GW, journeys: results.map((r) => ({ name: r.name, steps: r.steps, cleanup: r.cleanup, summary: summaries[r.name] })) }, null, 2)}\n`);
  console.log('');
  for (const r of results) console.log(`SANDBOX_${r.name.toUpperCase()}_E2E=${summaries[r.name].verdict} (${summaries[r.name].passed}/${summaries[r.name].total})`);
  console.log(`evidence: ${out}`);
  process.exitCode = results.every((r) => summaries[r.name].verdict === 'PASS') ? 0 : 1;
}

if (process.argv[1] && process.argv[1].endsWith('realtime-isolation-e2e.mjs')) {
  const which = process.argv[2] ?? 'all';
  const results = [];
  if (which === 'realtime' || which === 'all') { console.log('realtime\n'); results.push(await realtime()); }
  if (which === 'isolation' || which === 'all') { console.log('\nisolation\n'); results.push(await isolation()); }
  if (which === 'expiry') { console.log('expiry\n'); results.push(await expiry()); }
  if (!results.length) { console.error('usage: realtime-isolation-e2e.mjs realtime | isolation | expiry | all'); process.exit(2); }
  report(results);
}
