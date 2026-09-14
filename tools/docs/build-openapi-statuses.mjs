#!/usr/bin/env node
/**
 * The success statuses of every public operation, read from the OpenAPI mirror
 * the website publishes — so the reference's "Response · 201 Created" is the
 * contract's, never a hand-written label (DOCS-VISUAL-DX-002).
 *
 *   node tools/docs/build-openapi-statuses.mjs
 *
 * Writes apps/website/app/developers/docs/openapi-statuses.json:
 *   { "POST /v1/payment-sessions": [201], … }
 * openapi-statuses.test.ts fails when the file and the contract disagree.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const SPEC = resolve(ROOT, 'apps/website/public/developers/openapi/banzami-sandbox.openapi.json');
const OUT = resolve(ROOT, 'apps/website/app/developers/docs/openapi-statuses.json');

export function statusesFrom(spec) {
  const out = {};
  for (const [path, ops] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) continue;
      out[`${method.toUpperCase()} ${path}`] = Object.keys(op.responses ?? {}).filter((k) => /^2\d\d$/.test(k)).map(Number).sort((a, b) => a - b);
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

if (process.argv[1]?.endsWith('build-openapi-statuses.mjs')) {
  const map = statusesFrom(JSON.parse(readFileSync(SPEC, 'utf8')));
  writeFileSync(OUT, `${JSON.stringify(map, null, 2)}\n`);
  console.log(`wrote ${OUT}: ${Object.keys(map).length} operations`);
}
