#!/usr/bin/env node
/**
 * The API Explorer's allowlist, generated from the published OpenAPI.
 *
 * The Explorer (ADR-060 §7) runs a request server-side with a 60-second key
 * scoped to ONE operation. What it may run is exactly what the contract
 * publishes to a project key — never a route the spec does not describe, never
 * one the spec says a project key is refused, never one without a scope.
 * developer-api embeds the generated file; the Console reads it from there.
 *
 *   node tools/docs/build-explorer-allowlist.mjs          write
 *   node tools/docs/build-explorer-allowlist.mjs --check  fail if stale (CI)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.BZ_DOCS_ROOT ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const SPEC = join(ROOT, 'docs/developer/openapi/banzami-sandbox.openapi.json');
const OUT = join(ROOT, 'services/developer-api/internal/developer/explorer_operations.json');
const CHECK = process.argv.includes('--check');

const spec = JSON.parse(readFileSync(SPEC, 'utf8'));
const refParam = (p) => (p.$ref ? spec.components.parameters[p.$ref.split('/').pop()] : p);

const operations = [];
for (const [path, ops] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
    const scope = op['x-banzami-scope'];
    // No scope: a public or status-token route, which needs no key to call.
    // Refused: the spec itself says a project key cannot call it.
    if (!scope || op['x-banzami-project-key'] === 'refused') continue;
    const params = (op.parameters ?? []).map(refParam);
    const body = op.requestBody?.content?.['application/json'];
    operations.push({
      operation_id: op.operationId,
      tag: op.tags?.[0] ?? '',
      summary: op.summary ?? '',
      method: method.toUpperCase(),
      path,
      scope,
      path_params: params.filter((p) => p.in === 'path').map((p) => ({ name: p.name, example: String(p.example ?? '') })),
      query_params: params.filter((p) => p.in === 'query').map((p) => ({ name: p.name, type: p.schema?.type ?? 'string' })),
      idempotency: params.some((p) => p.in === 'header' && p.name === 'Idempotency-Key'),
      idempotency_required: params.some((p) => p.in === 'header' && p.name === 'Idempotency-Key' && p.required === true),
      body: Boolean(body),
      example_body: body?.example ?? null,
    });
  }
}
operations.sort((a, b) => a.tag.localeCompare(b.tag) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

const text = `${JSON.stringify({ source: 'docs/developer/openapi/banzami-sandbox.openapi.json', spec_version: spec.info.version, operations }, null, 2)}\n`;
if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== text) {
    console.error('✗ explorer_operations.json is stale — run node tools/docs/build-explorer-allowlist.mjs');
    console.log('EXPLORER_ALLOWLIST_CURRENT=FAIL');
    process.exit(1);
  }
  console.log(`✓ the API Explorer runs exactly the ${operations.length} project-key operations the OpenAPI publishes`);
  console.log('EXPLORER_ALLOWLIST_CURRENT=PASS');
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT.slice(ROOT.length + 1)} (${operations.length} operations)`);
}
