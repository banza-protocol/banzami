// App Banzami Web — the same-origin BFF security core (WEB-APP-001 §6–§14).
//
// The browser only ever talks to app.banzami.com and holds only an opaque
// session id (see session_store.mjs) plus a readable CSRF nonce. The Consumer
// Bearer and identity live server-side, keyed by that id. This module carries the
// shared primitives: the CSRF compare, cookie (de)serialisation, and the Consumer
// route allow-list — the security boundary that keeps /consumer/* narrow.
//
// This is NOT an open proxy: only the explicitly allow-listed Consumer routes
// below are ever forwarded (§7). Everything else is 404.
import crypto from 'node:crypto';

export const SESSION_COOKIE = 'bz_app_session';
export const CSRF_COOKIE = 'bz_app_csrf';

// The sentinel the browser receives in place of the real Bearer. It is
// worthless: the BFF ignores any inbound Authorization and uses the sealed
// cookie. The shared Flutter client only needs a non-empty token to consider
// itself signed in (WEB_CONSUMER_BEARER_VISIBLE_TO_JS=0).
export const TOKEN_SENTINEL = 'web-session';

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

export function serializeCookie(name, value, { maxAge, secure, httpOnly = true, sameSite = 'Lax', path = '/', domain } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (domain) c += `; Domain=${domain}`;
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

  // Consumer wallet realtime — a same-origin SSE stream. The browser opens it
  // with EventSource (session cookie); the BFF attaches the Bearer upstream and
  // pipes the event stream back. `stream: true` switches the proxy from buffered
  // to streaming. Read-only notification channel (CONSUMER-HOME-REALTIME-001).
  { m: 'GET', re: `^/v1/me/realtime$`, auth: 'required', stream: true },

  { m: 'GET', re: `^/v1/consumers/search$`, auth: 'required' },
  { m: 'GET', re: `^/v1/consumers/${G}$`, auth: 'optional' },

  { m: 'POST', re: `^/v1/transfers$`, auth: 'required', mutating: true, csrf: true },

  { m: 'GET', re: `^/v1/payment-links/${G}$`, auth: 'optional' },
  { m: 'POST', re: `^/v1/payment-links/${G}/pay$`, auth: 'required', mutating: true, csrf: true },

  // Business Receive Point (ADR-065): a scanned persistent QR resolves to the
  // payer-safe public Business identity (GET, payer-safe like a payment-link
  // GET), then the payer mints + settles a fresh session (POST, authenticated
  // payer + CSRF, like payment-links/pay). Without these the consumer app could
  // not resolve or pay a scanned receive point through the same-origin BFF.
  { m: 'GET', re: `^/v1/receive-points/${G}$`, auth: 'optional' },
  { m: 'POST', re: `^/v1/receive-points/${G}/pay$`, auth: 'required', mutating: true, csrf: true },

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
].map((r) => ({ ...r, authority: 'consumer', rx: new RegExp(r.re) }));

