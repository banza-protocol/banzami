// App Banzami Web — the host at app.banzami.com (WEB-APP-001).
//
// One process does two jobs, both same-origin:
//   1. serves the compiled Flutter Web app (build/web) — the SAME app as iOS and
//      Android, no reimplemented UI;
//   2. is the security boundary in front of the Consumer API: a server-mediated
//      session (Bearer sealed in an HttpOnly cookie) and a narrow, allow-listed
//      reverse proxy at /consumer/* (§6–§14).
//
// There is no React/Next Consumer app any more (§2). The browser never holds the
// Consumer Bearer and never talks cross-origin to the Consumer API.
import http from 'node:http';
import { promises as fs } from 'node:fs';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SESSION_COOKIE, CSRF_COOKIE, TOKEN_SENTINEL,
  deriveKey, seal, open, newCsrf, timingSafeEqualStr,
  parseCookies, serializeCookie, matchRoute,
} from './lib/bff.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3007', 10);
const PROD = process.env.NODE_ENV === 'production';
const CONSUMER_API_BASE = (process.env.CONSUMER_API_BASE || 'https://sandbox-api.banzami.com/consumer').replace(/\/+$/, '');
const WEB_ROOT = process.env.WEB_ROOT
  ? path.resolve(process.env.WEB_ROOT)
  : path.resolve(__dirname, 'web');
const KEY = deriveKey(process.env.SESSION_SECRET || '');
const SESSION_TTL = 60 * 60 * 12; // 12h ceiling; the real limit is the Bearer's exp
const MAX_BODY = 128 * 1024; // 128 KB request body cap
const UPSTREAM_TIMEOUT = 20_000;

// Marketing origins allowed to frame the app (the homepage portal). Nothing
// else may embed it (§44). A top-level transition is preferred over embedding
// where third-party-cookie rules would break the session (§43).
const FRAME_ANCESTORS = "'self' https://banzami.com https://www.banzami.com";

// ── Security headers ─────────────────────────────────────────────────────────
// Flutter Web: one same-origin bootstrap script, CanvasKit WASM self-hosted
// (built --no-web-resources-cdn → no gstatic), inline styles from the engine,
// blob workers (skwasm), camera for the QR scanner. connect-src is 'self' only:
// the browser reaches the Consumer API only through this origin's BFF.
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

// ── Static file serving ──────────────────────────────────────────────────────
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
// The app shell revalidates every load; content-stable engine assets cache long.
const NO_CACHE = new Set(['/index.html', '/flutter_bootstrap.js', '/flutter_service_worker.js', '/main.dart.js', '/version.json', '/manifest.json', '/flutter.js']);

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const rel = decoded === '/' ? '/index.html' : decoded;
  const full = path.normalize(path.join(root, rel));
  if (full !== root && !full.startsWith(root + path.sep)) return null; // traversal guard
  return full;
}

async function serveStatic(req, res) {
  let full = safeJoin(WEB_ROOT, req.url);
  if (!full) return send(res, 403, 'forbidden');
  let stat = await fs.stat(full).catch(() => null);
  // Hash-routed SPA: unknown non-asset paths fall back to the shell.
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
  // The shell seeds a pre-auth CSRF nonce for a visitor with no valid session,
  // so the first write (register/login) already carries a bound token (§12/§13).
  if (rel === '/index.html') {
    const cookies = parseCookies(req.headers.cookie);
    const valid = readSession(cookies);
    if (!valid || !valid.token) {
      const pre = { preauth: true, csrf: newCsrf(), exp: Math.floor(Date.now() / 1000) + 600 };
      headers['Set-Cookie'] = sessionCookies(pre, { secure: PROD });
    }
  }
  if (req.headers['if-none-match'] === etag) return send(res, 304, null, headers);
  const stream = fss.createReadStream(full);
  res.writeHead(200, { ...baseHeaders(), ...headers });
  stream.pipe(res);
  stream.on('error', () => { try { res.destroy(); } catch {} });
}

