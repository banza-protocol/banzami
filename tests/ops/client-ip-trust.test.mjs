// Who the client is — decided once, at the edge, and believed only from there.
//
//   node --test tests/ops/client-ip-trust.test.mjs
//
// Every per-IP limit in the Go services (credential sign-in, OTP, onboarding,
// proof lookups) keys on the client address. The services read ONE header —
// X-Real-IP — and only from a peer in TRUSTED_PROXY_CIDRS
// (services/common/clientip, A9-09). That is sound only while:
//
//   1. every edge location that proxies REPLACES X-Real-IP (and the other
//      client-address headers) with $remote_addr — never passes the caller's
//      value through, appends to it, or copies a raw request header. nginx's
//      proxy_set_header is inherited only by a level that sets none of its own,
//      so a location that adds any header silently drops the server's;
//   2. $remote_addr is Cloudflare's CF-Connecting-IP only from Cloudflare's
//      ranges (real_ip), on both edges, with one list;
//   3. no Go service believes a client-address header by itself;
//   4. the retired edge configs that forwarded the raw $http_cf_connecting_ip
//      (banzami.conf, zz-developer-api.conf) stay retired.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// ─── a small nginx parser: quotes and comments respected ────────────────────
function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '{' || c === '}' || c === ';') { out.push(c); i++; continue; }
    let w = '';
    while (i < src.length && !/[\s;{}]/.test(src[i])) {
      const q = src[i];
      if (q === '"' || q === "'") {
        i++;
        while (i < src.length && src[i] !== q) {
          if (src[i] === '\\') { w += src[i++]; }
          w += src[i++];
        }
        i++;
      } else {
        w += src[i++];
      }
    }
    out.push(w);
  }
  return out;
}

/** [{ name, args, children|null }] */
function parse(src) {
  const toks = tokenize(src);
  let i = 0;
  function block() {
    const nodes = [];
    while (i < toks.length && toks[i] !== '}') {
      const words = [];
      while (i < toks.length && toks[i] !== ';' && toks[i] !== '{' && toks[i] !== '}') words.push(toks[i++]);
      if (toks[i] === ';') { i++; nodes.push({ name: words[0], args: words.slice(1), children: null }); continue; }
      if (toks[i] === '{') { i++; const children = block(); i++; nodes.push({ name: words[0], args: words.slice(1), children }); continue; }
    }
    return nodes;
  }
  return block();
}

const directives = (nodes, name) => nodes.filter((n) => n.name === name);

/** Every location that proxies, with the proxy_set_header set nginx applies to it. */
function proxiedLocations(path) {
  const top = parse(read(path));
  const httpHeaders = directives(top, 'proxy_set_header');
  const out = [];
  for (const server of directives(top, 'server')) {
    const host = directives(server.children, 'server_name')[0]?.args.join(' ') ?? '(no server_name)';
    const serverHeaders = directives(server.children, 'proxy_set_header');
    const walk = (nodes, inherited, where) => {
      for (const loc of directives(nodes, 'location')) {
        const own = directives(loc.children, 'proxy_set_header');
        const effective = own.length ? own : inherited;
        const label = `${host} location ${loc.args.join(' ')}${where}`;
        if (directives(loc.children, 'proxy_pass').length) {
          out.push({ label, headers: Object.fromEntries(effective.map((d) => [d.args[0].toLowerCase(), d.args[1]])) });
        }
        walk(loc.children, effective, ` (in ${loc.args.join(' ')})`);
      }
    };
    walk(server.children, serverHeaders.length ? serverHeaders : httpHeaders, '');
  }
  return out;
}

const CLIENT_HEADERS = ['x-real-ip', 'x-forwarded-for', 'true-client-ip'];

// The header the Go services read, taken from the helper itself so the two can
// never drift apart.
const SERVICE_HEADER = /HeaderRealIP = "([^"]+)"/.exec(read('services/common/clientip/clientip.go'))[1].toLowerCase();