// ── Business route allow-list (ADR-066) ──────────────────────────────────────
// Reached under the /business/* prefix, forwarded to the gateway (BUSINESS_API_BASE)
// with the Business authority's merchant JWT — never the Consumer bearer. The
// Business auth contract is the canonical native one: @handle + PIN → merchant JWT
// + rotating refresh. The BFF holds both server-side; the browser holds neither.
// `businessAuth`: 'lookup' (pre-check, stores nothing), 'token' (sign-in, stores
// business_authority), 'logout' (revoke + clear). The refresh endpoint is NOT
// listed — the BFF renews the access token itself on an upstream 401.
export const BUSINESS_ALLOWLIST = [
  { m: 'POST', re: `^/v1/merchant/auth/lookup$`, auth: 'none', mutating: true, csrf: true, authIssue: true, businessAuth: 'lookup' },
  { m: 'POST', re: `^/v1/merchant/auth/token$`, auth: 'none', mutating: true, csrf: true, authIssue: true, businessAuth: 'token' },
  { m: 'POST', re: `^/v1/merchant/auth/logout$`, auth: 'required', mutating: true, csrf: true, authEnd: true, businessAuth: 'logout' },

  { m: 'GET', re: `^/v1/merchants/${G}$`, auth: 'required' },
  { m: 'GET', re: `^/v1/wallets$`, auth: 'required' },
  { m: 'GET', re: `^/v1/wallets/${G}/balance$`, auth: 'required' },
  { m: 'GET', re: `^/v1/wallet-accounts$`, auth: 'required' },

  // The persistent Business Receive Point (ADR-065) — the SAME endpoint the native
  // Business app reads; provisions on first use, returns the active slug.
  { m: 'GET', re: `^/v1/business/receive-point$`, auth: 'required' },
  { m: 'POST', re: `^/v1/business/receive-point/disable$`, auth: 'required', mutating: true, csrf: true },

  // Create Charge + charge history.
  { m: 'POST', re: `^/v1/payment-links$`, auth: 'required', mutating: true, csrf: true },
  { m: 'GET', re: `^/v1/payment-links$`, auth: 'required' },
  { m: 'GET', re: `^/v1/payment-links/${G}$`, auth: 'required' },
  { m: 'DELETE', re: `^/v1/payment-links/${G}$`, auth: 'required', mutating: true, csrf: true },
  // Poll a simple charge's payment link status so the QR screen auto-dismisses into
  // the confirmation once paid (public read; gateway serves /public/pay/{slug}/status).
  { m: 'GET', re: `^/public/pay/${G}/status$`, auth: 'optional' },

  // Dividir a conta (split charge) — Collections (BANZA ADR-016) + PaymentIntent
  // (ADR-015). The native merchant app's Dividida flow runs on Business Web via the
  // dual-app parity (ADR-066), so the BFF must proxy exactly the endpoints the SDK
  // calls: create (body idempotency_key — 0159), read/track, surface a share as a
  // payment link, and cancel. Authority stays server-derived at the gateway.
  { m: 'POST', re: `^/v1/collections$`, auth: 'required', mutating: true, csrf: true },
  { m: 'GET', re: `^/v1/collections/${G}$`, auth: 'required' },
  { m: 'GET', re: `^/v1/collections/${G}/shares$`, auth: 'required' },
  { m: 'POST', re: `^/v1/collection-shares/${G}/surface$`, auth: 'required', mutating: true, csrf: true },
  { m: 'POST', re: `^/v1/collections/${G}/cancel$`, auth: 'required', mutating: true, csrf: true },

  // History: acquiring transactions + wallet-native received payments.
  { m: 'GET', re: `^/v1/transactions$`, auth: 'required' },
  { m: 'GET', re: `^/v1/merchant/wallet-payments$`, auth: 'required' },

  // Receipt PDF (server-rendered Document Engine).
  { m: 'GET', re: `^/v1/merchant/transactions/${G}/receipt\\.pdf$`, auth: 'required', binary: true },
].map((r) => ({ ...r, authority: 'business', rx: new RegExp(r.re) }));

const LISTS = { consumer: ALLOWLIST, business: BUSINESS_ALLOWLIST };

export function matchRoute(method, upstreamPath, authority = 'consumer') {
  const path = upstreamPath.split('?')[0];
  for (const r of (LISTS[authority] || [])) {
    if (r.m === method && r.rx.test(path)) return r;
  }
  return null;
}

// Decode one claim from a JWT payload WITHOUT verifying the signature. The BFF
// only reads a non-secret identifier (merchant_id) the gateway already put in the
// token it just issued; trust comes from the TLS call that returned it, not from
// this decode. Never use this to make an authorization decision.
export function decodeJwtClaim(jwt, key) {
  if (typeof jwt !== 'string') return null;
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const v = json[key];
    return typeof v === 'string' ? v : null;
  } catch { return null; }
}