// ── Session helpers ──────────────────────────────────────────────────────────
function readSession(cookies) {
  const c = cookies[SESSION_COOKIE];
  if (!c) return null;
  const s = open(c, KEY);
  if (!s) return null;
  if (s.exp && s.exp <= Math.floor(Date.now() / 1000)) return null;
  return s;
}
function sessionCookies(session, { secure }) {
  const maxAge = session.exp ? Math.max(60, session.exp - Math.floor(Date.now() / 1000)) : SESSION_TTL;
  return [
    serializeCookie(SESSION_COOKIE, seal(session, KEY), { maxAge, secure, httpOnly: true, sameSite: 'Lax' }),
    serializeCookie(CSRF_COOKIE, session.csrf, { maxAge, secure, httpOnly: false, sameSite: 'Lax' }),
  ];
}
function clearCookies({ secure }) {
  return [
    serializeCookie(SESSION_COOKIE, '', { maxAge: 0, secure, httpOnly: true }),
    serializeCookie(CSRF_COOKIE, '', { maxAge: 0, secure, httpOnly: false }),
  ];
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── Auth-issuance rate limit (defence-in-depth; backend limits are primary) ──
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_MAX = 12; // register/login attempts per IP per window
const _authHits = new Map(); // ip -> number[] (timestamps)
function authRateLimited(ip) {
  const now = Date.now();
  const arr = (_authHits.get(ip) || []).filter((t) => now - t < AUTH_WINDOW_MS);
  arr.push(now);
  _authHits.set(ip, arr);
  if (_authHits.size > 5000) { // bound memory
    for (const [k, v] of _authHits) if (!v.some((t) => now - t < AUTH_WINDOW_MS)) _authHits.delete(k);
  }
  return arr.length > AUTH_MAX;
}
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// ── BFF gateway (/consumer/*) ────────────────────────────────────────────────
async function handleBff(req, res) {
  const secure = PROD;
  const cookies = parseCookies(req.headers.cookie);
  const upstreamPath = req.url.slice('/consumer'.length) || '/';
  const route = matchRoute(req.method, upstreamPath);
  if (!route) return sendJson(res, 404, { code: 'NOT_FOUND', message: 'no such route' });

  if (route.authIssue && authRateLimited(clientIp(req))) {
    return sendJson(res, 429, { code: 'RATE_LIMITED', message: 'demasiadas tentativas; tente mais tarde' });
  }

  let session = readSession(cookies);

  // Pre-auth CSRF for auth issuance: bind the double-submit to a pre-auth
  // session so login/register cannot be driven cross-site (§12), and rotate at
  // success (§13). If no pre-auth session exists yet, mint one now and ask the
  // client to retry — the readable CSRF cookie is set on the same response.
  if (route.authIssue && !session) {
    const pre = { preauth: true, csrf: newCsrf(), exp: Math.floor(Date.now() / 1000) + 600 };
    return sendJson(res, 401, { code: 'CSRF_INIT', message: 'retry with csrf' },
      { 'Set-Cookie': sessionCookies(pre, { secure }) });
  }
  if (route.auth === 'required' && (!session || !session.token)) {
    return sendJson(res, 401, { code: 'UNAUTHENTICATED', message: 'sign in required' });
  }

  // CSRF double-submit for every state-changing route.
  if (route.csrf) {
    const sent = req.headers['x-csrf-token'];
    if (!session || !timingSafeEqualStr(sent || '', session.csrf || '')) {
      return sendJson(res, 403, { code: 'CSRF_FAILED', message: 'invalid csrf token' });
    }
  }

  let reqBody = Buffer.alloc(0);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try { reqBody = await readBody(req); } catch { return sendJson(res, 413, { code: 'PAYLOAD_TOO_LARGE', message: 'request too large' }); }
  }

  // Forward with a minimal, safe header set. Inbound Authorization/Cookie are
  // dropped; the Bearer is injected server-side from the sealed session.
  const fwdHeaders = { 'Accept': 'application/json', 'User-Agent': 'Banzami-Web-BFF/1.0' };
  if (req.headers['content-type']) fwdHeaders['Content-Type'] = req.headers['content-type'];
  if (req.headers['idempotency-key']) fwdHeaders['Idempotency-Key'] = req.headers['idempotency-key'];
  if (session && session.token && route.auth !== 'none') fwdHeaders['Authorization'] = `Bearer ${session.token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT);
  let upstream;
  try {
    upstream = await fetch(`${CONSUMER_API_BASE}${upstreamPath}`, {
      method: req.method,
      headers: fwdHeaders,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : reqBody,
      signal: controller.signal,
      redirect: 'manual',
    });
  } catch {
    clearTimeout(timer);
    return sendJson(res, 502, { code: 'UPSTREAM_UNREACHABLE', message: 'o serviço está indisponível; tente novamente' });
  }
  clearTimeout(timer);

  const ct = upstream.headers.get('content-type') || 'application/json';
  const buf = Buffer.from(await upstream.arrayBuffer());

  // Auth issuance: seal the Bearer into the session cookie and STRIP it from the
  // body the browser receives (§8). Rotate the pre-auth session (§13).
  if (route.authIssue && upstream.ok) {
    try {
      const json = JSON.parse(buf.toString('utf8'));
      const token = json.token;
      const expSec = json.expires_at ? Math.floor(new Date(json.expires_at).getTime() / 1000) : Math.floor(Date.now() / 1000) + SESSION_TTL;
      const consumer = json.consumer || {};
      const full = {
        token, exp: expSec, csrf: newCsrf(),
        consumerId: consumer.id || json.consumer_id || '', handle: consumer.handle || '',
        displayName: consumer.display_name || undefined,
      };
      json.token = TOKEN_SENTINEL; // the browser never sees the real Bearer
      return send(res, upstream.status, JSON.stringify(json), {
        'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        'Set-Cookie': sessionCookies(full, { secure }),
      });
    } catch {
      return sendJson(res, 502, { code: 'AUTH_DECODE', message: 'unexpected auth response' });
    }
  }

  // Logout: end the session cookie regardless of the upstream outcome (§14).
  if (route.authEnd) {
    return send(res, upstream.ok ? 200 : upstream.status, buf, {
      'Content-Type': ct, 'Cache-Control': 'no-store', 'Set-Cookie': clearCookies({ secure }),
    });
  }

  // Everything else: pass the body through, never cached (§38).
  const outHeaders = { 'Content-Type': ct, 'Cache-Control': 'no-store' };
  return send(res, upstream.status, buf, outHeaders);
}

// ── Router ───────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  try {
    const url = req.url || '/';
    if (url === '/healthz' || url === '/healthz/') {
      // Readiness only — no session, consumer, secret or upstream detail (§41).
      return sendJson(res, 200, { status: 'ok', service: 'app-banzami-web', time: new Date().toISOString() });
    }
    if (url === '/consumer' || url.startsWith('/consumer/')) return await handleBff(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    return await serveStatic(req, res);
  } catch (e) {
    return sendJson(res, 500, { code: 'INTERNAL', message: 'internal error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[app-banzami-web] listening on :${PORT} — web root ${WEB_ROOT} — upstream ${CONSUMER_API_BASE} — prod=${PROD}`);
  if (PROD && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
    console.error('[app-banzami-web] FATAL: SESSION_SECRET missing/too short in production');
    process.exit(1);
  }
});
