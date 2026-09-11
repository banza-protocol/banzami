// A proof reference is a bearer capability; nginx must never write one whole.
//
// Both edges that carry references (banzami.com for /r/<ref>, the Sandbox API
// edge for /v1/public/proofs/<ref>) log through map $request $bz_request_redacted.
// This runs the map's actual regex and replacement, taken from the two configs,
// over request lines a client can send — canonical references and every altered
// spelling that previously slipped past a mask anchored on "BZM-".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REF = 'BZM-7K2M-9QXR-4TWZ-H3YJ-QY5R-BYN0'; // synthetic
const TAIL = REF.slice(8); // everything past the 8 characters a log may keep

function redactor(path) {
  const conf = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const m = conf.match(/map \$request \$bz_request_redacted \{\s*"~(\*?)([^"]+)"\s+"([^"]+)";\s*default \$request;/);
  assert.ok(m, `${path}: the redaction map is missing or changed shape`);
  const re = new RegExp(m[2], m[1] ? 'i' : '');
  const out = m[3].replace(/\$\{(\w+)\}/g, '$<$1>');
  return (line) => line.replace(re, out);
}

const lines = [];
for (const route of ['/v1/public/proofs/', '/r/', '//r/', '//v1/public/proofs/', '/v1//public/proofs/', '/V1/public/proofs/', '/R/', '/', '/anything/else/', '/verificar?ref=', '/r/x']) {
  for (const seg of [
    REF, REF.toLowerCase(), '%20' + REF, '%2520' + REF, '%EF%BB%BF' + REF, '%E2%80%8B' + REF,
    REF + '%20', REF.replace(/-/g, '%E2%80%93'), 'X' + REF, REF + '?x=1', REF + '/extra',
    REF.slice(4), REF.slice(4).toLowerCase(), 'x' + REF.slice(4),
  ]) {
    lines.push(`GET ${route}${seg} HTTP/1.1`, `GET ${route}${seg} HTTP/2.0`, `GET ${route}${seg}`);
  }
}

for (const path of ['infra/nginx/website.conf', 'infra/nginx/sandbox-edge.conf.template']) {
  test(`${path}: no request line logs a proof reference whole`, () => {
    const redact = redactor(path);
    for (const line of lines) {
      const logged = redact(line);
      const tail = decodeURIComponent(TAIL.toLowerCase());
      assert.ok(!logged.toLowerCase().includes(tail.slice(0, 9)), `logged too much of the reference: ${logged}`);
      assert.ok(logged.startsWith('GET /'), `the method and the start of the path stay readable: ${logged}`);
    }
  });

  test(`${path}: other routes are logged as they are`, () => {
    const redact = redactor(path);
    for (const line of ['GET /v1/wallets HTTP/1.1', 'GET /verificar HTTP/2.0', 'POST /v1/transfers HTTP/1.1',
      'GET /v1/consumer/transactions/f99338e2-b4e5-4309-ba3e-d0a376ed94b5/receipt.pdf HTTP/2.0',
      'GET /v1/payment-links/pl-7k2m9qxr HTTP/1.1', 'GET /_next/static/chunks/app-2026-09-11.js HTTP/2.0']) {
      assert.equal(redact(line), line);
    }
  });
}

test('both edges redact with the same rule', () => {
  const pick = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').match(/map \$request \$bz_request_redacted \{[^}]+\}/)[0];
  assert.equal(pick('infra/nginx/website.conf'), pick('infra/nginx/sandbox-edge.conf.template'));
});

// The map only protects the servers that log through it. A server with no
// access_log of its own inherits nginx.conf's "main" format — the request line
// whole, and the Referer — and any host can be sent a reference (a default
// server, a vhost for another product, a mistyped host). Until 2026-09-11 only
// banzami.com and sandbox-api did.
const EDGE_CONFIGS = [
  'infra/nginx/website.conf', 'infra/nginx/website-developers.conf',
  'infra/nginx/website-default-guard.conf', 'infra/nginx/sandbox-edge.conf.template',
];
for (const path of EDGE_CONFIGS) {
  test(`${path}: every server logs redacted, or not at all`, () => {
    const conf = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
      .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    const servers = conf.split(/^server \{/m).slice(1).map((b) => b.split(/^\}/m)[0]);
    assert.ok(servers.length > 0, `${path}: no server block found`);
    for (const body of servers) {
      const name = (body.match(/^\s{4}server_name ([^;]+);/m) ?? [])[1] ?? '?';
      const own = body.match(/^ {4}access_log ([^;]+);/gm) ?? [];
      assert.ok(own.length > 0, `${path}: server ${name} has no access_log of its own, so it inherits the unredacted default`);
    }
    for (const [, args] of conf.matchAll(/access_log ([^;]+);/g)) {
      assert.ok(args === 'off' || /\sbz_redacted$/.test(args), `${path}: access_log ${args} does not use bz_redacted`);
    }
    for (const [, name] of conf.matchAll(/log_format\s+(\S+)/g)) {
      assert.equal(name, 'bz_redacted', `${path}: another log format (${name}) is defined`);
    }
  });
}

// Stage two: the application-id map runs over stage one's output and is what
// the log format writes.
function appRedactor(path) {
  const conf = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const m = conf.match(/map \$bz_request_redacted \$bz_request_logged \{\s*"~(\*?)([^"]+)"\s+"([^"]+)";\s*default \$bz_request_redacted;/);
  assert.ok(m, `${path}: the application-id map is missing or changed shape`);
  // Stage two feeds the log — directly, or through stage three, which only cuts
  // the query (tests/ops/nginx-query-log-redaction.test.mjs).
  assert.match(conf, /map \$bz_request_logged \$bz_request_final \{/, `${path}: stage three must read stage two`);
  assert.match(conf, /log_format bz_redacted '[^']*"\$bz_request_final"/, `${path}: the log format does not write the final stage`);
  const re = new RegExp(m[2].replace(/\(\?<(\w+)>/g, '(?<$1>'), m[1] ? 'i' : '');
  return (line) => line.replace(re, m[3].replace(/\$\{(\w+)\}/g, '$<$1>'));
}

for (const path of ['infra/nginx/website.conf', 'infra/nginx/sandbox-edge.conf.template']) {
  test(`${path}: an application id is logged by its first 8 characters only`, () => {
    const redact = appRedactor(path);
    const id = '3f6c2a1e-9b7d-4c21-8e5f-0a1b2c3d4e5f'; // synthetic
    for (const seg of [id, id.toUpperCase(), `{${id}}`, `%7B${id}%7D`, `urn:uuid:${id}`]) {
      for (const tail of ['', '/documents', '/documents/upload-url', '/resubmit', '?x=1']) {
        const logged = redact(`GET /v1/merchant/applications/${seg}${tail} HTTP/2.0`);
        assert.ok(!logged.toLowerCase().includes(id.slice(9)), `logged too much: ${logged}`);
        assert.ok(logged.toLowerCase().includes(id.slice(0, 8)), `lost the prefix: ${logged}`);
      }
    }
    for (const line of ['GET /v1/merchant/applications/check-handle HTTP/2.0', 'POST /v1/merchant/applications HTTP/2.0']) {
      assert.equal(redact(line), line);
    }
  });
}

test('both edges mask application ids with the same rule', () => {
  const pick = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').match(/map \$bz_request_redacted \$bz_request_logged \{[^}]+\}/)[0];
  assert.equal(pick('infra/nginx/website.conf'), pick('infra/nginx/sandbox-edge.conf.template'));
});
