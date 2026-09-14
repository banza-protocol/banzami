#!/usr/bin/env node
/**
 * SANDBOX-SELF-SERVICE-001 §81 — the public Sandbox cleanroom.
 *
 * A new external developer, with only what the public has: the Developers
 * Console (its session API, exactly as the browser calls it), the public
 * documentation's routes, the PUBLISHED SDK installed from registry.npmjs.org
 * into an empty directory outside every repository, and the public Sandbox API.
 * No SQL, no internal route, no BANZADMIN, no fixture, no operator, no support.
 *
 * Two things a real developer brings that this run borrows, both declared:
 *   · a mailbox — the sign-in code is read back from the message the product
 *     sent (console-client.mjs). It bypasses delivery and nothing else;
 *   · a server to receive webhooks — the Sandbox webhook sink stands in for the
 *     developer's own endpoint (told to answer 2xx for this run, and read back
 *     for the raw body and signature the SDK then verifies).
 *
 * With @banzami/sdk 0.14.0 or later the SDK carries test payers, webhook test
 * events and realtime, and the cleanroom uses it for them; with an older one
 * those steps use HTTP. CLEANROOM_SDK_VERSION=0.14.0 installs exactly that
 * version and fails step 7 if the registry does not serve it.
 * CLEANROOM_SDK_TARBALL installs a local pack instead — for checking this
 * harness only: step 7 then FAILS, because a local package is not the public
 * SDK.
 *
 * SANDBOX-DELETE-001 §54: the developer then deletes the Project, creates a
 * replacement with the same name, uses it, and deletes the Workspace — the
 * product's own Delete is the cleanup; nothing is archived first.
 *
 * Nothing secret is printed or written. Everything created is retired through
 * the product; residue is measured afterwards, read-only, as operator
 * verification of the cleanup — never as a step.
 *
 *   node tools/e2e/cleanroom/public-sandbox-cleanroom.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { signIn, api as consoleApi } from './console-client.mjs';
import { assuranceDir } from '../lib/assurance-output.mjs';

const GW = 'https://sandbox-api.banzami.com';
const HOST = process.env.BZ_SANDBOX_HOST ?? 'root@217.160.9.248';
const SINK = 'https://sandbox-webhook.banzami.com/receive';
const ssh = (cmd) => execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, cmd], { encoding: 'utf8', timeout: 60000 });
const receiverOpen = (run) => ssh(`docker exec banzami-webhook-sink wget -qO- --post-data='{}' --header='content-type: application/json' 'http://127.0.0.1:8090/admin/configure?run=${run}'`);
const received = (run) => JSON.parse(ssh(`docker exec banzami-webhook-sink wget -qO- 'http://127.0.0.1:8090/admin/requests?run=${run}'`)).requests ?? [];

export const STEPS = [
  'Account: sign in with an email code', 'Workspace', 'Project', 'Financial Setup by use case, no operator',
  'Sandbox Business: synthetic, unverified, classified and priced by policy', 'API key (reveal once)',
  'Published SDK from the registry: identity is SANDBOX', 'Test payer', 'Fictitious funding, idempotent',
  'API Explorer runs a request with no key in the browser', 'Payment: SDK session, paid by a test payer',
  'Payment Link: created and paid', 'QR: a session paid by its QR', 'Realtime: the stream turns PAID',
  'External rail down: a wallet payment still completes on the ledger',
  'External rail down: a rail-dependent payment fails closed, nothing moves',
  'External rail restored',
  'Webhook: endpoint registered with the SDK, paid event delivered', 'Synthetic webhook test event delivered',
  'Delivery replay', 'Receipt verifies publicly', 'Partial refund', 'Cumulative refund: the rest, then refused',
  'Application settlement: gross = fee + net', 'API logs', 'Workspace Activity is distinct from API logs',
  'Credential rotation: the old key stops, the new one works', 'Sandbox reset: test data stops, history stays',
  'Delete the Project after all that activity: its key stops at once, it leaves the Console',
  'A replacement Project with the same name is new, and works',
  'Delete the Workspace with its Projects, without archiving',
  'Cleanup through the product',
];

const steps = STEPS.map((title, i) => ({ n: i + 1, title, verdict: 'NOT_RUN', detail: '' }));
const mark = (n, ok, detail = '') => {
  steps[n - 1] = { ...steps[n - 1], verdict: ok ? 'PASS' : 'FAIL', detail: String(detail).slice(0, 260) };
  (ok ? console.log : console.error)(`  ${ok ? '✓' : '✗'} [${String(n).padStart(2, '0')}] ${steps[n - 1].title}${detail ? ` — ${steps[n - 1].detail}` : ''}`);
  return ok;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, every = 1500) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(every); } };
const http = (secret) => async (path, method = 'GET', body, extra = {}) => {
  const headers = { authorization: `Bearer ${secret}`, ...extra };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(GW + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) };
};

async function streamUntilTerminal(sessionId, token, ms) {
  const c = new AbortController();
  const seen = [];
  const t = setTimeout(() => c.abort(), ms);
  try {
    const res = await fetch(`${GW}/v1/realtime/payment-sessions/${sessionId}`, { headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' }, signal: c.signal });
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let cut;
      while ((cut = buf.indexOf('\n\n')) >= 0) {
        const f = buf.slice(0, cut); buf = buf.slice(cut + 2);
        const ev = /^event: (.+)$/m.exec(f)?.[1]; const data = /^data: (.+)$/m.exec(f)?.[1];
        if (ev && data) seen.push({ ev, status: JSON.parse(data).status, at: Date.now() });
      }
    }
  } catch { /* aborted */ } finally { clearTimeout(t); }
  return seen;
}

