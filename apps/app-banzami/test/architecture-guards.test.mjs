// APP-BANZAMI-WEB-BUSINESS-001 §40 — permanent architecture guards (ADR-066).
// These are source-level invariants that must never silently regress: the two
// authorities stay separate, the browser never holds a credential, the Business
// context is the same Flutter product (not a second codebase), and payer routes
// stay Consumer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { matchRoute } from '../lib/bff.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const read = (p) => readFileSync(join(REPO, p), 'utf8');

test('GUARD: no Consumer token on a Business route and vice-versa', () => {
  // A route resolves under exactly one authority — the BFF can never attach the
  // wrong authority's bearer (WEB_BFF_CROSS_CONTEXT_TOKEN_LEAKAGE=0).
  assert.equal(matchRoute('POST', '/v1/merchant/auth/token', 'consumer'), null);
  assert.equal(matchRoute('GET', '/v1/business/receive-point', 'consumer'), null);
  assert.equal(matchRoute('POST', '/v1/transfers', 'business'), null);
  assert.equal(matchRoute('GET', '/v1/me/wallet/balance', 'business'), null);
});

test('GUARD: the BFF attaches the bearer of the ROUTE authority only', () => {
  const s = read('apps/app-banzami/server.mjs');
  // The bearer is selected via authorityOf(rec, authority) — never a single global bearer.
  assert.match(s, /authorityOf\(rec, authority\)/);
  // The upstream base is chosen by authority (typed), not string-matched.
  assert.match(s, /UPSTREAM_BASE\[authority\]/);
});

test('GUARD: no upstream credential is exposed to the browser', () => {
  const s = read('apps/app-banzami/server.mjs');
  // Both sign-ins replace the token in the browser body with the sentinel.
  assert.match(s, /json\.token = TOKEN_SENTINEL/);
  assert.match(s, /json\.refresh_token = TOKEN_SENTINEL/);
});

test('GUARD: active_context is a preference, never authority', () => {
  const s = read('apps/app-banzami/server.mjs');
  // Switching to Business requires an actual business authority (else 409).
  assert.match(s, /NO_BUSINESS_AUTHORITY/);
});

test('GUARD: the Business Web client never stores a credential in the browser', () => {
  // The web merchant session holds NO token; it relies on the BFF cookie.
  const sess = read('apps/mobile/lib/merchant/web/merchant_web_session.dart');
  assert.doesNotMatch(sess, /localStorage|sessionStorage|flutter_secure_storage|shared_preferences/i);
  assert.match(sess, /holds NO credential/i);
  // The client points at the same-origin BFF prefix, not the gateway directly.
  const appf = read('apps/mobile/lib/merchant/web/business_web_app.dart');
  assert.match(appf, /baseUrl: '\/business\/api'/);
  assert.doesNotMatch(appf, /https:\/\/(sandbox-)?api\.banzami\.com/);
});

test('GUARD: Business Web is the same Flutter product (not a second frontend)', () => {
  // The web entry branches on the URL into the SAME app; it does not spawn a new project.
  const entry = read('apps/mobile/lib/main_consumer_web.dart');
  assert.match(entry, /pathSegments/);
  assert.match(entry, /runBusinessWeb/);
  // The Business shell reuses the canonical client + QR renderer.
  const shell = read('apps/mobile/lib/merchant/web/business_shell.dart');
  assert.match(shell, /BanzamiQrDisplay/);
});

test('GUARD: payer routes belong to Consumer authority', () => {
  // The payer actions (transfers, payment-link pay, receive-point pay, qr pay) are
  // Consumer-authority routes; none exist under Business.
  for (const p of ['/v1/transfers', '/v1/payment-links/abc/pay', '/v1/receive-points/abc/pay', '/v1/qr/pay']) {
    assert.ok(matchRoute('POST', p, 'consumer'), `${p} must be a consumer route`);
    assert.equal(matchRoute('POST', p, 'business'), null, `${p} must NOT be a business route`);
  }
});
