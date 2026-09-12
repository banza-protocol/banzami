// The assurance manifest may only claim API surfaces the named service mounts,
// exactly.
//
//   node --test tests/ops/assurance-api-surface.test.mjs
//
// check-assurance-manifest used to accept any declared path that was a PREFIX
// of a mounted route, merged across the gateway and public-api. So CAP-PAY-003
// (QR payments) passed with `/v1/qr` — `/v1/qr/static` exists, the route that
// pays a QR does not (RA-053) — and CAP-WALLET-001 passed with `/v1/transfers`
// on the gateway, where SEC-015 unmounted it (A4-02, A4-09). These cases hold
// the stricter comparison in apiSurfaceViolations.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  parseManifest, loadMountedRoutes, apiSurfaceViolations,
} from '../../tools/assurance-manifest-lib.mjs';

const ROOT = join(import.meta.dirname, '../..');
const routes = loadMountedRoutes(ROOT);
const cap = (...api_surface) => [{ id: 'CAP-TEST-001', api_surface }];

test('the routers parse to a non-trivial route set', () => {
  assert.ok(routes.gateway.length > 100, `gateway: ${routes.gateway.length}`);
  assert.ok(routes['public-api'].length > 20, `public-api: ${routes['public-api'].length}`);
});

test('the real manifest declares only exactly-mounted surfaces', () => {
  const { capabilities } = parseManifest(ROOT);
  assert.deepEqual(apiSurfaceViolations(capabilities, routes), []);
});

test('a prefix of a mounted route is not a mounted route (/v1/qr)', () => {
  const v = apiSurfaceViolations(cap('/v1/qr'), routes);
  assert.equal(v.length, 1);
  assert.match(v[0], /"\/v1\/qr" is not a route gateway mounts/);
  // The issuance routes it prefixes are mounted, so the refusal is about the
  // prefix and nothing else.
  assert.deepEqual(apiSurfaceViolations(cap('POST /v1/qr/static', '/v1/qr/dynamic'), routes), []);
});

test('the QR pay route is claimable on the consumer surface and nowhere else', () => {
  // This used to assert "not claimable anywhere", because nowhere mounted it:
  // the merchant route was withdrawn (RA-053) and the consumer one did not
  // exist. The consumer one exists now (CAP-PAY-003), so the assertion becomes
  // the distinction that actually matters — and keeps the half that still holds.
  //
  // On the gateway it stays unclaimable. That is the surface where the payer was
  // a free-text field on a merchant credential, and a manifest entry claiming it
  // again would be the first step back to that.
  assert.equal(apiSurfaceViolations(cap('POST /v1/qr/pay'), routes).length, 1,
    'the merchant QR-pay route must stay unmountable and unclaimable');
  assert.deepEqual(
    apiSurfaceViolations(cap('POST /v1/qr/pay — public-api Consumer surface'), routes), [],
    'the consumer QR-pay route is mounted and must be claimable',
  );
});

test('a Consumer-surface route is checked against public-api only when the entry says so', () => {
  assert.equal(apiSurfaceViolations(cap('/v1/transfers'), routes).length, 1,
    '/v1/transfers is not mounted on the developer gateway (SEC-015)');
  assert.deepEqual(apiSurfaceViolations(cap('/v1/transfers — public-api Consumer surface'), routes), []);
});

test('a declared HTTP verb must match the mounted verb', () => {
  assert.deepEqual(apiSurfaceViolations(cap('GET /v1/payment-sessions/{id}/qr'), routes), []);
  assert.equal(apiSurfaceViolations(cap('DELETE /v1/payment-sessions/{id}/qr'), routes).length, 1);
});

test('entries that declare no surface, or describe a mechanism, are not route claims', () => {
  assert.deepEqual(apiSurfaceViolations(cap('none (frozen; legacy /v1/splits returns 410 at edge)'), routes), []);
  assert.deepEqual(apiSurfaceViolations(cap('webhook delivery + banza-signature header'), routes), []);
});