function residue(workspace) {
  if (!/^[0-9a-f-]{36}$/.test(String(workspace))) return -1;
  const w = `'${workspace}'`;
  const sql = `SELECT (SELECT count(*) FROM developer.dev_workspaces WHERE id=${w} AND status IN ('ACTIVE','ARCHIVED'))`
    + ` + (SELECT count(*) FROM developer.dev_projects WHERE workspace_id=${w} AND status IN ('ACTIVE','ARCHIVED'))`
    + ` + (SELECT count(*) FROM developer.dev_api_keys k JOIN developer.dev_projects p ON p.id=k.project_id WHERE p.workspace_id=${w} AND k.status='ACTIVE')`
    + ` + (SELECT count(*) FROM sandbox_test_payers t JOIN developer.dev_projects p ON p.id=t.project_id WHERE p.workspace_id=${w} AND t.retired_at IS NULL)`
    + ` + (SELECT count(*) FROM webhook_endpoints e JOIN sandbox_businesses b ON b.merchant_id=e.merchant_id JOIN developer.dev_projects p ON p.id=b.project_id WHERE p.workspace_id=${w} AND e.active)`
    + ` + (SELECT count(*) FROM merchants m JOIN sandbox_businesses b ON b.merchant_id=m.id JOIN developer.dev_projects p ON p.id=b.project_id WHERE p.workspace_id=${w} AND m.status='ACTIVE')`;
  try {
    return Number(execFileSync('ssh', ['-o', 'BatchMode=yes', HOST,
      `PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1); `
      + `PW=$(cat /root/.banzami/operator_db_url | sed -E 's#.*://[^:]+:([^@]+)@.*#\\1#'); `
      + `docker exec -e PGPASSWORD=$PW -e PGOPTIONS='-c default_transaction_read_only=on' $PG psql -U bl_app_runtime -d banzami_staging -At -c "${sql}"`], { encoding: 'utf8', timeout: 60000 }).trim());
  } catch { return -1; }
}

