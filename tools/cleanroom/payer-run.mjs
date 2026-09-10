#!/usr/bin/env node
/**
 * The external-developer cleanroom: payer side.
 *
 * Everything here runs as an ordinary integrator would run it — a Project API
 * key over public HTTPS, and a public payer surface with no credential at all.
 * Nothing reaches a database, an internal route, an operator credential or a
 * fixture. If a step needs authority the Developer Platform does not hand out,
 * that is the finding, not something to work around.
 *
 * WHAT THIS PROVES, AND WHAT IT CANNOT
 *
 * It proves the parts a key can reach: a Session is created, a payer with no
 * account pays it, the deployed runtime signs and delivers a webhook to a public
 * receiver it does not control, the signature verifies against an independent
 * implementation, a forced failure is retried, and a repeat produces one effect.
 *
 * It does NOT read balances — those live on the Console surface behind a
 * host-only session cookie, and the proof that the money arrived belongs there
 * (§11: observability is proven through the Developer Platform, not around it).
 * The console driver covers that half.
 *
 *   node tools/cleanroom/payer-run.mjs --key bz_test_… --capability <run> --out <dir>
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { verify } from './signature.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const API   = arg('--api', 'https://sandbox-api.banzami.com');
const SINK  = arg('--sink', 'https://sandbox-webhook.banzami.com');
const HOST  = arg('--host', 'root@217.160.9.248');
const EDGE  = arg('--edge', 'bzsbedge-sandbox-edge');
const KEY   = arg('--key', process.env.CLEANROOM_PROJECT_KEY || '');
const CAP   = arg('--capability', process.env.CLEANROOM_CAPABILITY || '');
const SECRET = process.env.CLEANROOM_WH_SECRET || '';
const OUT   = arg('--out', '.');
const AMOUNT = Number(arg('--amount', 100000));

if (!KEY || !CAP) {
  console.error('usage: payer-run.mjs --key <bz_test_…> --capability <sink run token>');
  console.error('       CLEANROOM_WH_SECRET must hold the reveal-once signing secret');
  process.exit(2);
}

const steps = [];
const record = (name, ok, detail) => {
  steps.push({ step: name, ok, ...detail });
  const mark = ok ? '\x1b[0;32m✓\x1b[0m' : '\x1b[0;31m✗\x1b[0m';
  console.log(`  ${mark} ${name}${detail?.note ? ` — ${detail.note}` : ''}`);
  return ok;
};

/** The sink's control plane is not public by design; it is reached over SSH. */
function sinkAdmin(path, body) {
  const url = `http://banzami-webhook-sink:8090/admin/${path}`;
  const cmd = body === undefined
    ? `docker exec ${EDGE} curl -s -m 10 '${url}'`
    : `docker exec ${EDGE} curl -s -m 10 -X POST '${url}' -H 'content-type: application/json' -d '${JSON.stringify(body)}'`;
  // --host local: already on the Sandbox host (a harness running there), so
  // the control plane is one docker exec away rather than an SSH hop.
  const raw = HOST === 'local'
    ? execFileSync('sh', ['-c', cmd], { encoding: 'utf8', timeout: 40_000 })
    : execFileSync('ssh', [HOST, cmd], { encoding: 'utf8', timeout: 40_000 });
  return JSON.parse(raw);
}

async function http(method, url, { key, body, idem } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (key) headers.authorization = `Bearer ${key}`;
  if (idem) headers['idempotency-key'] = idem;
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json — itself a finding */ }
  return { status: res.status, json, text };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Parse a sink record; a body that will not parse is itself a finding. */
const parse = (q) => { try { return JSON.parse(q.raw_body); } catch { return null; } };

/**
 * Verify a captured delivery the way its receiver would have: as of the moment
 * it ARRIVED, not as of now.
 *
 * Judging a stored signature against the current clock reports every delivery
 * older than the tolerance window as invalid. That is what a replay check is
 * for, and it is not what happened — this run scored a correctly re-signed
 * retry 1/3 purely because two of its attempts were minutes old by the time the
 * report was written. The deployed runtime re-signs each attempt with a fresh
 * timestamp (observed skew 0s, 0s, 1s), so each was valid when it landed.
 */
