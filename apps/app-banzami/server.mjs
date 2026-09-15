// App Banzami Web — the host at app.banzami.com (WEB-APP-001).
//
// One process, two same-origin jobs:
//   1. serves the compiled Flutter Web app (the SAME app as iOS and Android);
//   2. is the session boundary in front of the Consumer API.
//
// The browser holds ONLY a high-entropy opaque session id in an HttpOnly cookie.
// The upstream Consumer Bearer, the consumer identity and the CSRF nonce live in
// a server-side store (Redis, or a file for single-node dev), keyed by that id
// (§2–§10). Logout and expiry revoke the server-side record, so a stolen or
// replayed cookie is worthless. The proxy at /consumer/* is a narrow allow-list,
// never an open relay (§7/§14).
import http from 'node:http';
import { promises as fs } from 'node:fs';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SESSION_COOKIE, CSRF_COOKIE, TOKEN_SENTINEL,
  newCsrf, timingSafeEqualStr, parseCookies, serializeCookie, matchRoute,
} from './lib/bff.mjs';
import { createSessionStore, newSessionId } from './lib/session_store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3007', 10);
const PROD = process.env.NODE_ENV === 'production';
const CONSUMER_API_BASE = (process.env.CONSUMER_API_BASE || 'https://sandbox-api.banzami.com/consumer').replace(/\/+$/, '');
const WEB_ROOT = process.env.WEB_ROOT ? path.resolve(process.env.WEB_ROOT) : path.resolve(__dirname, 'web');
const MAX_BODY = 128 * 1024;
const UPSTREAM_TIMEOUT = 20_000;

// Session policy (Sandbox). Sliding idle bounded by an absolute lifetime.
const IDLE_MS = 30 * 60 * 1000;       // 30 min inactivity
const ABSOLUTE_MS = 12 * 60 * 60 * 1000; // 12 h absolute
const PREAUTH_MS = 15 * 60 * 1000;    // pre-auth (CSRF) window

const store = createSessionStore();

const FRAME_ANCESTORS = "'self' https://banzami.com https://www.banzami.com";
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  `frame-ancestors ${FRAME_ANCESTORS}`,
].join('; ');

function baseHeaders() {
  const h = {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-Robots-Tag': 'noindex',
  };
  if (PROD) h['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload';
  return h;
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...baseHeaders(), ...headers });
  res.end(body);
}
function sendJson(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
}

// ── Static serving ────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.map': 'application/json', '.bin': 'application/octet-stream',
  '.symbols': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};
const NO_CACHE = new Set(['/index.html', '/flutter_bootstrap.js', '/flutter_service_worker.js', '/main.dart.js', '/version.json', '/manifest.json', '/flutter.js']);

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const rel = decoded === '/' ? '/index.html' : decoded;
  const full = path.normalize(path.join(root, rel));
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

async function serveStatic(req, res) {
  let full = safeJoin(WEB_ROOT, req.url);
  if (!full) return send(res, 403, 'forbidden');
  let stat = await fs.stat(full).catch(() => null);
  if (!stat || stat.isDirectory()) {
    if (path.extname(full)) return send(res, 404, 'not found', { 'Content-Type': 'text/plain' });
    full = path.join(WEB_ROOT, 'index.html');
    stat = await fs.stat(full).catch(() => null);
    if (!stat) return send(res, 404, 'not found', { 'Content-Type': 'text/plain' });
  }
  const ext = path.extname(full).toLowerCase();
  const rel = '/' + path.relative(WEB_ROOT, full).split(path.sep).join('/');
  const etag = `"${stat.size}-${stat.mtimeMs.toString(36)}"`;
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'ETag': etag,
    'Cache-Control': NO_CACHE.has(rel) ? 'no-cache' : 'public, max-age=604800',
  };
  // The shell seeds a pre-auth opaque session + readable CSRF nonce for a visitor
  // with no live session, so the first write (register/login) is already bound.
  if (rel === '/index.html') {
    const cookies = parseCookies(req.headers.cookie);
    const cur = await loadSession(cookies[SESSION_COOKIE]);
    if (!cur) {
      const id = newSessionId();
      const csrf = newCsrf();
      await store.set(id, { preauth: true, csrf, createdAt: Date.now() }, PREAUTH_MS);
      headers['Set-Cookie'] = sessionCookies(id, csrf, PREAUTH_MS);
    }
  }
  if (req.headers['if-none-match'] === etag) return send(res, 304, null, headers);
  const stream = fss.createReadStream(full);
  res.writeHead(200, { ...baseHeaders(), ...headers });
  stream.pipe(res);
  stream.on('error', () => { try { res.destroy(); } catch {} });
}

