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
  newCsrf, timingSafeEqualStr, parseCookies, serializeCookie, matchRoute, decodeJwtClaim,
} from './lib/bff.mjs';
import { createSessionStore, newSessionId } from './lib/session_store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3007', 10);
const PROD = process.env.NODE_ENV === 'production';
const CONSUMER_API_BASE = (process.env.CONSUMER_API_BASE || 'https://sandbox-api.banzami.com/consumer').replace(/\/+$/, '');
// Business (merchant) authority upstream — the gateway (ADR-066). The native
// Business app talks to the gateway root with a merchant JWT; the Business web
// context does the same, with the BFF holding the JWT server-side.
const BUSINESS_API_BASE = (process.env.BUSINESS_API_BASE || 'https://sandbox-api.banzami.com').replace(/\/+$/, '');
const UPSTREAM_BASE = { consumer: CONSUMER_API_BASE, business: BUSINESS_API_BASE };
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
  // Flutter serves its assets (fonts, AssetManifest, images) at STABLE URLs whose
  // CONTENT changes every build — e.g. the tree-shaken MaterialIcons font is a
  // different subset each deploy. A long max-age there leaves a browser using the
  // OLD cached font while it runs the freshly-revalidated main.dart.js, so glyphs
  // that only the new subset carries render blank. Revalidate everything under
  // /assets/ via ETag (a 304 when unchanged — negligible cost); keep the long
  // immutable cache only for engine files (/canvaskit/) and other static content.
  // A content-addressed font file (…-<12 hex>.<ext>, produced at build time) is safe
  // to cache forever: when the bytes change the FILENAME changes, so the URL changes.
  // Everything else under /assets/ is revalidated (its bytes can change under a stable
  // URL — the stale-font defect); engine files and other static content keep the long
  // cache. (A query string cannot be used here: the Flutter engine strips the query
  // when it fetches a manifest asset, so only a real filename change is honoured.)
  const contentHashed = /[.-][0-9a-f]{12}\.(otf|ttf|woff2?|css|js)$/.test(rel);
  const underAssets = NO_CACHE.has(rel) || rel.startsWith('/assets/');
  let cacheControl;
  if (contentHashed && rel.startsWith('/assets/')) cacheControl = 'public, max-age=31536000, immutable';
  else if (underAssets) cacheControl = 'no-cache';
  else cacheControl = 'public, max-age=604800';
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'ETag': etag,
    'Cache-Control': cacheControl,
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
// A non-secret, cross-subdomain "there is a live app.banzami.com session on this
// browser" hint. It carries NO session material — only "1" — and is scoped to the
// whole banzami.com zone (Domain=.banzami.com in prod) so pay.banzami.com can hand
// a payment link off to the logged-in web app (open pay/{slug} in-app). Set only
// on an AUTHENTICATED session, cleared on full logout; never set for a pre-auth seed.
const PRESENCE_COOKIE = 'bz_app_present';
const APP_COOKIE_DOMAIN = PROD ? '.banzami.com' : undefined;

function sessionCookies(id, csrf, maxAgeMs, { present = false } = {}) {
  const maxAge = Math.floor(maxAgeMs / 1000);
  const cookies = [
    serializeCookie(SESSION_COOKIE, id, { maxAge, secure: PROD, httpOnly: true, sameSite: 'Lax' }),
    serializeCookie(CSRF_COOKIE, csrf, { maxAge, secure: PROD, httpOnly: false, sameSite: 'Lax' }),
  ];
  if (present) {
    cookies.push(serializeCookie(PRESENCE_COOKIE, '1', { maxAge, secure: PROD, httpOnly: true, sameSite: 'Lax', domain: APP_COOKIE_DOMAIN }));
  }
  return cookies;
}
function clearCookies() {
  return [
    serializeCookie(SESSION_COOKIE, '', { maxAge: 0, secure: PROD, httpOnly: true }),
    serializeCookie(CSRF_COOKIE, '', { maxAge: 0, secure: PROD, httpOnly: false }),
    serializeCookie(PRESENCE_COOKIE, '', { maxAge: 0, secure: PROD, httpOnly: true, domain: APP_COOKIE_DOMAIN }),
  ];
}
// Remaining lifetime under the sliding-idle-bounded-by-absolute policy.
function remainingTtlMs(rec) {
  const now = Date.now();
  const absLeft = rec.createdAt + ABSOLUTE_MS - now;
  return Math.min(IDLE_MS, absLeft);
}
// ── Dual authority (ADR-066) ─────────────────────────────────────────────────
// One session record can carry two INDEPENDENT authorities. v2 records namespace
// them under consumer_authority / business_authority; a legacy v1 record's flat
// consumer fields are read as the consumer authority (forward-compatible).
function authorityOf(rec, kind) {
  if (!rec) return null;
  if (kind === 'consumer') {
    if (rec.consumer_authority) return rec.consumer_authority;
    if (rec.bearer) return { bearer: rec.bearer, bearerExp: rec.bearerExp, consumerId: rec.consumerId, handle: rec.handle, displayName: rec.displayName };
    return null;
  }
  if (kind === 'business') return rec.business_authority || null;
  return null;
}
function hasAnyAuthority(rec) {
  return !!(authorityOf(rec, 'consumer') || authorityOf(rec, 'business'));
}

