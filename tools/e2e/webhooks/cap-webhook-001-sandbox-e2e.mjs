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
import { createHmac } from 'node:crypto';
import {
  req, provisionMerchant, newRunId, idemKey,
  assertSandboxAndBuild, assertExplicitRun, assertNominal,
} from '../payments/harness.mjs';

assertExplicitRun(process.env.BANZAMI_E2E);

const SINK = process.env.BANZAMI_WEBHOOK_SINK || '';
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
  console.log(`receiver: ${SINK ? SINK.replace(/\/\/[^/]*@/, '//') : 'NOT SUPPLIED — data-plane assertions blocked'}\n`);

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

  // ── Data plane — requires a public HTTPS receiver ─────────────────────────
  const DATA_PLANE = [
    'WH.delivery.received', 'WH.delivery.signature-valid-independently',
    'WH.delivery.signed-over-raw-bytes', 'WH.tamper.body-rejected',
    'WH.tamper.signature-rejected', 'WH.tamper.timestamp-rejected',
    'WH.retry.on-5xx', 'WH.retry.event-id-stable', 'WH.retry.no-duplicate-events',
    'WH.nonretry.4xx', 'WH.isolation.source-commits-despite-delivery-failure',
  ];
  if (!SINK) {
    for (const id of DATA_PLANE) {
      blocked(id, 'no public HTTPS receiver (BANZAMI_WEBHOOK_SINK unset); RA-023 correctly refuses private targets');
    }
  } else {
    const seen = await req('GET', `${SINK}/__received?merchant=${A.merchantId}`, { base: '' });
    const d = (seen.body?.deliveries ?? [])[0];
    rec('WH.delivery.received', Boolean(d), d ? 'delivery captured' : 'nothing captured');
    if (d) {
      const v = verifySignature(secret, d.headers?.['banza-signature'], d.raw_body);
      rec('WH.delivery.signature-valid-independently', v.ok, v.ok ? 'independent HMAC matches' : `expected ${v.expected}, got ${v.got}`);
      const reserialised = JSON.stringify(JSON.parse(d.raw_body));
      rec('WH.delivery.signed-over-raw-bytes',
        v.ok && (reserialised === d.raw_body || !verifySignature(secret, d.headers['banza-signature'], reserialised).ok),
        'signature covers transmitted bytes, not a re-serialisation');
      rec('WH.tamper.body-rejected', !verifySignature(secret, d.headers['banza-signature'], `${d.raw_body} `).ok, 'mutated body fails');
      const badSig = String(d.headers['banza-signature']).replace(/v1=([0-9a-f])/, (m, c) => `v1=${c === '0' ? '1' : '0'}`);
      rec('WH.tamper.signature-rejected', !verifySignature(secret, badSig, d.raw_body).ok, 'mutated signature fails');
      const badTs = String(d.headers['banza-signature']).replace(/t=\d+/, 't=1');
      rec('WH.tamper.timestamp-rejected', !verifySignature(secret, badTs, d.raw_body).ok, 'mutated timestamp fails');
    }
    for (const id of DATA_PLANE.slice(6)) blocked(id, 'retry/isolation scenarios need a programmable receiver');
  }

  const passed = results.filter((r) => r.pass).length;
  const blockedN = results.filter((r) => r.blocked).length;
  const promotable = blockedN === 0 && passed === results.length;
  console.log(`\nCAP-WEBHOOK-001  ${passed}/${results.length} PASS · ${blockedN} BLOCKED`);
  console.log(promotable ? 'promotable: true' : 'promotable: false — a capability is not proven by the tests that happened to run');
  console.log(JSON.stringify({ suite: 'cap-webhook-001', build, runId, passed, total: results.length, blocked: blockedN, promotable, results }, null, 2));
  process.exit(promotable ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