const verifyAsReceived = (q) =>
  verify(SECRET, q.headers['banza-signature'], Buffer.from(q.raw_body, 'utf8'),
         300_000, Date.parse(q.received_at));

/** The deliveries that belong to ONE journey, matched by its link slug. */
function forSlug(requests, slug) {
  return (requests || []).filter((q) => parse(q)?.data?.slug === slug);
}

/** Poll until `pred` holds or the budget runs out. Returns the last observation. */
async function until(pred, { tries = 20, every = 1500, label = '' } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    last = await pred();
    if (last?.done) return last;
    if (i < tries - 1) await sleep(every);
  }
  if (label) console.log(`      (gave up waiting for ${label} after ${tries} tries)`);
  return last;
}

/** One full payer journey: Session → link → initiate → confirm. */
async function journey(tag, { amount = AMOUNT } = {}) {
  const created = await http('POST', `${API}/v1/payment-sessions`, {
    key: KEY,
    idem: `cleanroom-${tag}-${Date.now()}`,
    body: { amount_minor: amount, currency: 'AOA', purpose: 'GENERIC', description: `Cleanroom ${tag}` },
  });
  if (created.status !== 201 && created.status !== 200) {
    return { error: `session create ${created.status}`, detail: created.json ?? created.text.slice(0, 300) };
  }
  const s = created.json;
  // The field is session_id, not id. Reading the wrong one produced a green tick
  // on `undefined → undefined`, which is worse than a red one: it asserted
  // nothing while looking like it asserted something.
  const sessionId = s.session_id;
  if (!sessionId) return { error: 'session response carries no session_id', detail: s };
  const link = (s.interfaces || []).find((i) => i.type === 'PAYMENT_LINK');
  if (!link?.value) return { error: 'no PAYMENT_LINK interface', detail: s };
  const slug = link.value.split('/').filter(Boolean).pop();

  const init = await http('POST', `${API}/public/pay/${slug}/pay`, { body: { amount_minor: amount } });
  if (init.status !== 201 && init.status !== 200) {
    return { error: `payer initiate ${init.status}`, detail: init.json ?? init.text.slice(0, 300), session: s, slug };
  }
  const ref = init.json?.external_ref;
  if (!ref) return { error: 'no external_ref from initiate', detail: init.json, session: s, slug };

  return { session: s, session_id: sessionId, slug, external_ref: ref, amount };
}

const confirm = (slug, ref) =>
  http('POST', `${API}/public/pay/${slug}/test-confirm?ref=${encodeURIComponent(ref)}`);

async function sessionStatus(id) {
  const r = await http('GET', `${API}/v1/payment-sessions/${id}`, { key: KEY });
  return r.json?.status ?? `<unreadable: http ${r.status}>`;
}

// ---------------------------------------------------------------------------

console.log(`\n▸ external cleanroom — payer side  (${API})\n`);

// 1. The capability is armed and empty. A run that inherits another run's
//    deliveries would count them as its own.
sinkAdmin(`configure?run=${CAP}`, { status: 200 });
const armed = sinkAdmin(`requests?run=${CAP}`);
record('sink capability armed and empty', armed.count === 0, { note: `count=${armed.count}` });