const EDGES = {
  'infra/nginx/sandbox-edge.conf.template': ['x-real-ip', 'x-forwarded-for', 'true-client-ip'],
  'infra/nginx/website.conf': ['x-real-ip', 'x-forwarded-for'],
  'infra/nginx/website-developers.conf': ['x-real-ip', 'x-forwarded-for'],
};

test('the services read the header the edges overwrite', () => {
  assert.equal(SERVICE_HEADER, 'x-real-ip');
  for (const required of Object.values(EDGES)) assert.ok(required.includes(SERVICE_HEADER));
});

for (const [path, required] of Object.entries(EDGES)) {
  test(`${path}: every proxied location replaces the client address with $remote_addr`, () => {
    const locs = proxiedLocations(path);
    assert.ok(locs.length > 0, `${path}: no proxied location found — the parser or the file changed`);
    for (const { label, headers } of locs) {
      for (const h of required) {
        assert.equal(headers[h], '$remote_addr', `${label}: ${h} must be set to $remote_addr (got ${headers[h] ?? 'nothing — the caller’s value passes through'})`);
      }
      for (const h of CLIENT_HEADERS) {
        if (headers[h] !== undefined) assert.equal(headers[h], '$remote_addr', `${label}: ${h} = ${headers[h]}`);
      }
    }
  });
}

// ─── $remote_addr is Cloudflare's word only from Cloudflare ─────────────────
function realIp(path) {
  const top = parse(read(path));
  return {
    header: directives(top, 'real_ip_header').map((d) => d.args[0]),
    recursive: directives(top, 'real_ip_recursive').map((d) => d.args[0]),
    from: directives(top, 'set_real_ip_from').map((d) => d.args[0]),
  };
}

test('both edges believe CF-Connecting-IP from Cloudflare only, with one list', () => {
  const edge = realIp('infra/nginx/sandbox-edge.conf.template');
  const web = realIp('infra/nginx/website.conf');
  for (const [name, r] of [['sandbox-edge', edge], ['website', web]]) {
    assert.deepEqual(r.header, ['CF-Connecting-IP'], `${name}: real_ip_header`);
    assert.deepEqual(r.recursive, ['off'], `${name}: real_ip_recursive`);
    assert.ok(r.from.length >= 15, `${name}: Cloudflare's ranges are missing`);
    for (const cidr of r.from) {
      assert.ok(!/\/0$/.test(cidr) && !/^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|fc|fd|unix:)/.test(cidr),
        `${name}: set_real_ip_from ${cidr} would let a non-Cloudflare peer name the client`);
    }
  }
  assert.deepEqual(web.from, edge.from, 'the website edge trusts a different Cloudflare list than the Sandbox edge');
});

test('the retired edge configs that forwarded the raw CF-Connecting-IP stay retired', () => {
  for (const f of ['infra/nginx/banzami.conf', 'infra/nginx/zz-developer-api.conf']) {
    assert.ok(!existsSync(join(ROOT, f)), `${f} is back: it forwarded $http_cf_connecting_ip, which a caller reaching the origin writes itself`);
  }
});

// ─── no Go service believes a client-address header by itself ────────────────
function goSources(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...goSources(p));
    else if (e.endsWith('.go') && !e.endsWith('_test.go')) out.push(p);
  }
  return out;
}

test('no Go service takes the client address from a request header itself', () => {
  const offenders = [];
  for (const svc of ['api-gateway', 'public-api', 'admin-api', 'developer-api']) {
    for (const f of goSources(join(ROOT, 'services', svc))) {
      read(f.slice(ROOT.length + 1)).split('\n').forEach((line, n) => {
        const code = line.replace(/\/\/.*$/, '');
        if (/\bRealIP\b/.test(code) && /middleware|chimw/i.test(code)) offenders.push(`${f}:${n + 1}: chi RealIP`);
        if (/Header\.Get\(\s*"(X-Forwarded-For|X-Real-IP|True-Client-IP|CF-Connecting-IP|Forwarded)"/i.test(code)) offenders.push(`${f}:${n + 1}: ${code.trim()}`);
      });
    }
  }
  assert.deepEqual(offenders, [], 'read the client through services/common/clientip (RemoteAddr after its middleware)');
});
