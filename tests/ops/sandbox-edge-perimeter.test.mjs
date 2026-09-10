// The Sandbox edge keeps operator surfaces off the perimeter.
//
//   node --test tests/ops/sandbox-edge-perimeter.test.mjs
//
// Internal control-plane routes (/internal/…) and Prometheus metrics are for
// services and the scraper on the Docker network. Through the public edge,
// /metrics on sandbox-api and /api/metrics on admin.banzami.com were readable by
// anyone — the admin-api one carries the operator attention counts BANZADMIN
// shows only to an authenticated operator, per role. This reads the template the
// edge renders and requires an exact-match 404 for each, answered by the edge
// itself (a `return 404`, never a proxy_pass).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TEMPLATE = join(import.meta.dirname, '../../infra/nginx/sandbox-edge.conf.template');

/** server_name → the text of its server block. */
function serverBlocks(src) {
  const out = {};
  const re = /server\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 1, i = re.lastIndex;
    while (depth > 0 && i < src.length) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    const body = src.slice(re.lastIndex, i - 1);
    const name = /server_name\s+([^;]+);/.exec(body)?.[1]?.trim();
    if (name) out[name] = body;
  }
  return out;
}

/** The body of `location <modifier> <path> { … }` in a server block, or null. */
function location(block, spec) {
  const esc = spec.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/\s+/g, '\\s+');
  const m = new RegExp(`location\\s+${esc}\\s*\\{([^}]*)\\}`).exec(block);
  return m ? m[1] : null;
}

const blocks = serverBlocks(readFileSync(TEMPLATE, 'utf8'));

const REQUIRED = {
  'sandbox-api.banzami.com': ['/internal/', '/consumer/internal/', '= /metrics', '= /consumer/metrics'],
  'developer-api.banzami.com': ['/internal/'],
  'admin.banzami.com': ['= /api/metrics'],
};

for (const [host, specs] of Object.entries(REQUIRED)) {
  for (const spec of specs) {
    test(`${host}: location ${spec} is answered 404 by the edge`, () => {
      assert.ok(blocks[host], `no server block for ${host}`);
      const body = location(blocks[host], spec);
      assert.ok(body, `${host} has no "location ${spec}"`);
      assert.match(body, /return\s+404/, `${host} location ${spec} must return 404`);
      assert.doesNotMatch(body, /proxy_pass/, `${host} location ${spec} must not proxy`);
    });
  }
}