// Load and validate a session by opaque id. Returns { id, rec } or null. The
// whole-session absolute lifetime is enforced here; per-authority expiry prunes
// only the dead authority (a Consumer bearer that expired, or a Business refresh
// that expired — the Business access token alone is renewed at request time). A
// record with no authority left (and not a pre-auth record) is dropped.
async function loadSession(id) {
  if (!id) return null;
  const rec = await store.get(id);
  if (!rec) return null;
  const now = Date.now();
  if (rec.createdAt && now - rec.createdAt > ABSOLUTE_MS) { await store.del(id); return null; }
  if (rec.preauth) return { id, rec };
  // Legacy v1 (flat consumer-only) — preserve the original behaviour exactly.
  if (!rec.consumer_authority && !rec.business_authority) {
    if (!rec.bearer) { await store.del(id); return null; }
    if (rec.bearerExp && now >= rec.bearerExp * 1000) { await store.del(id); return null; }
    return { id, rec };
  }
  let changed = false;
  const c = rec.consumer_authority;
  if (c && c.bearerExp && now >= c.bearerExp * 1000) { delete rec.consumer_authority; changed = true; }
  const b = rec.business_authority;
  if (b) {
    const refreshDead = b.refreshExp ? now >= b.refreshExp * 1000 : (b.bearerExp && now >= b.bearerExp * 1000);
    if (refreshDead) { delete rec.business_authority; changed = true; }
  }
  if (!hasAnyAuthority(rec)) { await store.del(id); return null; }
  if (changed) await store.set(id, rec, remainingTtlMs(rec));
  return { id, rec };
}

