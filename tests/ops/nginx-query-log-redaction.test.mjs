// A query string is never written to an edge access log.
//
// Queries carry capabilities and personal data: an operator's invite or reset
// token, a Business activation token, an applicant's status reference, a
// developer's email. The third map cuts every query to "?..."; this runs the
// three maps of each edge, in order, over request lines a browser sends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

function stages(path) {
  const conf = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const maps = [...conf.matchAll(/map \$(\w+) \$(\w+) \{\s*"~(\*?)([^"]+)"\s+"([^"]+)";\s*default \$(\w+);\s*\}/g)];
  const byOut = Object.fromEntries(maps.map((m) => [m[2], m]));
  const chain = ['bz_request_redacted', 'bz_request_logged', 'bz_request_final'].map((n) => {
    const m = byOut[n];
    assert.ok(m, `${path}: map $${n} is missing`);
    const re = new RegExp(m[4].replace(/\\\\/g, '\\'), m[3] ? 'i' : '');
    const out = m[5].replace(/\$\{(\w+)\}/g, '$<$1>');
    return (line) => line.replace(re, out);
  });
  assert.match(conf, /log_format bz_redacted '[^']*\$bz_request_final/, `${path}: the log format must log the final stage`);
  assert.match(conf, /error_log \S+ crit;/, `${path}: nginx's error log must not copy request lines`);
  return (line) => chain.reduce((l, f) => f(l), line);
}

// A bearer-shaped value, made at run time so no credential-shaped literal is
// committed (the secret scanner rightly flags one).
const TOKEN = randomBytes(32).toString('hex');
const APP = 'f99338e2-b4e5-4309-ba3e-d0a376ed94b5';

for (const path of ['infra/nginx/website.conf', 'infra/nginx/sandbox-edge.conf.template']) {
  test(`${path}: no query reaches the log`, () => {
    const log = stages(path);
    for (const line of [
      `GET /reset-password?token=${TOKEN} HTTP/2.0`,
      `GET /comerciantes/activar?token=${TOKEN} HTTP/1.1`,
      `GET /comerciantes/candidatura/estado?ref=${APP} HTTP/2.0`,
      `GET /developers/verify?email=ana.maria%40example.ao HTTP/2.0`,
      `GET /x?a=1&token=${TOKEN}`,
    ]) {
      const logged = log(line);
      for (const secret of [TOKEN.slice(0, 12), APP.slice(9), 'ana.maria']) {
        assert.ok(!logged.includes(secret), `logged a capability: ${logged}`);
      }
      assert.match(logged, /^GET \/\S*\?\.\.\./, `the path stays readable: ${logged}`);
    }
  });

  test(`${path}: a request without a query is logged as it is`, () => {
    const log = stages(path);
    for (const line of ['GET /v1/wallets HTTP/1.1', 'POST /v1/transfers HTTP/2.0', 'GET / HTTP/2.0']) {
      assert.equal(log(line), line);
    }
  });
}