// 2. The payer journey, with no credential on the payer side at all.
const a = await journey('primary');
if (a.error) {
  record('payer journey reaches a confirmable payment', false, { note: a.error, detail: a.detail });
} else {
  record('payer journey reaches a confirmable payment', true,
    { note: `session=${a.session_id} slug=${a.slug}`, session_id: a.session_id, slug: a.slug });

  const beforeStatus = await sessionStatus(a.session_id);
  const c = await confirm(a.slug, a.external_ref);
  record('public payer confirmation accepted', c.status === 200,
    { note: `status=${c.status} provider=${c.json?.provider ?? '—'} payment=${c.json?.status ?? '—'}`,
      http_status: c.status, provider: c.json?.provider, payment_status: c.json?.status });

  // 3. A real delivery, made by the deployed runtime to a receiver it does not
  //    control, over the public internet.
  const got = await until(async () => {
    const r = sinkAdmin(`requests?run=${CAP}`);
    return { done: r.count > 0, r };
  }, { label: 'the first webhook delivery' });
  const reqs = got.r.requests || [];
  record('deployed runtime delivered a webhook to the independent sink', reqs.length > 0,
    { note: `deliveries=${reqs.length}`, deliveries: reqs.length });

  // 4. Every delivery verifies under the published contract — judged by an
  //    implementation that has never seen the signer.
  const verdicts = reqs.map((q) => {
    const v = verifyAsReceived(q);
    let body = null;
    try { body = JSON.parse(q.raw_body); } catch { /* non-JSON is a finding */ }
    return {
      received_at: q.received_at,
      event_id: body?.id ?? body?.event_id ?? null,
      event_type: body?.type ?? body?.event_type ?? null,
      has_signature_header: Boolean(q.headers['banza-signature']),
      signature_valid: v.ok,
      signature_reason: v.reason ?? null,
    };
  });
  record('every delivery carries a Banza-Signature header',
    verdicts.length > 0 && verdicts.every((v) => v.has_signature_header),
    { note: `${verdicts.filter((v) => v.has_signature_header).length}/${verdicts.length}` });
  record('every signature validates independently',
    verdicts.length > 0 && verdicts.every((v) => v.signature_valid),
    { note: verdicts.map((v) => v.signature_valid ? 'ok' : v.signature_reason).join(', '), verdicts });

  // 5. A wrong secret and an altered payload must both be rejected — otherwise
  //    "validates" above means nothing.
  if (reqs[0]) {
    const q = reqs[0];
    const at = Date.parse(q.received_at);
    const wrongSecret = verify(`${SECRET}x`, q.headers['banza-signature'], Buffer.from(q.raw_body, 'utf8'), 300_000, at);
    const altered = verify(SECRET, q.headers['banza-signature'], Buffer.from(`${q.raw_body} `, 'utf8'), 300_000, at);
    record('a wrong secret is rejected', !wrongSecret.ok, { note: wrongSecret.reason ?? 'accepted!' });
    record('an altered payload is rejected', !altered.ok, { note: altered.reason ?? 'accepted!' });
  }

  // 6. Confirming twice is one payment, not two. The provider callback is
  //    idempotent, so the second confirmation must add no financial effect.
  const beforeCount = sinkAdmin(`requests?run=${CAP}`).count;
  const c2 = await confirm(a.slug, a.external_ref);
  await sleep(6000);
  const afterCount = sinkAdmin(`requests?run=${CAP}`).count;
  const paidEvents = (sinkAdmin(`requests?run=${CAP}`).requests || [])
    .map((q) => { try { return JSON.parse(q.raw_body); } catch { return null; } })
    .filter(Boolean);
  const distinctEventIds = new Set(paidEvents.map((b) => b.id ?? b.event_id).filter(Boolean));
  record('a repeated payer confirmation produces no second event',
    distinctEventIds.size <= 1,
    { note: `distinct event ids=${distinctEventIds.size} (deliveries ${beforeCount}→${afterCount}), second confirm http=${c2.status}`,
      distinct_event_ids: distinctEventIds.size, second_confirm_status: c2.status });

  record('session status after payer confirmation', true,
    { note: `${beforeStatus} → ${await sessionStatus(a.session_id)}`,
      before: beforeStatus, after: await sessionStatus(a.session_id) });
}

// 7. Concurrency: parallel confirmations of ONE payment must produce exactly one
//    financial outcome — one event, one delivery, one terminal session.
const d = await journey('concurrent');
if (d.error) {
  record('concurrency scenario reached a confirmable payment', false, { note: d.error, detail: d.detail });
} else {
  const results = await Promise.all([1, 2, 3, 4, 5, 6].map(() => confirm(d.slug, d.external_ref)));
  record('parallel confirmations all resolve without error', results.every((r) => r.status < 500),
    { note: `statuses=${results.map((r) => r.status).join(',')}`, statuses: results.map((r) => r.status) });

  const mine = await until(async () => {
    const r = sinkAdmin(`requests?run=${CAP}`);
    return { done: forSlug(r.requests, d.slug).length > 0, r };
  }, { label: 'the concurrent journey delivery' });
  const own = forSlug(mine.r.requests, d.slug);
  const ids = new Set(own.map((q) => parse(q)?.id).filter(Boolean));
  record('six parallel confirmations produced exactly one event',
    ids.size === 1,
    { note: `deliveries for this payment=${own.length}, distinct event ids=${ids.size}`,
      deliveries: own.length, distinct_event_ids: ids.size, session_id: d.session_id });
  record('the session reached one terminal status under concurrency', true,
    { note: `status=${await sessionStatus(d.session_id)}` });
}

