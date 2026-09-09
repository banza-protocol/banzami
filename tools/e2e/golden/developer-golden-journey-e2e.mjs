#!/usr/bin/env node
/**
 * developer-golden-journey-e2e.mjs — the external developer journey, end to end,
 * against the deployed Sandbox.
 *
 * This is the journey a third-party application actually walks: a Console-issued
 * developer key, bound to a project, creating a payment the operator can settle,
 * and a signed webhook telling the application it happened. Every assertion runs
 * against the deployed public Gateway over the public internet. Nothing is
 * stubbed, no financial state is written directly, and no step is replaced by an
 * internal shortcut.
 *
 * WHAT THE INTERNAL SURFACE IS USED FOR, AND WHY
 *
 * Three provisioning calls go to developer-api's /internal routes (which 404 at
 * the public edge and are reached from inside the host): create a fixture
 * project, bind it to a Sandbox payee, and issue a key carrying payment scopes.
 * They stand in for operator actions a real integrator would have performed
 * through the Console, and they exist so the suite can provision ISOLATED
 * tenants — proving cross-project isolation needs a second project that no
 * human created. The credential path itself is never faked: the key issued here
 * is a real key, and every payment assertion below goes through the public
 * Gateway exactly as an external developer's would.
 *
 * Settlement uses the Sandbox confirm rail. That is the canonical test rail for
 * this environment, not a bypass — no ledger row is written by this suite.
 *
 * SECRETS: no API key, webhook secret, merchant token or signature is printed,
 * persisted or written to evidence. Only booleans, statuses and lengths.
 *
 * Run: BANZAMI_E2E=RUN node tools/e2e/golden/developer-golden-journey-e2e.mjs
 */
import { createHmac, randomUUID, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeAssuranceResult } from '../lib/assurance-output.mjs';
import {
  req, provisionMerchant, newRunId, assertSandboxAndBuild, assertExplicitRun, assertNominal,
} from '../payments/harness.mjs';

assertExplicitRun(process.env.BANZAMI_E2E);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const GW = process.env.BANZAMI_E2E_API_BASE || 'https://sandbox-api.banzami.com';
const SSH = process.env.BANZAMI_SSH || 'root@217.160.9.248';
const SINK = process.env.BANZAMI_WEBHOOK_SINK || 'https://sandbox-webhook.banzami.com';
const SINK_CONTAINER = 'banzami-webhook-sink';
const AMOUNT = 250_000; // 2 500,00 Kz — nominal, inside the harness ceiling
assertNominal(AMOUNT);

