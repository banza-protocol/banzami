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
});

test('allowlist refuses everything else (no open proxy)', () => {
  assert.equal(matchRoute('GET', '/v1/admin/secrets'), null);
  assert.equal(matchRoute('DELETE', '/v1/me'), null);
  assert.equal(matchRoute('POST', '/v1/me'), null);
  assert.equal(matchRoute('GET', '/v1/../etc/passwd'), null);
  assert.equal(matchRoute('GET', '/v1/consumers/a/b'), null); // no extra segment
  assert.equal(matchRoute('PUT', '/v1/transfers'), null);
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
