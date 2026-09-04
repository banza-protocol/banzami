/**
 * Sandbox webhook sink — assurance infrastructure, NOT a Banzami product API.
 *
 * Exists so CAP-WEBHOOK-001 can prove signing, delivery and retry against a real
 * public HTTPS destination. The SSRF policy (RA-023) correctly refuses private
 * and loopback targets, so a receiver on the docker network cannot be used — the
 * destination has to be genuinely public, and no exception is added for it.
 *
 * Surface split, deliberately:
 *
 *   PUBLIC   POST /receive/<capability>   capability-based ingest
 *   PRIVATE  /admin/*                     never exposed; 404'd at sandbox-edge
 *
 * The capability is a per-run random token. Nothing here is enumerable, nothing
 * is shared between runs, and everything is bounded and in memory only.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 8090);

// Bounds. A sink that grows without limit is a denial-of-service against the
// host it is meant to be testing from.
const MAX_BODY_BYTES = 64 * 1024;
const MAX_REQUESTS_PER_RUN = 50;
const MAX_RUNS = 100;
const RUN_TTL_MS = 60 * 60 * 1000;

// Only these headers are retained. Everything else — Authorization above all —
// is dropped rather than filtered, so a new header cannot leak by default.
const RETAINED_HEADERS = ['banza-signature', 'content-type', 'user-agent', 'x-request-id'];

/** runs: capability -> { createdAt, behaviour, requests[] } */
const runs = new Map();

function reap() {
  const cutoff = Date.now() - RUN_TTL_MS;
  for (const [cap, run] of runs) if (run.createdAt < cutoff) runs.delete(cap);
  while (runs.size > MAX_RUNS) runs.delete(runs.keys().next().value);
}

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

async function readBounded(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size <= MAX_BODY_BYTES) chunks.push(c);
    });
    req.on('end', () => resolve({ raw: Buffer.concat(chunks).toString('utf8'), truncated: size > MAX_BODY_BYTES }));
  });
}

createServer(async (req, res) => {
  reap();
  const url = new URL(req.url, 'http://sink.local');
  const parts = url.pathname.split('/').filter(Boolean);

  // ── PRIVATE control plane ────────────────────────────────────────────────
  // Reachable only from inside the sandbox network; sandbox-edge 404s /admin/.
  // Kept here rather than as a public API so the harness has no public
  // administration surface to be abused.
  if (parts[0] === 'admin') {
    const cap = url.searchParams.get('run');
    if (parts[1] === 'configure' && req.method === 'POST') {
      const { raw } = await readBounded(req);
      let behaviour = {};
      try { behaviour = JSON.parse(raw || '{}'); } catch { return json(res, 400, { error: 'invalid json' }); }
      runs.set(cap, { createdAt: Date.now(), behaviour, requests: [] });
      return json(res, 200, { run: cap, behaviour });
    }
    if (parts[1] === 'requests' && req.method === 'GET') {
      const run = runs.get(cap);
      if (!run) return json(res, 404, { error: 'unknown run' });
      return json(res, 200, { run: cap, count: run.requests.length, requests: run.requests });
    }
    if (parts[1] === 'reset' && req.method === 'POST') {
      runs.delete(cap);
      return json(res, 200, { run: cap, reset: true });
    }
    return json(res, 404, { error: 'not found' });
  }

  // ── PUBLIC ingest ────────────────────────────────────────────────────────
  if (parts[0] === 'receive' && parts[1] && req.method === 'POST') {
    const cap = parts[1];
    const run = runs.get(cap);
    // An unconfigured capability is indistinguishable from a wrong one.
    if (!run) return json(res, 404, { error: 'not found' });

    const { raw, truncated } = await readBounded(req);
    const headers = {};
    for (const h of RETAINED_HEADERS) if (req.headers[h]) headers[h] = req.headers[h];

    if (run.requests.length < MAX_REQUESTS_PER_RUN) {
      run.requests.push({ received_at: new Date().toISOString(), raw_body: raw, truncated, headers });
    }

    const b = run.behaviour || {};
    // Deterministic per-run behaviour, optionally changing after N attempts so
    // "fail twice then succeed" is expressible without racing the delivery worker.
    const n = run.requests.length;
    const status = (b.then_status && n > (b.fail_first ?? 0)) ? b.then_status : (b.status ?? 200);

    // Timeout simulation is bounded: it must never outlive the delivery client's
    // own timeout, or the sink becomes the thing holding workers open.
    const delayMs = Math.min(Number(b.delay_ms ?? 0), 60_000);
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

    res.writeHead(status, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: status < 400, attempt: n }));
  }

  if (url.pathname === '/healthz') return json(res, 200, { status: 'ok', runs: runs.size });
  return json(res, 404, { error: 'not found' });
}).listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ msg: 'webhook sink listening', port: PORT }));
});
