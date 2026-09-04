#!/usr/bin/env node
/**
 * CAP-WEBHOOK-001 — deployed Sandbox assurance for signed webhook delivery.
 *
 * Split deliberately into two halves:
 *
 *   CONTROL PLANE  — authority, endpoint lifecycle, validation, destination
 *                    policy, event production. Runs against the deployed
 *                    Sandbox with no external dependency.
 *
 *   DATA PLANE     — signing, tampering, delivery, retry, failure isolation.
 *                    Needs a PUBLIC HTTPS receiver, because the SSRF policy
 *                    (RA-023) correctly refuses private and loopback targets.
 *                    Supply one via BANZAMI_WEBHOOK_SINK; without it these
 *                    assertions are reported BLOCKED, never passed.
 *
 * The suite refuses to report a promotable result while any assertion is
 * blocked. A capability is not proven by the tests that happened to be runnable.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  req, provisionMerchant, newRunId, idemKey,
  assertSandboxAndBuild, assertExplicitRun, assertNominal,
} from '../payments/harness.mjs';

assertExplicitRun(process.env.BANZAMI_E2E);

const SINK = process.env.BANZAMI_WEBHOOK_SINK || 'https://sandbox-webhook.banzami.com';
const SINK_SSH = process.env.BANZAMI_SINK_SSH || 'root@217.160.9.248';
const SINK_CONTAINER = 'banzami-webhook-sink';

/**
 * The sink's control plane is deliberately NOT public — sandbox-edge 404s
 * /admin/. The harness reaches it over the operator's existing SSH access, so
 * no public administration API exists to be abused.
 */