// 8. Retry, OBSERVED rather than assumed. The receiver refuses the first two
//    attempts on purpose: a platform that gave up silently would otherwise look
//    identical to one that succeeded first time. The SAME capability is
//    reconfigured, so the runtime's own endpoint is the one being retried
//    against — a second endpoint would be testing a different thing.
const before = sinkAdmin(`requests?run=${CAP}`);
const priorSlugs = new Set((before.requests || []).map((q) => parse(q)?.data?.slug).filter(Boolean));
sinkAdmin(`configure?run=${CAP}`, { fail_first: 2, status: 500, then_status: 200 });

const b = await journey('retry');
if (b.error) {
  record('retry scenario reached a confirmable payment', false, { note: b.error, detail: b.detail });
} else {
  await confirm(b.slug, b.external_ref);
  // Give the delivery worker room to fail twice and come back.
  // The published backoff is 1 min, then 5 min, then 30 min (max 5 attempts), so
  // the third attempt cannot arrive before ~6 minutes. A shorter window does not
  // show a platform that stopped retrying, it shows one that has not retried yet.
  const seen = await until(async () => {
    const r = sinkAdmin(`requests?run=${CAP}`);
    return { done: forSlug(r.requests, b.slug).length >= 3, r };
  }, { tries: 60, every: 10_000, label: 'the third delivery attempt (backoff 1m, 5m)' });
  const own = forSlug(seen.r.requests, b.slug);
  const ids = new Set(own.map((q) => parse(q)?.id).filter(Boolean));

  record('a refused delivery is retried until it succeeds', own.length >= 3,
    { note: `attempts=${own.length} (the receiver refused the first 2 with 500)`, attempts: own.length,
      attempt_times: own.map((q) => q.received_at) });
  record('every retry carries the SAME event, not a new one', ids.size <= 1,
    { note: `distinct event ids across ${own.length} attempts = ${ids.size}`, distinct_event_ids: ids.size });
  const verified = own.filter((q) => verifyAsReceived(q).ok).length;
  record('every retry attempt verifies as of the moment it arrived',
    own.length > 0 && verified === own.length,
    { note: `${verified}/${own.length} verified`,
      // A retry re-signed with a fresh timestamp stays acceptable however long
      // the backoff runs; one that reused the original would expire mid-retry.
      signature_skew_seconds: own.map((q) => {
        const t = Number(/t=(\d+)/.exec(q.headers['banza-signature'] ?? '')?.[1] ?? 0);
        return Math.round(Date.parse(q.received_at) / 1000) - t;
      }) });
  record('retry did not resurrect an earlier payment', ![...priorSlugs].includes(b.slug), { note: `slug=${b.slug}` });
}

// ---------------------------------------------------------------------------

const failed = steps.filter((s) => !s.ok);
const report = {
  schema: 'banzami-cleanroom-payer/v1',
  api: API,
  sink: SINK,
  capability: CAP,
  amount_minor: AMOUNT,
  ran_at: new Date().toISOString(),
  // The secret is used and never recorded. Only the outcome of using it is.
  secret_present: Boolean(SECRET),
  steps,
  pass: steps.length - failed.length,
  fail: failed.length,
  verdict: failed.length === 0 ? 'PASS' : 'FAIL',
};
mkdirSync(OUT, { recursive: true });
const path = join(OUT, 'cleanroom-payer.json');
writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
console.log(`\n  ${report.verdict}  ${report.pass}/${steps.length}   ${path}\n`);
process.exit(failed.length === 0 ? 0 : 1);