// ── Session helpers ───────────────────────────────────────────────────────────
function sessionCookies(id, csrf, maxAgeMs) {
  const maxAge = Math.floor(maxAgeMs / 1000);
  return [
    serializeCookie(SESSION_COOKIE, id, { maxAge, secure: PROD, httpOnly: true, sameSite: 'Lax' }),
    serializeCookie(CSRF_COOKIE, csrf, { maxAge, secure: PROD, httpOnly: false, sameSite: 'Lax' }),
  ];
}
function clearCookies() {
  return [
    serializeCookie(SESSION_COOKIE, '', { maxAge: 0, secure: PROD, httpOnly: true }),
    serializeCookie(CSRF_COOKIE, '', { maxAge: 0, secure: PROD, httpOnly: false }),
  ];
}
// Remaining lifetime under the sliding-idle-bounded-by-absolute policy.
function remainingTtlMs(rec) {
  const now = Date.now();
  const absLeft = rec.createdAt + ABSOLUTE_MS - now;
  return Math.min(IDLE_MS, absLeft);
}
// Load and validate a session by opaque id. Returns { id, rec } or null. Expired,
// bearer-expired or absent → null (the record is dropped).
async function loadSession(id) {
  if (!id) return null;
  const rec = await store.get(id);
  if (!rec) return null;
  const now = Date.now();
  if (rec.createdAt && now - rec.createdAt > ABSOLUTE_MS) { await store.del(id); return null; }
  if (rec.bearerExp && now >= rec.bearerExp * 1000) { await store.del(id); return null; }
  return { id, rec };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── Auth-issuance rate limit (defence-in-depth; backend limits are primary) ──
// The counter lives in the session store (Redis in production), so a host restart
// or a second replica cannot reset or bypass it (§13).
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_MAX = 12;
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// ── BFF gateway (/consumer/*) ────────────────────────────────────────────────
async function handleBff(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const upstreamPath = req.url.slice('/consumer'.length) || '/';
  const route = matchRoute(req.method, upstreamPath);
  if (!route) return sendJson(res, 404, { code: 'NOT_FOUND', message: 'no such route' });

  if (route.authIssue && await store.rateLimitHit(`auth:${clientIp(req)}`, AUTH_WINDOW_MS, AUTH_MAX)) {
    return sendJson(res, 429, { code: 'RATE_LIMITED', message: 'demasiadas tentativas; tente mais tarde' });
  }

  const loaded = await loadSession(cookies[SESSION_COOKIE]);
  const rec = loaded?.rec || null;

  // Auth issuance needs a pre-auth session to bind the CSRF nonce (§12). If none,
  // mint one and ask the client to retry — the readable CSRF cookie is set now.
  if (route.authIssue && !rec) {
    const id = newSessionId(); const csrf = newCsrf();
    await store.set(id, { preauth: true, csrf, createdAt: Date.now() }, PREAUTH_MS);
    return sendJson(res, 401, { code: 'CSRF_INIT', message: 'retry with csrf' }, { 'Set-Cookie': sessionCookies(id, csrf, PREAUTH_MS) });
  }
  // Authenticated routes need a real (non-preauth) session with a bearer.
  if (route.auth === 'required' && (!rec || rec.preauth || !rec.bearer)) {
    return sendJson(res, 401, { code: 'UNAUTHENTICATED', message: 'sign in required' });
  }
  // CSRF double-submit on every write.
  if (route.csrf) {
    const sent = req.headers['x-csrf-token'];
    if (!rec || !timingSafeEqualStr(sent || '', rec.csrf || '')) {
      return sendJson(res, 403, { code: 'CSRF_FAILED', message: 'invalid csrf token' });
    }
  }

  let reqBody = Buffer.alloc(0);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try { reqBody = await readBody(req); } catch { return sendJson(res, 413, { code: 'PAYLOAD_TOO_LARGE', message: 'request too large' }); }
  }

  // Minimal, safe forwarded header set. Inbound Authorization/Cookie are dropped;
  // the Bearer is injected server-side from the session record only.
  const fwd = { 'Accept': 'application/json', 'User-Agent': 'Banzami-Web-BFF/1.0' };
  if (req.headers['content-type']) fwd['Content-Type'] = req.headers['content-type'];
  if (req.headers['idempotency-key']) fwd['Idempotency-Key'] = req.headers['idempotency-key'];
  if (rec && rec.bearer && route.auth !== 'none') fwd['Authorization'] = `Bearer ${rec.bearer}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT);
  let upstream;
  try {
    upstream = await fetch(`${CONSUMER_API_BASE}${upstreamPath}`, {
      method: req.method, headers: fwd,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : reqBody,
      signal: controller.signal, redirect: 'manual',
    });
  } catch {
    clearTimeout(timer);
    return sendJson(res, 502, { code: 'UPSTREAM_UNREACHABLE', message: 'o serviço está indisponível; tente novamente' });
  }
  clearTimeout(timer);

  const ct = upstream.headers.get('content-type') || 'application/json';
  const buf = Buffer.from(await upstream.arrayBuffer());

  // Auth issuance: create an authenticated opaque session server-side, ROTATE
  // away from the pre-auth id (§6/§13), and strip the Bearer from the browser's
  // response body (§5/§8).
  if (route.authIssue && upstream.ok) {
    try {
      const json = JSON.parse(buf.toString('utf8'));
      const consumer = json.consumer || {};
      const bearerExp = json.expires_at ? Math.floor(new Date(json.expires_at).getTime() / 1000) : Math.floor(Date.now() / 1000) + ABSOLUTE_MS / 1000;
      const newId = newSessionId(); const csrf = newCsrf(); const now = Date.now();
      await store.set(newId, {
        v: 1, preauth: false,
        consumerId: consumer.id || json.consumer_id || '',
        handle: consumer.handle || '',
        displayName: consumer.display_name || undefined,
        bearer: json.token, bearerExp,
        csrf, createdAt: now, lastSeen: now, clientSurface: 'WEB',
      }, Math.min(IDLE_MS, ABSOLUTE_MS));
      if (loaded?.id) await store.del(loaded.id); // rotate: pre-auth id dies
      json.token = TOKEN_SENTINEL; // the browser never sees the real Bearer
      return send(res, upstream.status, JSON.stringify(json), {
        'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        'Set-Cookie': sessionCookies(newId, csrf, remainingTtlMs({ createdAt: now })),
      });
    } catch {
      return sendJson(res, 502, { code: 'AUTH_DECODE', message: 'unexpected auth response' });
    }
  }

  // Logout: revoke the server-side session and clear the cookie (§7/§14).
  if (route.authEnd) {
    if (loaded?.id) await store.del(loaded.id);
    return send(res, upstream.ok ? 200 : upstream.status, buf, {
      'Content-Type': ct, 'Cache-Control': 'no-store', 'Set-Cookie': clearCookies(),
    });
  }

  // Any other authenticated call: slide the idle window (bounded by absolute).
  if (loaded?.id && rec && !rec.preauth) {
    const ttl = remainingTtlMs(rec);
    if (ttl <= 0) { await store.del(loaded.id); }
    else { rec.lastSeen = Date.now(); await store.set(loaded.id, rec, ttl); }
  }
  return send(res, upstream.status, buf, { 'Content-Type': ct, 'Cache-Control': 'no-store' });
}

// ── Router ───────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  try {
    const url = req.url || '/';
    if (url === '/healthz' || url === '/healthz/') {
      // Readiness: the app cannot authenticate if the session store is down (§72).
      let storeOk = false;
      try { storeOk = await store.ping(); } catch { storeOk = false; }
      return sendJson(res, storeOk ? 200 : 503, { status: storeOk ? 'ok' : 'degraded', service: 'app-banzami-web', version: process.env.BANZAMI_BUILD_COMMIT || 'dev', session_store: storeOk, time: new Date().toISOString() });
    }
    if (url === '/consumer' || url.startsWith('/consumer/')) return await handleBff(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    return await serveStatic(req, res);
  } catch (e) {
    return sendJson(res, 500, { code: 'INTERNAL', message: 'internal error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[app-banzami-web] :${PORT} — web ${WEB_ROOT} — upstream ${CONSUMER_API_BASE} — sessions ${store.kind()} — prod=${PROD}`);
});