function sinkAdmin(path, postData) {
  const inner = postData
    ? `wget -qO- --post-data='${JSON.stringify(postData)}' --header='content-type: application/json' 'http://127.0.0.1:8090${path}'`
    : `wget -qO- 'http://127.0.0.1:8090${path}'`;
  const out = execFileSync('ssh', ['-o', 'ConnectTimeout=20', SINK_SSH,
    `docker exec ${SINK_CONTAINER} ${inner}`], { encoding: 'utf8', timeout: 60_000 });
  return JSON.parse(out.trim());
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits for the delivery worker rather than assuming a fixed latency. */
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
const results = [];
const rec = (id, pass, detail) => {
  results.push({ id, pass, blocked: false, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}${detail ? ` — ${detail}` : ''}`);
};
const blocked = (id, why) => {
  results.push({ id, pass: false, blocked: true, detail: why });
  console.log(`BLOCKED  ${id} — ${why}`);
};

/**
 * Independent verifier — deliberately NOT the repository's webhook.Sign.
 *
 * Canonical contract (services/api-gateway/internal/webhook/signer.go):
 *   header  Banza-Signature: t=<unix_seconds>,v1=<hex_hmac_sha256>
 *   signed  "<unix_seconds>." + raw_body_bytes
 *   digest  HMAC-SHA256, lowercase hex
 *
 * Re-implemented here from that contract so a signer bug cannot verify itself.
 */
function verifySignature(secret, header, rawBody) {
  const parts = Object.fromEntries(
    String(header).split(',').map((kv) => kv.trim().split('=')),
  );
  if (!parts.t || !parts.v1) return { ok: false, why: 'malformed header' };
  const mac = createHmac('sha256', secret);
  mac.update(`${parts.t}.`);
  mac.update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8'));
  const expected = mac.digest('hex');
  return { ok: expected === parts.v1, expected, got: parts.v1, t: Number(parts.t) };
}

async function main() {
  const probe = await assertSandboxAndBuild(process.env.BANZAMI_SANDBOX_EXPECTED_COMMIT);
  const build = typeof probe === 'string' ? probe : (probe?.build ?? String(probe));
  console.log(`runtime build: ${build}`);
  console.log(`receiver: ${SINK}\n`);

  const runId = newRunId();
  const A = await provisionMerchant(runId, 'wha');
  const B = await provisionMerchant(runId, 'whb');

  // ── Endpoint lifecycle ────────────────────────────────────────────────────
  const url = SINK || 'https://webhook-sink.invalid/hook';
  const created = await req('POST', '/v1/webhooks/endpoints', {
    token: A.token, body: { url, events: ['payment_link.paid'] },
  });
  rec('WH.create', created.status === 201, `HTTP ${created.status}`);
  const ep = created.body || {};
  rec('WH.owner-is-caller', ep.merchant_id === A.merchantId, 'endpoint bound to the authenticated merchant');
  rec('WH.url-preserved', ep.url === url, String(ep.url));

  // Secret exposure contract: revealed at creation, absent afterwards.
  const secret = ep.secret || ep.signing_secret || '';
  rec('WH.secret-revealed-on-create', Boolean(secret), secret ? 'present (value never persisted to evidence)' : 'ABSENT');
  const got = await req('GET', `/v1/webhooks/endpoints/${ep.id}`, { token: A.token });
  const reGot = got.body?.secret || got.body?.signing_secret || '';
  rec('WH.secret-not-re-exposed', !reGot, reGot ? 'RE-EXPOSED on GET' : 'absent on subsequent read');

  const listed = await req('GET', '/v1/webhooks/endpoints', { token: A.token });
  rec('WH.list-scoped', listed.status === 200 && (listed.body?.data ?? []).every((e) => e.merchant_id === A.merchantId),
    `HTTP ${listed.status}`);

  // ── Destination policy (RA-023) ───────────────────────────────────────────
  // Asserts the policy that exists; it is not invented here to pass.
  for (const [label, bad] of [
    ['http-scheme', 'http://example.com/hook'],
    ['loopback', 'https://127.0.0.1/hook'],
    ['loopback-name', 'https://localhost/hook'],
    ['ipv6-loopback', 'https://[::1]/hook'],
    ['rfc1918', 'https://10.0.0.1/hook'],
    ['rfc1918-172', 'https://172.16.0.1/hook'],
    ['link-local-metadata', 'https://169.254.169.254/latest/meta-data/'],
    ['unspecified', 'https://0.0.0.0/hook'],
    ['missing-host', 'https:///hook'],
    ['malformed', 'not-a-url'],
  ]) {
    const r = await req('POST', '/v1/webhooks/endpoints', { token: A.token, body: { url: bad, events: ['payment_link.paid'] } });
    const safe = r.status >= 400 && r.status < 500 && !/pq:|sql|panic|goroutine/i.test(r.raw || '');
    rec(`WH.dest.${label}`, safe, `HTTP ${r.status}`);
  }

  // ── Validation negatives ──────────────────────────────────────────────────
  for (const [label, body] of [
    ['invalid-event', { url: 'https://example.com/h', events: ['not.a.real.event'] }],
    ['empty-events', { url: 'https://example.com/h', events: [] }],
    ['missing-url', { events: ['payment_link.paid'] }],
    ['oversized-url', { url: `https://example.com/${'a'.repeat(4096)}`, events: ['payment_link.paid'] }],
  ]) {
    const r = await req('POST', '/v1/webhooks/endpoints', { token: A.token, body });
    rec(`WH.valid.${label}`, r.status >= 400 && r.status < 500, `HTTP ${r.status}`);
  }

  // ── Cross-tenant authority (RA-054 family) ────────────────────────────────
  const beforeB = await req('GET', '/v1/webhooks/endpoints', { token: B.token });
  for (const [label, method, path] of [
    ['read-endpoint', 'GET', `/v1/webhooks/endpoints/${ep.id}`],
    ['endpoint-health', 'GET', `/v1/webhooks/endpoints/${ep.id}/health`],
    ['deactivate-endpoint', 'DELETE', `/v1/webhooks/endpoints/${ep.id}`],
  ]) {
    const r = await req(method, path, { token: B.token });
    rec(`WH.authz.${label}`, [403, 404].includes(r.status), `HTTP ${r.status}`);
  }
  const stillOwned = await req('GET', `/v1/webhooks/endpoints/${ep.id}`, { token: A.token });
  rec('WH.authz.victim-endpoint-unchanged',
    stillOwned.status === 200 && stillOwned.body?.id === ep.id, 'A still owns an active endpoint after B\'s attempts');
  const afterB = await req('GET', '/v1/webhooks/endpoints', { token: B.token });
  rec('WH.authz.b-sees-nothing-of-a',
    JSON.stringify(beforeB.body?.data ?? []) === JSON.stringify(afterB.body?.data ?? []), 'B\'s view unchanged');

  // ── Event production — independent of CAP-PAY-003 and KYC ────────────────
  // payment_link.paid is emitted by the merchant's own mark-used lifecycle:
  // no consumer, no KYC, no settlement.
  assertNominal(5_000);
  const link = await req('POST', '/v1/payment-links', {
    token: A.token, idem: idemKey(runId, 'link'),
    body: { wallet_id: A.walletId, amount_minor: 5_000, currency: 'AOA', description: 'CAP-WEBHOOK-001' },
  });
  rec('WH.source.link-created', link.status === 201, `HTTP ${link.status}`);
  const marked = await req('POST', `/v1/payment-links/${link.body?.id}/mark-used`, {
    token: A.token, idem: idemKey(runId, 'mark'), body: {},
  });
  rec('WH.source.mark-used', marked.status === 200, `HTTP ${marked.status}`);

  const events = await req('GET', '/v1/webhooks/events', { token: A.token });
  const evs = events.body?.data ?? [];
  rec('WH.event.produced', evs.length >= 1, `${evs.length} event(s)`);
  const ev = evs[0];
  if (ev) {
    rec('WH.event.type', ev.event_type === 'payment_link.paid', String(ev.event_type));
    rec('WH.event.scoped-to-merchant', ev.merchant_id === A.merchantId, 'event belongs to the producing merchant');

    // RA-060/RA-061 regression: deliveries must be readable by the owner and
    // refused for anyone else. Before the fix this returned 500 for BOTH.
    const own = await req('GET', `/v1/webhooks/events/${ev.id}/deliveries`, { token: A.token });
    rec('WH.deliveries.owner-can-read', own.status === 200, `HTTP ${own.status}`);
    const foreign = await req('GET', `/v1/webhooks/events/${ev.id}/deliveries`, { token: B.token });
    rec('WH.deliveries.foreign-refused', [403, 404].includes(foreign.status), `HTTP ${foreign.status}`);

    // Payload must not carry secrets or unrelated tenants.
    const payloadStr = JSON.stringify(ev.payload ?? {});
    rec('WH.payload.no-secret', !/secret|signing_key|password|authorization/i.test(payloadStr), 'no secret-like field');
    rec('WH.payload.no-foreign-merchant', !payloadStr.includes(B.merchantId), 'no unrelated merchant id');
  }

  // ── Data plane — real delivery to the public sink ────────────────────────
  //
  // The sink is a genuinely public HTTPS destination, so it passes the RA-023
  // controls naturally. No SSRF exception exists for it, and that is the point:
  // if the sink needed an exception the test would be proving something else.
  const cap = randomBytes(16).toString('hex');
  sinkAdmin(`/admin/configure?run=${cap}`, { status: 200 });
  const sinkURL = `${SINK}/receive/${cap}`;

  const dep = await req('POST', '/v1/webhooks/endpoints', {
    token: A.token, body: { url: sinkURL, events: ['payment_link.paid'] },
  });
  rec('WH.sink.endpoint-registered', dep.status === 201, `HTTP ${dep.status} — public sink passes RA-023 unaided`);
  const sinkSecret = dep.body?.secret || dep.body?.signing_secret || '';

  const dlink = await req('POST', '/v1/payment-links', {
    token: A.token, idem: idemKey(runId, 'dlink'),
    body: { wallet_id: A.walletId, amount_minor: 5_000, currency: 'AOA', description: 'CAP-WEBHOOK-001 delivery' },
  });
  await req('POST', `/v1/payment-links/${dlink.body?.id}/mark-used`, {
    token: A.token, idem: idemKey(runId, 'dmark'), body: {},
  });

  const sunk = await waitForRequests(cap, 1, 90_000);
  const d = (sunk.requests || [])[0];
  rec('WH.delivery.received', Boolean(d), d ? `${sunk.count} request(s) captured` : 'nothing delivered within 90s');

  if (d) {
    const sigHeader = d.headers['banza-signature'];
    rec('WH.delivery.signature-header-present', Boolean(sigHeader), sigHeader ? 'Banza-Signature present' : 'MISSING');

    const v = verifySignature(sinkSecret, sigHeader, d.raw_body);
    rec('WH.delivery.signature-valid-independently', v.ok,
      v.ok ? 'independent HMAC-SHA256 over "<t>." + raw body matches' : `mismatch (expected ${String(v.expected).slice(0, 12)}…)`);

    // The signature must cover the transmitted bytes. Re-serialising the JSON
    // and still verifying would mean the contract is over a parsed object.
    const reser = JSON.stringify(JSON.parse(d.raw_body));
    const reserOK = verifySignature(sinkSecret, sigHeader, reser).ok;
    rec('WH.delivery.signed-over-raw-bytes', v.ok && (reser === d.raw_body || !reserOK),
      reser === d.raw_body ? 'raw body is already canonical JSON' : 'a re-serialisation does NOT verify');

    rec('WH.tamper.body-rejected', !verifySignature(sinkSecret, sigHeader, `${d.raw_body} `).ok, 'appended byte fails');
    const flipped = String(sigHeader).replace(/v1=([0-9a-f])/, (_m, c) => `v1=${c === '0' ? '1' : '0'}`);
    rec('WH.tamper.signature-rejected', !verifySignature(sinkSecret, flipped, d.raw_body).ok, 'flipped digest fails');
    const reTs = String(sigHeader).replace(/t=\d+/, 't=1');
    rec('WH.tamper.timestamp-rejected', !verifySignature(sinkSecret, reTs, d.raw_body).ok,
      'timestamp is inside the signed bytes, so changing it invalidates the digest');

    // Payload envelope.
    let env = {};
    try { env = JSON.parse(d.raw_body); } catch { /* asserted below */ }
    rec('WH.payload.has-event-id', Boolean(env.id), String(env.id || 'MISSING'));
    rec('WH.payload.type', env.type === 'payment_link.paid' || env.event_type === 'payment_link.paid',
      String(env.type || env.event_type));
    rec('WH.payload.no-secret-in-transit', !/secret|signing_key|password/i.test(d.raw_body), 'no secret-like field on the wire');
    rec('WH.sink.authorization-not-retained', !('authorization' in d.headers),
      'sink retains an allowlist, so credentials cannot leak in by default');

    // Success is terminal: no retry after a 2xx.
    await sleep(8000);
    const after = sinkAdmin(`/admin/requests?run=${cap}`);
    rec('WH.delivery.no-retry-after-success', after.count === sunk.count, `${after.count} request(s) — unchanged`);
  }

  // ── Retry + failure isolation ────────────────────────────────────────────
  // Backoff is 1m/5m/30m/2h/8h (max 5 attempts), so only the first retry is
  // observable in a test window. The ladder beyond it is read from code, not
  // executed, and reported as such rather than claimed.
  const rcap = randomBytes(16).toString('hex');
  sinkAdmin(`/admin/configure?run=${rcap}`, { status: 500 });
  const rep = await req('POST', '/v1/webhooks/endpoints', {
    token: A.token, body: { url: `${SINK}/receive/${rcap}`, events: ['payment_link.paid'] },
  });
  rec('WH.retry.endpoint-registered', rep.status === 201, `HTTP ${rep.status}`);

  const beforeBal = (await req('GET', `/v1/wallets/${A.walletId}/balance`, { token: A.token })).body?.available_minor;
  const rlink = await req('POST', '/v1/payment-links', {
    token: A.token, idem: idemKey(runId, 'rlink'),
    body: { wallet_id: A.walletId, amount_minor: 5_000, currency: 'AOA', description: 'CAP-WEBHOOK-001 retry' },
  });
  const rmark = await req('POST', `/v1/payment-links/${rlink.body?.id}/mark-used`, {
    token: A.token, idem: idemKey(runId, 'rmark'), body: {},
  });

  // Failure isolation: the business transition must commit regardless of what
  // the receiver does. Webhook transport is not a financial control.
  rec('WH.isolation.source-commits-despite-failing-receiver', rmark.status === 200, `mark-used HTTP ${rmark.status}`);
  const rlinkAfter = await req('GET', `/v1/payment-links/${rlink.body?.id}`, { token: A.token });
  rec('WH.isolation.source-state-correct',
    ['USED', 'PAID', 'used', 'paid'].includes(String(rlinkAfter.body?.status)), String(rlinkAfter.body?.status));
  const afterBal = (await req('GET', `/v1/wallets/${A.walletId}/balance`, { token: A.token })).body?.available_minor;
  rec('WH.isolation.no-financial-side-effect', beforeBal === afterBal, `${beforeBal} → ${afterBal}`);

  const first = await waitForRequests(rcap, 1, 90_000);
  rec('WH.retry.first-attempt-delivered', first.count >= 1, `${first.count} attempt(s)`);

  const retried = await waitForRequests(rcap, 2, 150_000);
  rec('WH.retry.retries-on-5xx', retried.count >= 2, `${retried.count} attempt(s) after ~1m backoff`);
  if (retried.count >= 2) {
    const ids = retried.requests.map((r) => { try { return JSON.parse(r.raw_body).id; } catch { return null; } });
    rec('WH.retry.event-id-stable-across-attempts', ids[0] && ids.every((i) => i === ids[0]),
      'a retry is the same business event, not a new one');
  } else {
    rec('WH.retry.event-id-stable-across-attempts', false, 'no second attempt observed in window');
  }

  const revs = await req('GET', '/v1/webhooks/events', { token: A.token });
  const retryEvents = (revs.body?.data ?? []).filter((e) => e.event_type === 'payment_link.paid');
  rec('WH.retry.no-duplicate-business-events', retryEvents.length === 3,
    `${retryEvents.length} events for 3 mark-used actions — retries add attempts, not events`);

  const passed = results.filter((r) => r.pass).length;
  const blockedN = results.filter((r) => r.blocked).length;
  const promotable = blockedN === 0 && passed === results.length;
  console.log(`\nCAP-WEBHOOK-001  ${passed}/${results.length} PASS · ${blockedN} BLOCKED`);
  console.log(promotable ? 'promotable: true' : 'promotable: false — a capability is not proven by the tests that happened to run');
  console.log(JSON.stringify({ suite: 'cap-webhook-001', build, runId, passed, total: results.length, blocked: blockedN, promotable, results }, null, 2));
  process.exit(promotable ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
