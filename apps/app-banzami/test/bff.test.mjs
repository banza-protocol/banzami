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