// Renew a Business access token with its stored (single-use) refresh token. On
// success it mutates rec.business_authority in place and returns true; the caller
// persists rec. A permanent refusal drops the business authority. Server-side
// only — the browser never sees either token (ADR-066 §5).
async function refreshBusinessToken(rec) {
  const b = rec.business_authority;
  if (!b || !b.refresh) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT);
  try {
    const r = await fetch(`${BUSINESS_API_BASE}/v1/merchant/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ refresh_token: b.refresh }), signal: controller.signal, redirect: 'manual',
    });
    if (!r.ok) { if (r.status === 401 || r.status === 403) delete rec.business_authority; return false; }
    const j = await r.json();
    if (!j.token) return false;
    b.bearer = j.token;
    b.bearerExp = j.expires_at ? Math.floor(new Date(j.expires_at).getTime() / 1000) : Math.floor(Date.now() / 1000) + 300;
    if (typeof j.refresh_token === 'string' && j.refresh_token) b.refresh = j.refresh_token;
    if (j.refresh_expires_at) b.refreshExp = Math.floor(new Date(j.refresh_expires_at).getTime() / 1000);
    return true;
  } catch { return false; }
  finally { clearTimeout(timer); }
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

// ── BFF gateway (/consumer/* and /business/*) ────────────────────────────────
// One proxy, two authorities (ADR-066). `prefix` is the URL prefix the browser
// used ('/consumer' or '/business'); `authority` selects the allow-list, the
// upstream base, and which server-side credential is attached. A Consumer route
// can never receive the Business bearer and vice-versa.
async function handleBff(req, res, prefix, authority) {
  const cookies = parseCookies(req.headers.cookie);
  const upstreamPath = req.url.slice(prefix.length) || '/';
  const route = matchRoute(req.method, upstreamPath, authority);
  if (!route) return sendJson(res, 404, { code: 'NOT_FOUND', message: 'no such route' });
  const base = UPSTREAM_BASE[authority];

  if (route.authIssue && await store.rateLimitHit(`auth:${authority}:${clientIp(req)}`, AUTH_WINDOW_MS, AUTH_MAX)) {
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
  // Authenticated routes need this authority present (not merely any session).
  const auth = authorityOf(rec, authority);
  if (route.auth === 'required' && (!rec || rec.preauth || !auth?.bearer)) {
    return sendJson(res, 401, { code: 'UNAUTHENTICATED', message: 'sign in required' });
  }
  // CSRF double-submit on every write (one nonce per session, both authorities).
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
  // Business logout carries the server-side refresh token upstream so the gateway
  // can revoke it — the browser never held it.
  if (route.businessAuth === 'logout') {
    reqBody = Buffer.from(JSON.stringify({ refresh_token: authorityOf(rec, 'business')?.refresh || '' }));
  }

  // Perform the upstream call. Inbound Authorization/Cookie are dropped; the Bearer
  // is injected server-side, from THIS authority only.
  const doFetch = async (bearer) => {
    const fwd = { 'Accept': route.stream ? 'text/event-stream' : 'application/json', 'User-Agent': 'Banzami-Web-BFF/1.0' };
    if (req.headers['content-type']) fwd['Content-Type'] = req.headers['content-type'];
    if (route.businessAuth === 'logout') fwd['Content-Type'] = 'application/json';
    if (req.headers['idempotency-key']) fwd['Idempotency-Key'] = req.headers['idempotency-key'];
    if (bearer && route.auth !== 'none') fwd['Authorization'] = `Bearer ${bearer}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT);
    try {
      return await fetch(`${base}${upstreamPath}`, {
        method: req.method, headers: fwd,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : reqBody,
        signal: controller.signal, redirect: 'manual',
      });
    } finally { clearTimeout(timer); }
  };

  let upstream;
  try { upstream = await doFetch(auth?.bearer); }
  catch { return sendJson(res, 502, { code: 'UPSTREAM_UNREACHABLE', message: 'o serviço está indisponível; tente novamente' }); }

  // Business access token expired mid-session → renew with the refresh token and
  // retry once (mirrors the native client's transparent renewal).
  if (authority === 'business' && route.auth === 'required' && upstream.status === 401 && loaded?.id && rec.business_authority) {
    const ok = await refreshBusinessToken(rec);
    await store.set(loaded.id, rec, remainingTtlMs(rec));
    if (ok) { try { upstream = await doFetch(rec.business_authority.bearer); } catch { /* keep the 401 */ } }
  }

  // Streaming passthrough (SSE, consumer only today).
  if (route.stream) {
    res.writeHead(upstream.status, {
      ...baseHeaders(),
      'Content-Type': upstream.headers.get('content-type') || 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    if (!upstream.body) { res.end(); return; }
    const { Readable } = await import('node:stream');
    const nodeStream = Readable.fromWeb(upstream.body);
    const onClose = () => { try { nodeStream.destroy(); } catch { /* noop */ } };
    req.on('close', onClose);
    nodeStream.on('error', () => { try { res.end(); } catch { /* noop */ } });
    nodeStream.pipe(res);
    return;
  }

  const ct = upstream.headers.get('content-type') || 'application/json';
  const buf = Buffer.from(await upstream.arrayBuffer());

  // ── Consumer sign-in: write the consumer authority (v2), ROTATE the id, carry
  // over any existing business authority, strip the Bearer from the body.
  if (authority === 'consumer' && route.authIssue && upstream.ok) {
    try {
      const json = JSON.parse(buf.toString('utf8'));
      const consumer = json.consumer || {};
      const bearerExp = json.expires_at ? Math.floor(new Date(json.expires_at).getTime() / 1000) : Math.floor(Date.now() / 1000) + ABSOLUTE_MS / 1000;
      const prev = loaded?.rec || {};
      const newId = newSessionId(); const csrf = newCsrf(); const now = Date.now();
      const rec2 = {
        v: 2, preauth: false, csrf,
        createdAt: (prev.createdAt && !prev.preauth) ? prev.createdAt : now,
        lastSeen: now, clientSurface: 'WEB', active_context: 'personal',
        consumer_authority: {
          bearer: json.token, bearerExp,
          consumerId: consumer.id || json.consumer_id || '',
          handle: consumer.handle || '',
          displayName: consumer.display_name || undefined,
        },
        business_authority: authorityOf(prev, 'business') || undefined,
      };
      await store.set(newId, rec2, remainingTtlMs(rec2));
      if (loaded?.id) await store.del(loaded.id);
      json.token = TOKEN_SENTINEL;
      return send(res, upstream.status, JSON.stringify(json), {
        'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        'Set-Cookie': sessionCookies(newId, csrf, remainingTtlMs(rec2), { present: true }),
      });
    } catch { return sendJson(res, 502, { code: 'AUTH_DECODE', message: 'unexpected auth response' }); }
  }

  // ── Business sign-in: store the merchant JWT + rotating refresh server-side,
  // carry over any existing consumer authority, strip both tokens from the body.
  if (route.businessAuth === 'token' && upstream.ok) {
    try {
      const json = JSON.parse(buf.toString('utf8'));
      if (!json.token) return sendJson(res, 502, { code: 'AUTH_DECODE', message: 'unexpected auth response' });
      const bearerExp = json.expires_at ? Math.floor(new Date(json.expires_at).getTime() / 1000) : Math.floor(Date.now() / 1000) + 300;
      const refreshExp = json.refresh_expires_at ? Math.floor(new Date(json.refresh_expires_at).getTime() / 1000) : undefined;
      const prev = loaded?.rec || {};
      const newId = newSessionId(); const csrf = newCsrf(); const now = Date.now();
      const rec2 = {
        v: 2, preauth: false, csrf,
        createdAt: (prev.createdAt && !prev.preauth) ? prev.createdAt : now,
        lastSeen: now, clientSurface: 'WEB', active_context: 'business',
        consumer_authority: authorityOf(prev, 'consumer') || undefined,
        business_authority: {
          bearer: json.token, bearerExp,
          refresh: (typeof json.refresh_token === 'string' && json.refresh_token) ? json.refresh_token : undefined,
          refreshExp, merchantId: decodeJwtClaim(json.token, 'merchant_id') || '',
          environment: json.environment || 'SANDBOX',
        },
      };
      await store.set(newId, rec2, remainingTtlMs(rec2));
      if (loaded?.id) await store.del(loaded.id);
      json.token = TOKEN_SENTINEL;
      if ('refresh_token' in json) json.refresh_token = TOKEN_SENTINEL;
      // Echo the non-secret merchant id in the sanitized body. The browser
      // cannot decode the sentinel token, so the SAME native sign-in screen
      // (ADR-066) reads the identity from here instead of the JWT claim. This is
      // the very id already exposed at /session/state — no new exposure.
      json.merchant_id = rec2.business_authority.merchantId || '';
      return send(res, upstream.status, JSON.stringify(json), {
        'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        'Set-Cookie': sessionCookies(newId, csrf, remainingTtlMs(rec2), { present: true }),
      });
    } catch { return sendJson(res, 502, { code: 'AUTH_DECODE', message: 'unexpected auth response' }); }
  }

  // ── Business logout: drop ONLY the business authority; the consumer stays.
  if (route.businessAuth === 'logout') {
    if (loaded?.id && rec) {
      delete rec.business_authority;
      if (rec.active_context === 'business') rec.active_context = 'personal';
      if (!hasAnyAuthority(rec)) { await store.del(loaded.id); return send(res, 200, buf, { 'Content-Type': ct, 'Cache-Control': 'no-store', 'Set-Cookie': clearCookies() }); }
      await store.set(loaded.id, rec, remainingTtlMs(rec));
    }
    return send(res, upstream.ok ? 200 : upstream.status, buf, { 'Content-Type': ct, 'Cache-Control': 'no-store' });
  }

  // ── Consumer logout: drop ONLY the consumer authority; the business stays.
  if (route.authEnd) {
    if (loaded?.id && rec) {
      delete rec.consumer_authority;
      delete rec.bearer; delete rec.bearerExp; delete rec.consumerId; delete rec.handle; delete rec.displayName; // legacy v1 fields
      if (rec.active_context === 'personal') rec.active_context = 'business';
      if (!hasAnyAuthority(rec)) { await store.del(loaded.id); return send(res, upstream.ok ? 200 : upstream.status, buf, { 'Content-Type': ct, 'Cache-Control': 'no-store', 'Set-Cookie': clearCookies() }); }
      await store.set(loaded.id, rec, remainingTtlMs(rec));
      return send(res, upstream.ok ? 200 : upstream.status, buf, { 'Content-Type': ct, 'Cache-Control': 'no-store' });
    }
    return send(res, upstream.ok ? 200 : upstream.status, buf, { 'Content-Type': ct, 'Cache-Control': 'no-store', 'Set-Cookie': clearCookies() });
  }

  // Any other authenticated call: slide the idle window, persisting any refreshed
  // business token from the retry above.
  if (loaded?.id && rec && !rec.preauth) {
    const ttl = remainingTtlMs(rec);
    if (ttl <= 0) { await store.del(loaded.id); }
    else { rec.lastSeen = Date.now(); await store.set(loaded.id, rec, ttl); }
  }
  return send(res, upstream.status, buf, { 'Content-Type': ct, 'Cache-Control': 'no-store' });
}

// ── Session state + context (ADR-066) ────────────────────────────────────────
// The switcher and the shells read which authorities are live and the active
// context. No secret is ever returned — only presence + public identity.
async function handleSessionState(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const loaded = await loadSession(cookies[SESSION_COOKIE]);
  const rec = loaded?.rec || null;
  const c = authorityOf(rec, 'consumer');
  const b = authorityOf(rec, 'business');
  return sendJson(res, 200, {
    personal: !!c?.bearer,
    business: !!b?.bearer,
    active_context: rec?.active_context || 'personal',
    consumer: c?.bearer ? { handle: c.handle || '', display_name: c.displayName || '' } : null,
    business_context: b?.bearer ? { merchant_id: b.merchantId || '', environment: b.environment || 'SANDBOX' } : null,
  });
}
async function handleSetContext(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const loaded = await loadSession(cookies[SESSION_COOKIE]);
  const rec = loaded?.rec || null;
  if (!rec || rec.preauth) return sendJson(res, 401, { code: 'UNAUTHENTICATED', message: 'no session' });
  const sent = req.headers['x-csrf-token'];
  if (!timingSafeEqualStr(sent || '', rec.csrf || '')) return sendJson(res, 403, { code: 'CSRF_FAILED', message: 'invalid csrf token' });
  let body = {};
  try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}'); } catch { return sendJson(res, 400, { code: 'BAD_REQUEST', message: 'invalid body' }); }
  const want = body.context === 'business' ? 'business' : 'personal';
  // active_context is a preference, never authority: it may only point Business
  // at an authority that is actually present (Personal is always allowed — the
  // payer signs in on demand).
  if (want === 'business' && !authorityOf(rec, 'business')?.bearer) return sendJson(res, 409, { code: 'NO_BUSINESS_AUTHORITY', message: 'not signed in to Business' });
  rec.active_context = want;
  if (loaded?.id) await store.set(loaded.id, rec, remainingTtlMs(rec));
  return handleSessionState(req, res);
}
// ── Logout everything (§30 "Sair de todas") ──────────────────────────────────
async function handleLogoutAll(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const loaded = await loadSession(cookies[SESSION_COOKIE]);
  const rec = loaded?.rec || null;
  if (rec && !rec.preauth) {
    const sent = req.headers['x-csrf-token'];
    if (!timingSafeEqualStr(sent || '', rec.csrf || '')) return sendJson(res, 403, { code: 'CSRF_FAILED', message: 'invalid csrf token' });
    const b = authorityOf(rec, 'business');
    const c = authorityOf(rec, 'consumer');
    // best-effort upstream revocation for both authorities
    try { if (b?.refresh) await fetch(`${BUSINESS_API_BASE}/v1/merchant/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: b.refresh }) }); } catch { /* noop */ }
    try { if (c?.bearer) await fetch(`${CONSUMER_API_BASE}/v1/auth/logout`, { method: 'POST', headers: { 'Authorization': `Bearer ${c.bearer}` } }); } catch { /* noop */ }
  }
  if (loaded?.id) await store.del(loaded.id);
  return send(res, 200, JSON.stringify({ status: 'ok' }), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': clearCookies() });
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
    if (url === '/consumer' || url.startsWith('/consumer/')) return await handleBff(req, res, '/consumer', 'consumer');
    if (url === '/business' && (req.method === 'GET' || req.method === 'HEAD')) return await serveStatic(req, res); // the Business shell page
    if (url.startsWith('/business/api/')) return await handleBff(req, res, '/business/api', 'business'); // Business BFF proxy
    if (url === '/session/state') return await handleSessionState(req, res);
    if (url === '/session/context' && req.method === 'POST') return await handleSetContext(req, res);
    if (url === '/session/logout-all' && req.method === 'POST') return await handleLogoutAll(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    return await serveStatic(req, res);
  } catch (e) {
    return sendJson(res, 500, { code: 'INTERNAL', message: 'internal error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[app-banzami-web] :${PORT} — web ${WEB_ROOT} — upstream ${CONSUMER_API_BASE} — sessions ${store.kind()} — prod=${PROD}`);
});