const startedAt = new Date().toISOString();
const results = [];
const rec = (id, ok, note = '') => {
  results.push({ id, pass: !!ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${note ? ' — ' + note : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs a command inside a container on the sandbox host, base64'd so that
 *  nested ssh/docker/sh quoting cannot corrupt the payload. */
function inContainer(container, script) {
  const b64 = Buffer.from(script, 'utf8').toString('base64');
  return execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', SSH,
    `docker exec ${container} sh -c "echo ${b64} | base64 -d | sh"`],
    { encoding: 'utf8', timeout: 90_000 }).trim();
}

/** developer-api /internal — operator provisioning. The internal key is read
 *  from the running service's own environment and never leaves the host. */
function devInternal(path, body) {
  const script = [
    `K=$(tr '\\0' '\\n' < /proc/1/environ | grep '^DEVELOPER_INTERNAL_KEY=' | cut -d= -f2-)`,
    `printf '%s' '${JSON.stringify(body)}' > /tmp/gj.json`,
    `wget -qO- --header='Content-Type: application/json' --header="X-Internal-Key: $K" ` +
      `--post-file=/tmp/gj.json 'http://127.0.0.1:8086${path}'`,
  ].join('; ');
  const devApi = execFileSync('ssh', ['-o', 'BatchMode=yes', SSH,
    `docker ps --format '{{.Names}}' | grep developer-api | head -1`], { encoding: 'utf8' }).trim();
  return JSON.parse(inContainer(devApi, script));
}

/** The sink's control plane is deliberately not public. */
function sinkAdmin(path, postData) {
  const script = postData
    ? `printf '%s' '${JSON.stringify(postData)}' > /tmp/s.json; wget -qO- --header='content-type: application/json' --post-file=/tmp/s.json 'http://127.0.0.1:8090${path}'`
    : `wget -qO- 'http://127.0.0.1:8090${path}'`;
  return JSON.parse(inContainer(SINK_CONTAINER, script));
}

async function waitForRequests(cap, atLeast, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = { count: 0, requests: [] };
  while (Date.now() < deadline) {
    try { last = sinkAdmin(`/admin/requests?run=${cap}`); } catch { /* keep waiting */ }
    if (last.count >= atLeast) return last;
    await sleep(3000);
  }
  return last;
}

// ── Money-safety boundary ────────────────────────────────────────────────────
const { environment, build } = await assertSandboxAndBuild(process.env.BANZAMI_EXPECT_COMMIT);
console.log(`runtime build: ${build}  environment: ${environment}`);
console.log(`gateway: ${GW}\n`);

const runId = newRunId();
const actor = randomUUID();          // fixture operator identity (UUID-typed)
const tag = runId.slice(0, 8);

// ── 1. Operator provisioning: two ISOLATED tenants ───────────────────────────
// B exists solely so isolation is proven against a real second tenant rather
// than asserted.
const mA = await provisionMerchant(runId, 'gja');
const mB = await provisionMerchant(runId, 'gjb');

const projA = devInternal('/internal/v1/fixture-projects', { name: `gj-a-${tag}`, created_by: actor });
const projB = devInternal('/internal/v1/fixture-projects', { name: `gj-b-${tag}`, created_by: actor });
rec('GJ.provision.projects', !!projA.project_id && !!projB.project_id && projA.project_id !== projB.project_id);

const bindA = devInternal(`/internal/v1/projects/${projA.project_id}/binding`, {
  merchant_id: mA.merchantId, wallet_id: mA.walletId, wallet_account_id: mA.walletAccountId, actor_user_id: actor,
});
const bindB = devInternal(`/internal/v1/projects/${projB.project_id}/binding`, {
  merchant_id: mB.merchantId, wallet_id: mB.walletId, wallet_account_id: mB.walletAccountId, actor_user_id: actor,
});
rec('GJ.binding.active', bindA.state === 'ACTIVE' && bindB.state === 'ACTIVE', `${bindA.state}/${bindB.state}`);

// A second bind on the same project must not create a second payee.
let dupBindRejected = false;
try {
  devInternal(`/internal/v1/projects/${projA.project_id}/binding`, {
    merchant_id: mB.merchantId, wallet_id: mB.walletId, wallet_account_id: mB.walletAccountId, actor_user_id: actor,
  });
} catch { dupBindRejected = true; }
rec('GJ.binding.immutable', dupBindRejected, 'a bound project cannot be rebound to another payee');

const PAY_SCOPES = ['identity:read', 'payment_sessions:read', 'payment_sessions:write'];
const keyA = devInternal(`/internal/v1/projects/${projA.project_id}/fixture-keys`, { name: `gj-a`, scopes: PAY_SCOPES, created_by: actor });
const keyB = devInternal(`/internal/v1/projects/${projB.project_id}/fixture-keys`, { name: `gj-b`, scopes: PAY_SCOPES, created_by: actor });
const keyNoPay = devInternal(`/internal/v1/projects/${projA.project_id}/fixture-keys`, { name: `gj-a-noscope`, scopes: ['identity:read'], created_by: actor });
const A = keyA.secret, B = keyB.secret, NOPAY = keyNoPay.secret;
rec('GJ.key.sandbox-prefix', typeof A === 'string' && A.startsWith('bz_test_'), `bz_test_ prefix, len ${A?.length || 0}`);

// ── 2. First call: identity ──────────────────────────────────────────────────
{
  const me = await req('GET', '/v1/me', { token: A, base: GW });
  const b = me.body || {};
  rec('GJ.identity.ok', me.status === 200 && b.environment === 'SANDBOX' && b.key_status === 'active', `→ ${me.status}, env=${b.environment}`);
  rec('GJ.identity.scopes', Array.isArray(b.scopes) && PAY_SCOPES.every((s) => b.scopes.includes(s)));
  // /v1/me stays minimal: the bound payee is authorization state, not identity.
  const leak = /(merchant_id|wallet_id|wallet_account|core-api|postgres|172\.\d|217\.160)/i.test(JSON.stringify(b));
  rec('GJ.identity.no-internal-leak', !leak, 'no payee/core/topology ids on /v1/me');
}

// ── 3. Payment session ───────────────────────────────────────────────────────
const idem = `${runId}:session`;
let session, linkSlug, qrPayload, payRef;
{
  const body = { amount_minor: AMOUNT, currency: 'AOA', description: `Golden journey ${tag}` };
  const r = await req('POST', '/v1/payment-sessions', { token: A, base: GW, idem, body });
  session = r.body || {};
  rec('GJ.session.created', r.status === 201, `→ ${r.status}`);
  rec('GJ.session.amount-exact', session.amount_minor === AMOUNT && session.currency === 'AOA', `${session.amount_minor} ${session.currency}`);

  const ifaces = Array.isArray(session.interfaces) ? session.interfaces : [];
  const link = ifaces.find((i) => i.type === 'PAYMENT_LINK');
  const deep = ifaces.find((i) => i.type === 'DEEP_LINK');
  const qr = ifaces.find((i) => i.type === 'DYNAMIC_QR');
  rec('GJ.session.interfaces-issued', !!link && !!deep && !!qr, ifaces.map((i) => i.type).join(','));
  // The canonical payer surface is pay.banzami.com/pay/<slug> (Banzami ADR-052);
  // this used to assert the older /public/pay/<slug> shape the Gateway emitted
  // before PAY_BASE_URL existed, and kept failing against a link that is
  // correct. What the assertion is actually for is that a developer can hand the
  // value straight to a payer — an absolute https URL, no id-to-URL
  // reconstruction — so that is what it checks, with the path shape pinned so a
  // regression back to an API origin is still caught.
  rec('GJ.session.link-is-usable-url',
      !!link && /^https:\/\/[^/]+\/pay\/[A-Za-z0-9]+$/.test(link.value),
      link ? `${new URL(link.value).origin}/pay/…` : 'no PAYMENT_LINK interface');
  rec('GJ.session.qr-payload-signed', !!qr && typeof qr.value === 'string' && qr.value.length > 40 && !!qr.qr_url);
  linkSlug = link ? link.value.split('/').pop() : null;
  qrPayload = qr?.value;

  // Idempotent replay: same key + same body must not create a second session.
  const again = await req('POST', '/v1/payment-sessions', { token: A, base: GW, idem, body });
  rec('GJ.session.idempotent-replay', again.status === 201 || again.status === 200, `→ ${again.status}`);
  rec('GJ.session.idempotent-same-resource', !!session.session_id && again.body?.session_id === session.session_id, 'replay returns the same session');

  // Same key, materially different body → conflict, never a silent second charge.
  const conflict = await req('POST', '/v1/payment-sessions', {
    token: A, base: GW, idem, body: { ...body, amount_minor: AMOUNT + 1 },
  });
  rec('GJ.session.idempotency-conflict', conflict.status === 409, `→ ${conflict.status}`);

  const read = await req('GET', `/v1/payment-sessions/${session.session_id}`, { token: A, base: GW });
  rec('GJ.session.read-own', read.status === 200 && read.body?.session_id === session.session_id, `→ ${read.status}`);
}

// ── 4. Authority: the client never names its own payee ───────────────────────
{
  // Naming another tenant's merchant/wallet must not move authority.
  const forged = await req('POST', '/v1/payment-sessions', {
    token: A, base: GW, idem: `${runId}:forge`,
    body: {
      amount_minor: AMOUNT, currency: 'AOA', description: 'forged payee',
      merchant_id: mB.merchantId, wallet_id: mB.walletId, wallet_account_id: mB.walletAccountId,
    },
  });
  const creditedElsewhere = forged.status === 201 &&
    JSON.stringify(forged.body || {}).includes(mB.merchantId);
  rec('GJ.authority.client-cannot-name-payee', !creditedElsewhere,
    forged.status === 201 ? 'created, but bound payee was used (client input ignored)' : `→ ${forged.status}`);

  // Cross-project read must not be possible.
  const cross = await req('GET', `/v1/payment-sessions/${session.session_id}`, { token: B, base: GW });
  rec('GJ.isolation.cross-project-read-denied', cross.status === 404 || cross.status === 403, `→ ${cross.status}`);

  // A key without the payment scope must not reach the payment surface.
  const noScope = await req('POST', '/v1/payment-sessions', {
    token: NOPAY, base: GW, idem: `${runId}:noscope`, body: { amount_minor: AMOUNT, currency: 'AOA' },
  });
  rec('GJ.scope.missing-scope-denied', noScope.status === 403 || noScope.status === 401, `→ ${noScope.status}`);

  // Garbage and live-prefixed credentials are refused.
  const bogus = await req('GET', '/v1/me', { token: 'bz_test_sk_not_a_real_key_000000000000', base: GW });
  rec('GJ.auth.bogus-key-denied', bogus.status === 401 || bogus.status === 403, `→ ${bogus.status}`);
  const unauth = await req('POST', '/v1/payment-sessions', { base: GW, body: { amount_minor: AMOUNT, currency: 'AOA' } });
  rec('GJ.auth.unauthenticated-denied', unauth.status === 401, `→ ${unauth.status}`);
}

// ── 5. Validation ────────────────────────────────────────────────────────────
for (const [label, body, want] of [
  ['zero-amount', { amount_minor: 0, currency: 'AOA' }, 400],
  ['negative-amount', { amount_minor: -100, currency: 'AOA' }, 400],
  ['unsupported-currency', { amount_minor: AMOUNT, currency: 'USD' }, 400],
]) {
  const r = await req('POST', '/v1/payment-sessions', { token: A, base: GW, idem: `${runId}:${label}`, body });
  rec(`GJ.valid.${label}`, r.status === want, `→ ${r.status}`);
}

// ── 6. The payer's view ──────────────────────────────────────────────────────
{
  const pub = await req('GET', `/public/pay/${linkSlug}`, { base: GW });
  rec('GJ.payer.link-public-no-auth', pub.status === 200, `→ ${pub.status}`);
  const txt = JSON.stringify(pub.body || {});
  rec('GJ.payer.no-internal-ids', !/(wallet_account|core-api|merchant_id"\s*:\s*"m_)/i.test(txt));
  const st = await req('GET', `/public/pay/${linkSlug}/status`, { base: GW });
  rec('GJ.payer.status-before-payment', st.status === 200 && st.body?.paid === false, JSON.stringify(st.body || {}));

  const qrPng = await req('GET', `/v1/payment-sessions/${session.session_id}/qr`, { token: A, base: GW });
  rec('GJ.payer.qr-renderable', qrPng.status === 200, `→ ${qrPng.status}`);
}

// ── 7. Webhook endpoint, then settlement ─────────────────────────────────────
// The capability is a per-run random token chosen here, so runs cannot observe
// each other and nothing about the sink is enumerable.
const cap = randomBytes(16).toString('hex');
sinkAdmin(`/admin/configure?run=${cap}`, { status: 200 });
let whSecret;
{
  const ep = await req('POST', '/v1/webhooks/endpoints', {
    token: mA.token, base: GW,
    body: { url: `${SINK}/receive/${cap}`, events: ['payment_link.paid'] },
  });
  whSecret = ep.body?.secret;
  rec('GJ.webhook.endpoint-registered', ep.status === 201 && !!whSecret, `→ ${ep.status}`);
}

{
  // The payer's real Sandbox rail is two steps, exactly as a wallet would drive
  // it: initiate the payment against the link, then confirm THAT payment by its
  // provider reference. Confirming a reference that was never initiated is not a
  // shortcut, it is a different (and unsupported) operation.
  const init = await req('POST', `/public/pay/${linkSlug}/pay`, { base: GW, body: {} });
  payRef = init.body?.external_ref;
  rec('GJ.settle.payer-initiated', init.status === 201 && !!payRef, `→ ${init.status}`);

  const confirm = await req('POST', `/public/pay/${linkSlug}/test-confirm?ref=${encodeURIComponent(payRef || '')}`, { base: GW });
  rec('GJ.settle.sandbox-confirm', confirm.status === 200 || confirm.status === 201, `→ ${confirm.status}`);

  const st = await req('GET', `/public/pay/${linkSlug}/status`, { base: GW });
  rec('GJ.settle.status-reflects-payment', st.body?.paid === true, JSON.stringify(st.body || {}).slice(0, 80));
}

// ── 8. The application learns about it — signed, verifiable, once ────────────
{
  const got = await waitForRequests(cap, 1, 120_000);
  const first = got.requests?.[0];
  rec('GJ.webhook.delivered', got.count >= 1, `${got.count} request(s)`);

  if (first) {
    const sig = first.headers?.['banza-signature'] || '';
    rec('GJ.webhook.signature-header', !!sig, 'Banza-Signature present');

    // Verify independently, the way an integrator must: HMAC over "<t>." + RAW body.
    const m = /t=(\d+),\s*v1=([a-f0-9]+)/i.exec(sig) || [];
    const [, ts, digest] = m;
    const expected = ts && createHmac('sha256', whSecret).update(`${ts}.${first.raw_body}`).digest('hex');
    rec('GJ.webhook.signature-verifies-independently', !!digest && expected === digest);

    // A re-serialised body must NOT verify — this is the mistake integrators make.
    let reserialised = null;
    try { reserialised = JSON.stringify(JSON.parse(first.raw_body)); } catch { /* ignore */ }
    const reSig = reserialised && createHmac('sha256', whSecret).update(`${ts}.${reserialised}`).digest('hex');
    rec('GJ.webhook.raw-body-required', reserialised === first.raw_body || reSig !== digest,
      'signing is over the bytes on the wire, not a re-encoding');

    const payload = JSON.parse(first.raw_body || '{}');
    rec('GJ.webhook.event-identity', !!(payload.id || payload.event_id), 'event carries a stable id for deduplication');
    rec('GJ.webhook.no-secret-in-transit', !/secret|api_key|bz_test_sk/i.test(first.raw_body || ''));
  } else {
    rec('GJ.webhook.signature-header', false, 'nothing delivered');
    rec('GJ.webhook.signature-verifies-independently', false, 'nothing delivered');
    rec('GJ.webhook.raw-body-required', false, 'nothing delivered');
    rec('GJ.webhook.event-identity', false, 'nothing delivered');
    rec('GJ.webhook.no-secret-in-transit', false, 'nothing delivered');
  }
}

// ── 9. Settling twice must not pay twice ─────────────────────────────────────
{
  const evs = (r) => (r.body?.data ?? []).length;
  const before = await req('GET', `/v1/webhooks/events`, { token: mA.token, base: GW });
  const countBefore = evs(before);
  // Re-confirming the SAME reference must not pay twice, and the link is no
  // longer active for a fresh payment either.
  const again = await req('POST', `/public/pay/${linkSlug}/test-confirm?ref=${encodeURIComponent(payRef || '')}`, { base: GW });
  const reInit = await req('POST', `/public/pay/${linkSlug}/pay`, { base: GW, body: {} });
  rec('GJ.settle.replay-no-double-pay', reInit.status >= 400, `re-initiate → ${reInit.status} (confirm replay → ${again.status})`);
  const after = await req('GET', `/v1/webhooks/events`, { token: mA.token, base: GW });
  const countAfter = evs(after);
  rec('GJ.settle.no-second-business-event', countBefore > 0 && countAfter === countBefore, `${countBefore} → ${countAfter}`);
}

// ── 10. Key revocation is immediate ──────────────────────────────────────────
{
  const before = await req('GET', '/v1/me', { token: B, base: GW });
  devInternal(`/internal/v1/fixture-keys/${keyB.id}/revoke`, { actor_user_id: actor });
  await sleep(1500);
  const after = await req('GET', '/v1/me', { token: B, base: GW });
  rec('GJ.key.revoked-immediately', before.status === 200 && (after.status === 401 || after.status === 403),
    `${before.status} → ${after.status}`);
  const pay = await req('POST', '/v1/payment-sessions', { token: B, base: GW, idem: `${runId}:revoked`, body: { amount_minor: AMOUNT, currency: 'AOA' } });
  rec('GJ.key.revoked-cannot-pay', pay.status === 401 || pay.status === 403, `→ ${pay.status}`);
}

// ── Result ───────────────────────────────────────────────────────────────────
const passed = results.filter((r) => r.pass).length;
const total = results.length;
if (total === 0) { console.error('\nno assertions ran — refusing to report a vacuous pass'); process.exit(2); }

const summary = {
  suite: 'BANZAMI DEVELOPERS × DOA GOLDEN JOURNEY (developer key)',
  environment, build, gateway: GW,
  generated_at: new Date().toISOString(),
  total, passed, failed: total - passed,
  promotable: passed === total,
  assertions: results,
};
// Generated evidence goes OUTSIDE the worktree — see tools/e2e/lib/assurance-output.mjs.
// This used to overwrite evidence/assurance/golden/developer-golden-journey.json,
// which made the canonical post-deploy run dirty the very revision it verified.
const { file, verdict } = writeAssuranceResult({
  suiteSlug: 'developer-golden-journey',
  suite: summary.suite,
  runtime_sha: build,
  environment,
  pass: passed,
  fail: total - passed,
  started_at: startedAt,
  payload: { gateway: GW, total, promotable: passed === total, assertions: results },
});

console.log(`\nBANZAMI DEVELOPERS GOLDEN JOURNEY\n${passed}/${total} PASS`);
console.log(`evidence: ${file}`);
process.exit(verdict === 'PASS' ? 0 : 1);
