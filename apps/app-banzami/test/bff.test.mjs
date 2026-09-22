import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newCsrf, timingSafeEqualStr,
  parseCookies, serializeCookie, matchRoute, TOKEN_SENTINEL,
} from '../lib/bff.mjs';

test('CSRF compare is exact and constant-time-safe', () => {
  const c = newCsrf();
  assert.equal(timingSafeEqualStr(c, c), true);
  assert.equal(timingSafeEqualStr(c, c + 'x'), false);
  assert.equal(timingSafeEqualStr('', ''), false); // an empty nonce is never valid
  assert.equal(timingSafeEqualStr(undefined, c), false);
});

test('allowlist forwards known Consumer routes only', () => {
  assert.ok(matchRoute('POST', '/v1/auth/register'));
  assert.ok(matchRoute('POST', '/v1/auth/token'));
  assert.ok(matchRoute('GET', '/v1/me/wallet/balance'));
  assert.ok(matchRoute('POST', '/v1/transfers'));
  assert.ok(matchRoute('GET', '/v1/consumers/joao'));
  assert.ok(matchRoute('GET', '/v1/consumer/transactions/abc/receipt.pdf'));
  // Business Receive Point (ADR-065): resolve is payer-safe (optional auth); pay
  // is an authenticated, CSRF-guarded mutation.
  const rpResolve = matchRoute('GET', '/v1/receive-points/SlVXsu6pGJSGEKf4xtBP16');
  assert.ok(rpResolve && rpResolve.auth === 'optional');
  const rpPay = matchRoute('POST', '/v1/receive-points/SlVXsu6pGJSGEKf4xtBP16/pay');
  assert.ok(rpPay && rpPay.auth === 'required' && rpPay.mutating === true && rpPay.csrf === true);
});

test('allowlist refuses everything else (no open proxy)', () => {
  assert.equal(matchRoute('GET', '/v1/admin/secrets'), null);
  assert.equal(matchRoute('DELETE', '/v1/me'), null);
  assert.equal(matchRoute('POST', '/v1/me'), null);
  assert.equal(matchRoute('GET', '/v1/../etc/passwd'), null);
  assert.equal(matchRoute('GET', '/v1/consumers/a/b'), null); // no extra segment
  assert.equal(matchRoute('PUT', '/v1/transfers'), null);
});

// ── Dual context (ADR-066) ───────────────────────────────────────────────────
test('business allow-list forwards the canonical Business routes', () => {
  // Auth contract (@handle + PIN → merchant JWT + rotating refresh).
  const lookup = matchRoute('POST', '/v1/merchant/auth/lookup', 'business');
  assert.ok(lookup && lookup.auth === 'none' && lookup.businessAuth === 'lookup' && lookup.csrf === true);
  const token = matchRoute('POST', '/v1/merchant/auth/token', 'business');
  assert.ok(token && token.auth === 'none' && token.businessAuth === 'token' && token.authIssue === true);
  const logout = matchRoute('POST', '/v1/merchant/auth/logout', 'business');
  assert.ok(logout && logout.auth === 'required' && logout.businessAuth === 'logout' && logout.csrf === true);
  // Data + Receive Point + Create Charge + History + receipt.
  assert.ok(matchRoute('GET', '/v1/business/receive-point', 'business')?.auth === 'required');
  const create = matchRoute('POST', '/v1/payment-links', 'business');
  assert.ok(create && create.auth === 'required' && create.mutating === true && create.csrf === true);
  assert.ok(matchRoute('GET', '/v1/payment-links', 'business')?.auth === 'required'); // list
  assert.ok(matchRoute('GET', '/v1/payment-links/abc123', 'business')?.auth === 'required'); // detail
  assert.ok(matchRoute('GET', '/v1/transactions', 'business')?.auth === 'required');
  assert.ok(matchRoute('GET', '/v1/merchant/wallet-payments', 'business')?.auth === 'required');
  assert.ok(matchRoute('GET', '/v1/merchant/transactions/tx1/receipt.pdf', 'business')?.binary === true);

  // Dividir a conta (Collections/split charge) — the native Dividida flow runs on
  // Business Web via ADR-066 parity, so the SDK's collection endpoints MUST proxy.
  const colCreate = matchRoute('POST', '/v1/collections', 'business');
  assert.ok(colCreate && colCreate.auth === 'required' && colCreate.mutating === true && colCreate.csrf === true);
  assert.ok(matchRoute('GET', '/v1/collections/col_abc123', 'business')?.auth === 'required'); // track detail
  assert.ok(matchRoute('GET', '/v1/collections/col_abc123/shares', 'business')?.auth === 'required'); // shares
  const surface = matchRoute('POST', '/v1/collection-shares/sh_abc123/surface', 'business');
  assert.ok(surface && surface.auth === 'required' && surface.csrf === true); // surface a share as a payment link
  assert.ok(matchRoute('POST', '/v1/collections/col_abc123/cancel', 'business')?.csrf === true);
  // Simple-charge QR auto-dismiss polls the public pay-link status through the BFF.
  assert.ok(matchRoute('GET', '/public/pay/sl_abc123/status', 'business')?.auth === 'optional');
  // Not an open proxy: no unknown collections verb/segment leaks through.
  assert.equal(matchRoute('DELETE', '/v1/collections/col_abc123', 'business'), null);
  assert.equal(matchRoute('POST', '/v1/collections/col_abc123/shares/extra', 'business'), null);
  // Cross-authority isolation: collections are Business-only, never on the consumer list.
  assert.equal(matchRoute('POST', '/v1/collections', 'consumer'), null);
});

