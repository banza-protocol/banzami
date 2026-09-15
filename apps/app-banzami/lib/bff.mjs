// App Banzami Web — the same-origin BFF security core (WEB-APP-001 §6–§14).
//
// The browser only ever talks to app.banzami.com. The Consumer API Bearer is a
// financial credential and MUST NOT reach JS: it is sealed here in an HttpOnly,
// Secure, SameSite=Lax cookie (AES-256-GCM), opened only server-side, and
// re-attached to each forwarded Consumer call. The browser holds an opaque blob
// it cannot read, plus a readable CSRF nonce it echoes on writes.
//
// This is NOT an open proxy: only the explicitly allow-listed Consumer routes
// below are ever forwarded (§7). Everything else is 404.
import crypto from 'node:crypto';

export const SESSION_COOKIE = 'bz_app_session';
export const CSRF_COOKIE = 'bz_app_csrf';
const ALG = 'aes-256-gcm';

// The sentinel the browser receives in place of the real Bearer. It is
// worthless: the BFF ignores any inbound Authorization and uses the sealed
// cookie. The shared Flutter client only needs a non-empty token to consider
// itself signed in (WEB_CONSUMER_BEARER_VISIBLE_TO_JS=0).
export const TOKEN_SENTINEL = 'web-session';

export function deriveKey(secret) {
  if (secret && secret.length >= 32) {
    return crypto.createHash('sha256').update(secret).digest();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET (>=32 bytes) is required in production');
  }
  // Development only — a stable, non-secret key so local sessions survive a
  // reload. Never reached in production (guarded above).
  return crypto.createHash('sha256').update('app-banzami-dev-session-key').digest();
}

export function seal(obj, keyBuf) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, keyBuf, iv);
  const pt = Buffer.from(JSON.stringify(obj), 'utf8');
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64url');
}

export function open(blob, keyBuf) {
  try {
    const buf = Buffer.from(blob, 'base64url');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = crypto.createDecipheriv(ALG, keyBuf, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return JSON.parse(pt.toString('utf8'));
  } catch {
    return null;
  }
}

export function newCsrf() {
  return crypto.randomBytes(24).toString('base64url');
}

export function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length === 0 || b.length === 0) return false; // an empty nonce is never valid
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ── Cookies ──────────────────────────────────────────────────────────────────

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const kv = part.trim();
    const eq = kv.indexOf('=');
    if (eq <= 0) continue;
    out[kv.slice(0, eq)] = decodeURIComponent(kv.slice(eq + 1));
  }
  return out;
}

export function serializeCookie(name, value, { maxAge, secure, httpOnly = true, sameSite = 'Lax', path = '/' } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  if (typeof maxAge === 'number') c += `; Max-Age=${Math.max(0, Math.floor(maxAge))}`;
  return c;
}

// ── Consumer route allow-list (§7) ───────────────────────────────────────────
// Only these upstream paths are ever forwarded. `auth`: 'none' (public, no
// bearer), 'optional' (bearer attached if signed in), 'required' (must be
// signed in). `mutating` routes require CSRF. Auth endpoints are 'none' but
// still CSRF-checked against the pre-auth session.
const G = '[^/]+'; // one path segment
export const ALLOWLIST = [
  { m: 'POST', re: `^/v1/auth/register$`, auth: 'none', mutating: true, csrf: true, authIssue: true },
  { m: 'POST', re: `^/v1/auth/token$`, auth: 'none', mutating: true, csrf: true, authIssue: true },
  { m: 'POST', re: `^/v1/auth/logout$`, auth: 'required', mutating: true, csrf: true, authEnd: true },

  { m: 'GET', re: `^/v1/me$`, auth: 'required' },
  { m: 'GET', re: `^/v1/me/wallet$`, auth: 'required' },
  { m: 'GET', re: `^/v1/me/wallet/balance$`, auth: 'required' },
  { m: 'GET', re: `^/v1/me/activity$`, auth: 'required' },
  { m: 'GET', re: `^/v1/me/push-topic$`, auth: 'required' },

  { m: 'GET', re: `^/v1/consumers/search$`, auth: 'required' },
  { m: 'GET', re: `^/v1/consumers/${G}$`, auth: 'optional' },

  { m: 'POST', re: `^/v1/transfers$`, auth: 'required', mutating: true, csrf: true },

  { m: 'GET', re: `^/v1/payment-links/${G}$`, auth: 'optional' },
  { m: 'POST', re: `^/v1/payment-links/${G}/pay$`, auth: 'required', mutating: true, csrf: true },

  { m: 'POST', re: `^/v1/consumer-pay-links$`, auth: 'required', mutating: true, csrf: true },
  { m: 'GET', re: `^/v1/consumer-pay-links/${G}$`, auth: 'optional' },
  { m: 'POST', re: `^/v1/consumer-pay-links/${G}/pay$`, auth: 'required', mutating: true, csrf: true },

  { m: 'POST', re: `^/v1/qr/pay$`, auth: 'required', mutating: true, csrf: true },

  { m: 'POST', re: `^/v1/kyc/cases$`, auth: 'required', mutating: true, csrf: true },
  { m: 'GET', re: `^/v1/kyc/cases/current$`, auth: 'required' },
  { m: 'GET', re: `^/v1/kyc/cases/${G}$`, auth: 'required' },
  { m: 'GET', re: `^/v1/kyc/cases/${G}/status$`, auth: 'required' },
  { m: 'POST', re: `^/v1/kyc/cases/${G}/evidence/upload-url$`, auth: 'required', mutating: true, csrf: true },
  { m: 'POST', re: `^/v1/kyc/cases/${G}/evidence/complete$`, auth: 'required', mutating: true, csrf: true },
  { m: 'POST', re: `^/v1/kyc/cases/${G}/submit$`, auth: 'required', mutating: true, csrf: true },

  { m: 'GET', re: `^/v1/consumer/transactions/${G}/receipt$`, auth: 'required' },
  { m: 'GET', re: `^/v1/consumer/transactions/${G}/receipt\\.pdf$`, auth: 'required', binary: true },

  { m: 'POST', re: `^/v1/sandbox/fund$`, auth: 'required', mutating: true, csrf: true },
  { m: 'POST', re: `^/v1/debug/push-test$`, auth: 'required', mutating: true, csrf: true },
].map((r) => ({ ...r, rx: new RegExp(r.re) }));

export function matchRoute(method, upstreamPath) {
  const path = upstreamPath.split('?')[0];
  for (const r of ALLOWLIST) {
    if (r.m === method && r.rx.test(path)) return r;
  }
  return null;
}
