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
