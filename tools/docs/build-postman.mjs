#!/usr/bin/env node
/**
 * The Postman collection, generated from the published OpenAPI.
 *
 * It was written by hand, once, and then said things the API had stopped
 * saying: that refunds and transfers were absent (both published since), that
 * the Sandbox was a "Preview". A second contract kept by hand drifts from the
 * first. This builds it from docs/developer/openapi/banzami-sandbox.openapi.json
 * — every operation, grouped by tag, with the example body, the Idempotency-Key
 * header where the operation takes one, and the credential the operation
 * needs (project key, the realtime status token, or none) — and writes the
 * website's copy byte-identical.
 *
 *   node tools/docs/build-postman.mjs          write both copies
 *   node tools/docs/build-postman.mjs --check  fail if either is stale (CI)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const SPEC = join(ROOT, 'docs/developer/openapi/banzami-sandbox.openapi.json');
const OUTS = [
  join(ROOT, 'docs/developer/postman/banzami-sandbox.postman_collection.json'),
  join(ROOT, 'apps/website/public/developers/postman/banzami-sandbox.postman_collection.json'),
];
const CHECK = process.argv.includes('--check');

const spec = JSON.parse(readFileSync(SPEC, 'utf8'));
const refParam = (p) => (p.$ref ? spec.components.parameters[p.$ref.split('/').pop()] : p);

const folders = new Map();
for (const tag of spec.tags ?? []) folders.set(tag.name, { name: tag.name, description: tag.description, item: [] });

for (const [path, ops] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
    const params = (op.parameters ?? []).map(refParam);
    const segments = path.split('/').filter(Boolean).map((s) => s.replace(/^\{(\w+)\}$/, ':$1'));
    const pathVars = params.filter((p) => p.in === 'path').map((p) => ({ key: p.name, value: String(p.example ?? `${p.name}_xxx`) }));
    const query = params.filter((p) => p.in === 'query').map((p) => ({ key: p.name, value: String(p.example ?? ''), disabled: true }));
    const header = [];
    const body = op.requestBody?.content?.['application/json'];
    if (body) header.push({ key: 'Content-Type', value: 'application/json' });
    for (const p of params.filter((x) => x.in === 'header')) {
      if (p.name === 'Idempotency-Key') header.push({ key: 'Idempotency-Key', value: 'idem_xxx' });
      else if (p.name === 'Accept') header.push({ key: 'Accept', value: 'text/event-stream' });
    }
    const request = {
      method: method.toUpperCase(),
      header,
      url: {
        raw: `{{baseUrl}}/${segments.join('/')}`,
        host: ['{{baseUrl}}'],
        path: segments,
        ...(query.length ? { query } : {}),
        ...(pathVars.length ? { variable: pathVars } : {}),
      },
      description: [op.summary, op.description].filter(Boolean).join('\n\n'),
    };
    if (body) request.body = { mode: 'raw', raw: JSON.stringify(body.example ?? {}, null, 2), options: { raw: { language: 'json' } } };
    if (Array.isArray(op.security) && op.security.length === 0) request.auth = { type: 'noauth' };
    else if (op.security?.[0]?.statusToken) request.auth = { type: 'bearer', bearer: [{ key: 'token', value: '{{statusToken}}', type: 'string' }] };
    const tag = op.tags?.[0] ?? 'other';
    if (!folders.has(tag)) folders.set(tag, { name: tag, item: [] });
    folders.get(tag).item.push({ name: `${method.toUpperCase()} ${path} — ${op.operationId}`, request });
  }
}

const collection = {
  info: {
    name: 'Banzami Sandbox API',
    description: `${spec.info.title} ${spec.info.version}, generated from ${'docs/developer/openapi/banzami-sandbox.openapi.json'} by tools/docs/build-postman.mjs. `
      + 'Public Sandbox: fictitious value; real-money operations are not ready and refuse bz_live_ keys. Set apiKey to YOUR Sandbox secret key '
      + '(the default is an obvious placeholder), and statusToken to a session’s realtime.token for the realtime route. '
      + 'The hosted payment page for a session is https://pay.banzami.com/pay/{slug}.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{apiKey}}', type: 'string' }] },
  variable: [
    { key: 'baseUrl', value: 'https://sandbox-api.banzami.com' },
    { key: 'apiKey', value: 'bz_test_sk_XXXX' },
    { key: 'statusToken', value: 'bzst_xxx' },
  ],
  item: [...folders.values()].filter((f) => f.item.length),
};

const text = `${JSON.stringify(collection, null, 2)}\n`;
if (CHECK) {
  const stale = OUTS.filter((o) => !existsSync(o) || readFileSync(o, 'utf8') !== text);
  if (stale.length) {
    console.error(`✗ Postman collection stale — run node tools/docs/build-postman.mjs\n  ${stale.map((o) => o.slice(ROOT.length + 1)).join('\n  ')}`);
    console.log('POSTMAN_COLLECTION_CURRENT=FAIL');
    process.exit(1);
  }
  console.log(`✓ the Postman collection is the OpenAPI's ${collection.item.reduce((n, f) => n + f.item.length, 0)} operations, in both copies`);
  console.log('POSTMAN_COLLECTION_CURRENT=PASS');
} else {
  for (const o of OUTS) writeFileSync(o, text);
  console.log(`wrote ${OUTS.length} copies (${collection.item.reduce((n, f) => n + f.item.length, 0)} operations)`);
}