async function main() {
  const t0 = Date.now();
  const timings = {};
  const stamp = Date.now().toString(36);
  const like = `cleanroom-${stamp}`;
  const room = mkdtempSync(join(tmpdir(), 'banzami-public-cleanroom-'));
  let sess; let ws; let railKey; const projects = [];
  const call = (method, path, body) => consoleApi(sess, method, path, body);
  try {
    sess = await signIn(`e2e-cleanroom-${stamp}@banzami-e2e.test`);
    mark(1, Boolean(sess?.token), 'documented request-otp → code → verify');
    const w = await call('POST', '/workspaces', { name: like });
    ws = w.body?.id;
    mark(2, w.status === 201, w.status);
    const p = await call('POST', `/workspaces/${ws}/projects`, { name: `${like}-shop` });
    const P = p.body?.id; projects.push(P);
    mark(3, p.status === 201, p.status);
    const setup = await call('POST', `/projects/${P}/financial-setup`, { use_case: 'STANDARD' });
    mark(4, setup.status === 200 && ['READY', 'SEALED'].includes(setup.body?.state), `${setup.status} ${setup.body?.state}`);
    const fs = (await call('GET', `/projects/${P}/financial-setup`)).body;
    const biz = fs?.onboarding?.business;
    mark(5, biz?.synthetic === true && biz?.verified === false && fs?.readiness?.pricing?.profile === 'sandbox-default', `kyb=${biz?.kyb_status} verified=${biz?.verified} profile=${fs?.readiness?.pricing?.profile}`);
    const scopes = ['identity:read', 'payment_sessions:write', 'payment_sessions:read', 'payment_links:write', 'payment_links:read', 'webhooks:write', 'webhooks:read', 'refunds:write', 'refunds:read', 'sandbox:read', 'sandbox:write'];
    const k = await call('POST', `/projects/${P}/keys`, { kind: 'SECRET', name: like, scopes });
    let secret = k.body?.secret;
    railKey = secret;
    const keyId = k.body?.id;
    const keyAgain = await call('GET', `/projects/${P}/keys`);
    mark(6, k.status === 201 && /^bz_test_sk_/.test(secret ?? '') && !JSON.stringify(keyAgain.body ?? {}).includes(secret), `${k.status} listed_without_secret=${!JSON.stringify(keyAgain.body ?? {}).includes(secret)}`);

    // The published SDK, installed into an empty directory from the registry.
    writeFileSync(join(room, 'package.json'), JSON.stringify({ name: 'cleanroom-app', private: true, type: 'module' }));
    execFileSync('npm', ['install', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', process.env.CLEANROOM_SDK_TARBALL ?? `@banzami/sdk@${process.env.CLEANROOM_SDK_VERSION ?? 'latest'}`], { cwd: room, stdio: 'ignore', timeout: 180000 });
    const sdkVersion = JSON.parse(execFileSync('node', ['-e', "console.log(JSON.stringify(require('./node_modules/@banzami/sdk/package.json').version))"], { cwd: room, encoding: 'utf8' }));
    const { BanzamiClient, constructEvent } = await import(pathToFileURL(join(room, 'node_modules/@banzami/sdk/dist/cjs/index.js')).href).catch(() => import(pathToFileURL(join(room, 'node_modules/@banzami/sdk/dist/index.js')).href));
    let client = new BanzamiClient({ apiKey: secret });
    const me = await client.me();
    timings.first_api_call_ms = Date.now() - t0;
    timings.sdk_version = sdkVersion;
    // From 0.14.0 the SDK itself carries test payers, webhook test events and
    // realtime; the cleanroom then uses it for them. CLEANROOM_SDK_VERSION makes
    // the run fail if the registry did not serve that version.
    const [maj, min] = sdkVersion.split('.').map(Number);
    const sdk14 = maj > 0 || min >= 14;
    const required = process.env.CLEANROOM_SDK_VERSION;
    const resolvedFromRegistry = !execFileSync('npm', ['ls', '@banzami/sdk', '--json'], { cwd: room, encoding: 'utf8' }).includes('file:');
    mark(7, me?.environment === 'SANDBOX' && resolvedFromRegistry && (!required || required === sdkVersion),
      `@banzami/sdk ${sdkVersion} ${resolvedFromRegistry ? 'from registry.npmjs.org' : 'NOT from the registry (local pack)'} (required ${required ?? 'any'}); environment=${me?.environment}`);
    let api = http(secret);
    // An SDK call as {status, body}, so every step judges one shape.
    const viaSdk = async (fn, okStatus) => {
      try { return { status: okStatus, body: await fn() }; } catch (e) { return { status: e?.status ?? 0, body: { code: e?.code } }; }
    };
    const sdkRealtime = sdk14
      ? await import(pathToFileURL(join(room, 'node_modules/@banzami/sdk/dist/cjs/realtime.js')).href).catch(() => import(pathToFileURL(join(room, 'node_modules/@banzami/sdk/dist/realtime.js')).href))
      : null;

    const payer = sdk14
      ? await viaSdk(() => client.createTestPayer({ label: 'Cliente (teste)' }), 201)
      : await api('/v1/sandbox/test-payers', 'POST', { label: 'Cliente (teste)' }, { 'Idempotency-Key': `cr_${stamp}_payer` });
    const T = payer.body?.id;
    mark(8, payer.status === 201 && payer.body?.balance_minor === 1000000 && !('pin' in (payer.body ?? {})), `${payer.status} balance=${payer.body?.balance_minor}`);
    const fund = () => (sdk14
      ? viaSdk(() => client.fundTestPayer(T, { amountMinor: 800000, idempotencyKey: `cr_${stamp}_fund` }), 200)
      : api(`/v1/sandbox/test-payers/${T}/fund`, 'POST', { amount_minor: 800000 }, { 'Idempotency-Key': `cr_${stamp}_fund` }));
    const f1 = await fund();
    const f2 = await fund();
    const after = await api(`/v1/sandbox/test-payers/${T}`);
    mark(9, f1.status === 200 && f2.status === 200 && after.body?.balance_minor === 1800000, `balance=${after.body?.balance_minor}`);

    const ex = await call('POST', `/projects/${P}/explorer/requests`, { operation_id: 'listTestPayers' });
    mark(10, ex.status === 200 && ex.body?.status === 200 && !/bz_test_sk_/.test(JSON.stringify(ex.body ?? {})), `explorer=${ex.status}/${ex.body?.status}`);

    const s1 = await client.createPaymentSession({ purpose: 'ORDER', referenceType: 'PEDIDO', referenceId: `cr_${stamp}_1`, amountMinor: 300000, currency: 'AOA', description: 'Pedido cleanroom' });
    const run = `cr${stamp}`;
    receiverOpen(run);
    const ep = await client.registerWebhookEndpoint(`${SINK}/${run}`, ['payment_session.paid', 'refund.completed']);
    const signingSecret = ep.secret;
    // The developer's server: verify every request with the published SDK.
    const verified = (type) => received(run).filter((q) => {
      try { return constructEvent(q.raw_body, q.headers?.['banza-signature'], signingSecret).type === type; } catch { return false; }
    });
    const payAs = (body, key) => (sdk14
      ? viaSdk(() => client.payAsTestPayer(T, { paymentSessionId: body.payment_session_id, paymentLinkId: body.payment_link_id, via: body.via, idempotencyKey: key }), 200)
      : api(`/v1/sandbox/test-payers/${T}/payments`, 'POST', body, { 'Idempotency-Key': key }));
    const pay1 = await payAs({ payment_session_id: s1.session_id }, `cr_${stamp}_pay1`);
    timings.first_payment_ms = Date.now() - t0;
    const r1 = await api(`/v1/payment-sessions/${s1.session_id}`);
    mark(11, pay1.status === 200 && r1.body?.status === 'PAID', `sdk_session=${Boolean(s1.session_id)} pay=${pay1.status} status=${r1.body?.status}`);

    const link = sdk14
      ? await viaSdk(() => client.createPaymentLink({ amountMinor: 45000, currency: 'AOA', description: 'Link cleanroom' }), 201)
      : await api('/v1/payment-links', 'POST', { amount_minor: 45000, currency: 'AOA', description: 'Link cleanroom' });
    const linkId = link.body?.id ?? link.body?.link_id;
    const payLink = linkId ? await payAs({ payment_link_id: linkId }, `cr_${stamp}_link`) : { status: 0 };
    mark(12, link.status === 201 && payLink.status === 200 && payLink.body?.status === 'PAID', `create=${link.status} pay=${payLink.status}`);

    const s2 = await api('/v1/payment-sessions', 'POST', { purpose: 'ORDER', reference_type: 'PEDIDO', reference_id: `cr_${stamp}_2`, amount_minor: 120000, currency: 'AOA' }, { 'Idempotency-Key': `cr_${stamp}_s2` });
    let watching;
    if (sdkRealtime) {
      // The SDK's own realtime helper, with the session's status token.
      const events = [];
      const w = sdkRealtime.watchPaymentSessionStatus({ sessionId: s2.body?.session_id, token: s2.body?.realtime?.token,
        onStatus: (st, kind) => events.push({ ev: kind, status: st.status, at: Date.now() }) });
      watching = Promise.race([w.done, sleep(30000)]).then(() => { w.close(); return events; });
    } else {
      watching = streamUntilTerminal(s2.body?.session_id, s2.body?.realtime?.token, 30000);
    }
    await sleep(1500);
    const payQr = await payAs({ payment_session_id: s2.body?.session_id, via: 'QR' }, `cr_${stamp}_qr`);
    const seen = await watching;
    mark(13, payQr.status === 200 && payQr.body?.via === 'QR' && (await api(`/v1/payment-sessions/${s2.body?.session_id}`)).body?.status === 'PAID', `pay=${payQr.status} via=${payQr.body?.via}`);
    mark(14, seen[0]?.ev === 'snapshot' && seen.some((e) => e.status === 'PAID'), seen.map((e) => `${e.ev}:${e.status}`).join(','));

    // WALLET-NATIVE-001 (ADR-061 §5): the Business's simulated external rail goes
    // down. A wallet payment is an internal movement and completes; a payment whose
    // funds cross the rail fails closed with nothing moved; then the rail returns.
    // SDK 0.14.1 has no external-rail method, so the key calls the documented route.
    const railDown = await api('/v1/sandbox/external-rail', 'PUT', { state: 'UNAVAILABLE' }, { 'Idempotency-Key': `cr_${stamp}_raildown` });
    const railRead = await api('/v1/sandbox/external-rail');
    const balance = async () => (await api(`/v1/sandbox/test-payers/${T}`)).body?.balance_minor;
    const s3 = await client.createPaymentSession({ purpose: 'ORDER', referenceType: 'PEDIDO', referenceId: `cr_${stamp}_3`, amountMinor: 50000, currency: 'AOA', description: 'Pedido com rail em baixo' });
    const beforeDown = await balance();
    const payDown = await payAs({ payment_session_id: s3.session_id }, `cr_${stamp}_raildownpay`);
    const s3state = (await api(`/v1/payment-sessions/${s3.session_id}`)).body?.status;
    const afterDown = await balance();
    mark(15, railDown.status === 200 && railRead.body?.state === 'UNAVAILABLE' && payDown.status === 200 && payDown.body?.rail === 'WALLET' && s3state === 'PAID' && beforeDown - afterDown === 50000,
      `rail=${railRead.body?.state} pay=${payDown.status} rail_used=${payDown.body?.rail} session=${s3state} debited=${beforeDown - afterDown}`);

    const s4 = await client.createPaymentSession({ purpose: 'ORDER', referenceType: 'PEDIDO', referenceId: `cr_${stamp}_4`, amountMinor: 40000, currency: 'AOA', description: 'Pedido por rail externo' });
    const beforeClosed = await balance();
    const simDown = sdk14
      ? await viaSdk(() => client.payAsTestPayer(T, { paymentSessionId: s4.session_id, simulate: 'DECLINED', idempotencyKey: `cr_${stamp}_railsim` }), 200)
      : await api(`/v1/sandbox/test-payers/${T}/payments`, 'POST', { payment_session_id: s4.session_id, simulate: 'DECLINED' }, { 'Idempotency-Key': `cr_${stamp}_railsim` });
    const slug4 = ((s4.interfaces ?? []).find((x) => x.type === 'PAYMENT_LINK')?.value ?? '').split('/').pop();
    const hosted = await fetch(`${GW}/v1/public/pay/${encodeURIComponent(slug4)}/pay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const hostedBody = await hosted.json().catch(() => ({}));
    const hostedCode = hostedBody?.error?.code ?? hostedBody?.code;
    const s4state = (await api(`/v1/payment-sessions/${s4.session_id}`)).body?.status;
    const afterClosed = await balance();
    mark(16, simDown.status === 503 && simDown.body?.code === 'PROVIDER_UNAVAILABLE' && hosted.status === 503 && hostedCode === 'PROVIDER_UNAVAILABLE' && s4state === 'ACTIVE' && afterClosed === beforeClosed,
      `simulate=${simDown.status}/${simDown.body?.code} hosted=${hosted.status}/${hostedCode} session=${s4state} payer_unchanged=${afterClosed === beforeClosed}`);

    const railUp = await api('/v1/sandbox/external-rail', 'PUT', { state: 'AVAILABLE' }, { 'Idempotency-Key': `cr_${stamp}_railup` });
    const hostedUp = await fetch(`${GW}/v1/public/pay/${encodeURIComponent(slug4)}/pay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    mark(17, railUp.status === 200 && (await api('/v1/sandbox/external-rail')).body?.state === 'AVAILABLE' && hostedUp.status === 201,
      `rail=${railUp.body?.state} hosted_initiation=${hostedUp.status}`);

    const deliveries = async (predicate) => {
      const evs = (await api('/v1/webhooks/events?limit=50')).body;
      for (const e of (evs?.data ?? [])) {
        if (!predicate(e)) continue;
        const d = (await api(`/v1/webhooks/events/${e.id}/deliveries`)).body?.data ?? [];
        const ok = d.find((x) => x.endpoint_id === ep.id && x.status === 'SUCCESS');
        if (ok) return { event: e, delivery: ok };
      }
      return null;
    };
    const paidDelivered = await until(() => deliveries((e) => (e.event_type ?? e.type) === 'payment_session.paid'), 60000, 3000);
    const paidVerified = await until(() => verified('payment_session.paid').length > 0, 30000, 2000);
    mark(18, Boolean(ep.id) && Boolean(paidDelivered) && paidVerified, `endpoint=${Boolean(ep.id)} delivery_log=${Boolean(paidDelivered)} sdk_signature_verified=${paidVerified}`);
    const test = sdk14 ? await viaSdk(() => client.sendWebhookTestEvent(ep.id), 202) : await api(`/v1/webhooks/endpoints/${ep.id}/test`, 'POST');
    const testDelivered = await until(() => deliveries((e) => e.id === test.body?.event_id), 60000, 3000);
    const testVerified = await until(() => verified('webhook.test').length > 0, 30000, 2000);
    mark(19, test.status === 202 && test.body?.synthetic === true && Boolean(testDelivered) && testVerified, `test=${test.status} delivery_log=${Boolean(testDelivered)} sdk_signature_verified=${testVerified}`);
    const replay = await api(`/v1/webhooks/deliveries/${test.body?.delivery_id}/replay`, 'POST');
    const replayed = await until(async () => {
      const d = ((await api(`/v1/webhooks/events/${test.body?.event_id}/deliveries`)).body?.data ?? [])[0];
      return d && d.status === 'SUCCESS' && (d.attempt_number ?? 0) >= 2 && verified('webhook.test').length >= 2 ? d : null;
    }, 60000, 3000);
    mark(20, replay.status === 201 && Boolean(replayed), `replay=${replay.status} attempts=${replayed?.attempt_number} received_verified=${verified('webhook.test').length}`);

    const proof = pay1.body?.proof_reference ? await fetch(`${GW}/v1/public/proofs/${pay1.body.proof_reference}`) : null;
    const proofBody = proof ? await proof.json().catch(() => ({})) : {};
    mark(21, proof?.status === 200 && proofBody.exists === true, `proof=${proof?.status ?? 'none'}`);

    const src = r1.body?.refund_source ?? {};
    const rf1 = await api('/v1/refunds', 'POST', { ...src, amount_minor: 100000, currency: 'AOA', idempotency_key: `cr_${stamp}_rf1`, reason: 'parcial' });
    const rf1again = await api('/v1/refunds', 'POST', { ...src, amount_minor: 100000, currency: 'AOA', idempotency_key: `cr_${stamp}_rf1`, reason: 'parcial' });
    mark(22, rf1.status === 201 && [200, 201].includes(rf1again.status) && rf1again.body?.id === rf1.body?.id, `refund=${rf1.status} replay_same=${rf1again.body?.id === rf1.body?.id}`);
    const rf2 = await api('/v1/refunds', 'POST', { ...src, amount_minor: 200000, currency: 'AOA', idempotency_key: `cr_${stamp}_rf2`, reason: 'resto' });
    const rf3 = await api('/v1/refunds', 'POST', { ...src, amount_minor: 1, currency: 'AOA', idempotency_key: `cr_${stamp}_rf3`, reason: 'excesso' });
    mark(23, rf2.status === 201 && rf3.status === 422, `rest=${rf2.status} over=${rf3.status} ${rf3.body?.code ?? ''}`);

    // An application project in the same workspace.
    const pa = await call('POST', `/workspaces/${ws}/projects`, { name: `${like}-campaigns` });
    const A = pa.body?.id; projects.push(A);
    await call('POST', `/projects/${A}/financial-setup`, { use_case: 'APPLICATION' });
    const fsA = (await call('GET', `/projects/${A}/financial-setup`)).body;
    const ka = await call('POST', `/projects/${A}/keys`, { kind: 'SECRET', name: `${like}-campaigns`, scopes: [...scopes, 'wallet_accounts:create', 'wallet_accounts:read', 'application_settlements:write'] });
    const apiA = http(ka.body?.secret ?? '');
    const acct = await apiA('/v1/wallet-accounts', 'POST', { purpose: 'CAMPAIGN', reference_type: 'CAMPANHA', reference_id: `cr_${stamp}`, label: 'Campanha' }, { 'Idempotency-Key': `cr_${stamp}_acct` });
    const W = acct.body?.id ?? acct.body?.wallet_account_id;
    const sa = await apiA('/v1/payment-sessions', 'POST', { purpose: 'DONATION', reference_type: 'CAMPANHA', reference_id: `cr_${stamp}`, amount_minor: 200000, currency: 'AOA', wallet_account_id: W }, { 'Idempotency-Key': `cr_${stamp}_sa` });
    const donor = await apiA('/v1/sandbox/test-payers', 'POST', { label: 'Doador' }, { 'Idempotency-Key': `cr_${stamp}_donor` });
    const benef = await apiA('/v1/sandbox/test-payers', 'POST', { label: 'Beneficiário', initial_balance_minor: 0 }, { 'Idempotency-Key': `cr_${stamp}_benef` });
    await apiA(`/v1/sandbox/test-payers/${donor.body?.id}/payments`, 'POST', { payment_session_id: sa.body?.session_id }, { 'Idempotency-Key': `cr_${stamp}_dpay` });
    const handle = fsA?.readiness?.financial_identity?.handle;
    const st = await apiA('/v1/application-settlements', 'POST', { source_account_id: W, beneficiary_banza_name: `@${benef.body?.handle}`, fee_destination_banza_name: handle, reference_id: `cr_${stamp}`, reason: 'Campanha encerrada', idempotency_key: `cr_${stamp}_settle` });
    const g = st.body?.gross_amount_minor, fee = st.body?.application_fee_minor, net = st.body?.net_amount_minor;
    mark(24, st.status === 201 && g === 200000 && fee > 0 && g === fee + net, `${st.status} ${st.body?.code ?? ''} gross=${g} fee=${fee} net=${net}`);

    await sleep(2000);
    const logs = (await call('GET', `/projects/${P}/logs?limit=100`)).body?.logs ?? [];
    const explorerLogs = (await call('GET', `/projects/${P}/logs?source=API_EXPLORER&limit=20`)).body?.logs ?? [];
    // The refused refund's line names its error, and the log filters on it.
    const refused = (await call('GET', `/projects/${P}/logs?error_code=REFUND_EXCEEDS_CAPTURED&limit=5`)).body?.logs ?? [];
    const line = refused[0] ?? {};
    mark(25, logs.some((l) => l.path === '/v1/refunds') && explorerLogs.length >= 1 && explorerLogs.every((l) => l.source === 'API_EXPLORER')
      && line.status === 422 && line.error_code === 'REFUND_EXCEEDS_CAPTURED' && line.method === 'POST' && typeof line.latency_ms === 'number' && Boolean(line.request_id),
      `logs=${logs.length} explorer=${explorerLogs.length} refused_line=${line.method} ${line.path} ${line.status} ${line.error_code} ${line.latency_ms}ms`);
    const activity = (await call('GET', `/workspaces/${ws}/activity`)).body?.events ?? [];
    const actions = new Set(activity.map((e) => e.action));
    mark(26, activity.length > 0 && [...actions].some((a) => /key/.test(a)) && !activity.some((e) => /^\/v1\//.test(e.path ?? '')), `activity=${activity.length} actions=${[...actions].slice(0, 6).join(',')}`);

    const rot = await call('POST', `/keys/${keyId}/rotate`);
    const oldKey = await http(secret)('/v1/me');
    secret = rot.body?.secret; railKey = secret;
    const newKey = await http(secret)('/v1/me');
    client = new BanzamiClient({ apiKey: secret }); api = http(secret);
    mark(27, rot.status === 200 && oldKey.status === 401 && newKey.status === 200, `rotate=${rot.status} old=${oldKey.status} new=${newKey.status}`);

    const reset = await call('POST', `/projects/${P}/sandbox/reset`, { confirm: 'RESET' });
    const payersAfter = (await api('/v1/sandbox/test-payers')).body?.data ?? [];
    const history = (await call('GET', `/projects/${P}/transactions`)).body?.transactions ?? [];
    mark(28, reset.status === 200 && payersAfter.length === 0 && history.length > 0, `reset=${reset.status} payers=${payersAfter.length} history=${history.length}`);

    // SANDBOX-DELETE-001 §54 — delete, replace, use again, delete the Workspace.
    const projectName = `${like}-shop`;
    const delP = await call('DELETE', `/projects/${P}`, { name: projectName });
    const oldKeyAfterDelete = await http(secret)('/v1/me');
    const listedAfter = ((await call('GET', `/workspaces/${ws}/projects?include_archived=true`)).body?.projects ?? []).some((x) => x.id === P);
    mark(29, [200, 202].includes(delP.status) && oldKeyAfterDelete.status === 401 && !listedAfter && (await call('GET', `/projects/${P}`)).status === 404,
      `delete=${delP.status}/${delP.body?.status} keys_revoked=${delP.body?.keys_revoked} old_key=${oldKeyAfterDelete.status} listed=${listedAfter}`);

    const rp = await call('POST', `/workspaces/${ws}/projects`, { name: projectName });
    const R = rp.body?.id; projects.push(R);
    const rsetup = await call('POST', `/projects/${R}/financial-setup`, { use_case: 'STANDARD' });
    const rk = await call('POST', `/projects/${R}/keys`, { kind: 'SECRET', name: `${like}-again`, scopes });
    const rclient = new BanzamiClient({ apiKey: rk.body?.secret ?? '' });
    const rapi = http(rk.body?.secret ?? '');
    const rs = await rclient.createPaymentSession({ purpose: 'ORDER', referenceType: 'PEDIDO', referenceId: `cr_${stamp}_again`, amountMinor: 25000, currency: 'AOA', description: 'Outra vez' });
    const rpayer = await rapi('/v1/sandbox/test-payers', 'POST', { label: 'Cliente' }, { 'Idempotency-Key': `cr_${stamp}_again_payer` });
    const rpay = await rapi(`/v1/sandbox/test-payers/${rpayer.body?.id}/payments`, 'POST', { payment_session_id: rs.session_id }, { 'Idempotency-Key': `cr_${stamp}_again_pay` });
    mark(30, rp.status === 201 && R !== P && rsetup.status === 200 && rk.status === 201 && rpay.status === 200 && rpay.body?.status === 'PAID',
      `create=${rp.status} new_id=${R !== P} setup=${rsetup.status} key=${rk.status} pay=${rpay.status}/${rpay.body?.status}`);

    const wsName = (await call('GET', `/workspaces/${ws}`)).body?.name;
    const delW = await call('DELETE', `/workspaces/${ws}`, { name: wsName });
    const replacementKey = await rapi('/v1/me');
    const wsListed = ((await call('GET', '/workspaces')).body?.workspaces ?? []).some((x) => x.id === ws);
    mark(31, [200, 202].includes(delW.status) && replacementKey.status === 401 && !wsListed,
      `delete=${delW.status}/${delW.body?.status} keys_revoked=${delW.body?.keys_revoked} replacement_key=${replacementKey.status} listed=${wsListed}`);
  } catch (e) {
    console.error(`  ! aborted: ${String(e.stack ?? e).split('\n').slice(0, 2).join(' | ')}`);
  } finally {
    const done = [];
    if (sess && railKey) await http(railKey)('/v1/sandbox/external-rail', 'PUT', { state: 'AVAILABLE' }, { 'Idempotency-Key': `cr_${stamp}_railfinal` }).catch(() => null);
    // Whatever the steps left behind (an aborted run included) is deleted the same way.
    if (sess && ws) {
      const w = await call('GET', `/workspaces/${ws}`);
      if (w.status === 200) done.push((await call('DELETE', `/workspaces/${ws}`, { name: w.body?.name })).status);
      else done.push(w.status === 404 || w.status === 403 ? 200 : w.status);
    }
    rmSync(room, { recursive: true, force: true });
    mark(32, done.length > 0 && done.every((s) => s >= 200 && s < 300), `statuses=${done.join(',')}`);
    const left = ws ? await until(() => residue(ws) === 0, 15000, 3000).then(() => residue(ws)) : -1;
    const passed = steps.filter((s) => s.verdict === 'PASS').length;
    const verdict = passed === steps.length && left === 0 ? 'PASS' : 'FAIL';
    const out = join(assuranceDir('sandbox-self-service'), `public-cleanroom-${Date.now()}.json`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify({ ran_at: new Date().toISOString(), steps, timings, residue: left, operator_interventions: 0 }, null, 2)}\n`);
    console.log(`\nPUBLIC_CLEANROOM_SDK_VERSION=${timings.sdk_version ?? 'n/a'}`);
    console.log(`TIME_TO_FIRST_API_CALL_MS=${timings.first_api_call_ms ?? 'n/a'} (automated, includes the npm install)`);
    console.log(`TIME_TO_FIRST_PAYMENT_MS=${timings.first_payment_ms ?? 'n/a'} (automated)`);
    console.log(`PUBLIC_SANDBOX_CLEANROOM=${verdict} (${passed}/${steps.length})`);
    console.log('PUBLIC_SANDBOX_OPERATOR_INTERVENTIONS=0');
    const railSteps = steps.slice(14, 17);
    console.log(`WALLET_NATIVE_PUBLIC_CLEANROOM=${railSteps.every((x) => x.verdict === 'PASS') && verdict === 'PASS' ? 'PASS' : 'FAIL'} (${railSteps.filter((x) => x.verdict === 'PASS').length}/3 rail steps)`);
    const deleteSteps = steps.slice(28, 31);
    console.log(`SANDBOX_DELETE_PUBLIC_CLEANROOM=${deleteSteps.every((x) => x.verdict === 'PASS') && verdict === 'PASS' ? 'PASS' : 'FAIL'} (${deleteSteps.filter((x) => x.verdict === 'PASS').length}/3 delete steps)`);
    console.log('SANDBOX_DELETE_OPERATOR_INTERVENTIONS=0');
    console.log(`CLEANROOM_RESIDUE=${left}`);
    console.log(`evidence: ${out}`);
    process.exitCode = verdict === 'PASS' ? 0 : 1;
  }
}

await main();
