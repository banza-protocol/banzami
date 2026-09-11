// PUBLIC_PROOF_CANONICAL_URL_SPELLINGS = 1.
//
// banzami.com/r/<reference> answers only to the reference exactly as issued.
// The website edge (infra/nginx/website.conf) tests the RAW request URI — before
// nginx decodes escapes or merges slashes — and hands the app /r/_ for any
// other spelling. This runs that regex over raw request URIs a client can send.
// The app repeats the rule (apps/website/lib/proof-ref.ts proofPagePath).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const conf = readFileSync(new URL('../../infra/nginx/website.conf', import.meta.url), 'utf8');
const block = conf.match(/location ~ \^\/r\/ \{([\s\S]*?)\n    \}/);
assert.ok(block, 'the /r/ location is missing from website.conf');
const m = block[1].match(/if \(\$request_uri !~ "([^"]+)"\) \{\s*rewrite \^ \/r\/_\? break;\s*\}/);
assert.ok(m, 'the /r/ location must rewrite every non-canonical raw URI to /r/_');
const canonical = new RegExp(m[1]);

const C = 'BZM-7K2M-9QXR-4TWZ-H3YJ-QY5R-BYN0'; // synthetic
const L = 'BZM-0000-00AA'; // synthetic legacy shape

test('the canonical raw URIs reach the page unchanged', () => {
  for (const uri of [`/r/${C}`, `/r/${L}`, `/r/${C}?utm_source=whatsapp`]) {
    assert.ok(canonical.test(uri), uri);
  }
});

test('every other raw spelling is not the proof URL', () => {
  const head = C.slice(0, -1);
  for (const uri of [
    `/r/${head}%30`, `/r/${C.replace(/-/g, '%2D')}`, `/r/%42${C.slice(1)}`, `/r/${head}%4F`,
    `/r/${C}/`, `//r/${C}`, `/r//${C}`, `/r/${C}%20`, `/r/%20${C}`, `/r/${C};x`,
    `/r/${C.toLowerCase()}`, `/r/${C}-0000`, `/r/${C.slice(0, -1)}`, `/r/`, `/r/_`,
    `/r/${L}/`, `/r/${L.slice(0, -1)}%41`,
  ]) {
    assert.ok(!canonical.test(uri), `${uri} must be rewritten to /r/_`);
  }
});

test('no redirect is issued for a proof path', () => {
  assert.ok(!/return\s+30[1278]/.test(block[1]), 'the /r/ location must never redirect');
});