test('the internal refresh endpoint is NOT browser-exposed', () => {
  // The BFF renews the access token itself; the browser can never call refresh.
  assert.equal(matchRoute('POST', '/v1/merchant/auth/refresh', 'business'), null);
});

test('no cross-authority token leakage — each route matches only its own authority', () => {
  // A Business route is invisible on the Consumer list and vice-versa, so the BFF
  // can never attach the wrong authority's bearer (WEB_BFF_CROSS_CONTEXT_TOKEN_LEAKAGE=0).
  assert.equal(matchRoute('POST', '/v1/merchant/auth/token', 'consumer'), null);
  assert.equal(matchRoute('GET', '/v1/business/receive-point', 'consumer'), null);
  assert.equal(matchRoute('POST', '/v1/transfers', 'business'), null);
  assert.equal(matchRoute('GET', '/v1/me/wallet/balance', 'business'), null);
  // Same shape, different authority: /v1/payment-links/{id} POST/pay is a Consumer
  // payer action; it is not a Business route.
  assert.equal(matchRoute('POST', '/v1/payment-links/abc/pay', 'business'), null);
});

test('auth-issue routes are CSRF-guarded and mutating', () => {
  const r = matchRoute('POST', '/v1/auth/register');
  assert.equal(r.mutating, true);
  assert.equal(r.csrf, true);
  assert.equal(r.auth, 'none');
  assert.equal(r.authIssue, true);
});

test('the browser token sentinel is not a bearer', () => {
  assert.equal(TOKEN_SENTINEL, 'web-session');
  assert.equal(/eyJ/.test(TOKEN_SENTINEL), false);
});

test('cookies parse and serialize with the right attributes', () => {
  const c = parseCookies('bz_app_session=abc; bz_app_csrf=nonce123; other=x');
  assert.equal(c.bz_app_session, 'abc');
  assert.equal(c.bz_app_csrf, 'nonce123');
  const ck = serializeCookie('bz_app_session', 'v', { maxAge: 100, secure: true, httpOnly: true });
  assert.match(ck, /HttpOnly/);
  assert.match(ck, /Secure/);
  assert.match(ck, /SameSite=Lax/);
  const csrf = serializeCookie('bz_app_csrf', 'v', { maxAge: 100, secure: true, httpOnly: false });
  assert.doesNotMatch(csrf, /HttpOnly/); // readable by design
});

test('the presence cookie can be zone-scoped (Domain) for the pay.* hand-off', () => {
  // A non-secret "1" flag readable across banzami.com so pay.banzami.com can hand
  // a payment link to the logged-in web app. Domain is applied only when passed.
  const present = serializeCookie('bz_app_present', '1', { maxAge: 100, secure: true, httpOnly: true, domain: '.banzami.com' });
  assert.match(present, /Domain=\.banzami\.com/);
  assert.match(present, /HttpOnly/);
  const hostOnly = serializeCookie('bz_app_present', '1', { maxAge: 100, secure: true, httpOnly: true });
  assert.doesNotMatch(hostOnly, /Domain=/); // no domain attribute unless requested
});
