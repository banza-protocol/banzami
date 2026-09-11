// Every Core /internal route is authenticated. core/api/src/main.rs registers
// them in three groups, each closed by a route_layer carrying a service
// credential: the general group (CORE_INTERNAL_KEY, loopback excepted), refunds
// (CORE_INTERNAL_KEY) and payee validation (CORE_PAYEE_VALIDATION_KEY). A route
// registered anywhere else is reachable by any container on the network — as
// every route but refunds and payee validation was until 2026-09-11.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(import.meta.dirname, '../../core/api/src/main.rs'), 'utf8');

function block(start, end) {
  const a = SRC.indexOf(start);
  const b = SRC.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `group not found: ${start} … ${end}`);
  return [a, b];
}

test('every /internal route sits inside an authenticated group', () => {
  const groups = [
    block('let refund_routes = Router::new()', '.route_layer(refund_service_auth)'),
    block('let payee_routes = Router::new()', '.route_layer(payee_service_auth)'),
    block('let internal_routes = Router::new()', '.route_layer(general_service_auth)'),
  ];
  const outside = [];
  let total = 0;
  for (const m of SRC.matchAll(/"\/internal\/[^"]*"/g)) {
    // Comments are not routes.
    const lineStart = SRC.lastIndexOf('\n', m.index) + 1;
    if (/^\s*\/\//.test(SRC.slice(lineStart, m.index))) continue;
    total++;
    if (!groups.some(([a, b]) => m.index > a && m.index < b)) {
      outside.push(`${m[0]} (line ${SRC.slice(0, m.index).split('\n').length})`);
    }
  }
  assert.ok(total > 100, `found only ${total} routes — the scan is not reading the router`);
  assert.deepEqual(outside, []);
});

test('the gated groups are what the server serves', () => {
  const app = SRC.slice(SRC.indexOf('let app = Router::new()'));
  for (const g of ['.merge(internal_routes)', '.merge(refund_routes)', '.merge(payee_routes)']) {
    assert.ok(app.includes(g), `${g} missing from the served router`);
  }
  assert.match(SRC, /into_make_service_with_connect_info::<std::net::SocketAddr>\(\)/,
    'without connection info the loopback exception can never apply — and must not be faked');
});
