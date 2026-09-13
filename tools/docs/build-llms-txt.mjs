#!/usr/bin/env node
/**
 * developers.banzami.com/llms.txt — the documentation as an index a tool or an
 * assistant can read, generated from the same sources the pages render: the page
 * list and descriptions, the endpoint contracts, the event reference and the
 * error catalogue. Nothing here is written by hand, so it cannot say something
 * the documentation does not; --check fails when the committed file is stale.
 *
 *   node tools/docs/build-llms-txt.mjs          # write
 *   node tools/docs/build-llms-txt.mjs --check  # verify
 */
process.removeAllListeners('warning');
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.BZ_DOCS_ROOT ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const DIR = join(ROOT, 'apps/website/app/developers/docs');
const OUT = join(ROOT, 'apps/website/public/llms.txt');
const ORIGIN = 'https://developers.banzami.com';
const read = (f) => readFileSync(join(DIR, f), 'utf8');

const { ENDPOINT_META } = await import(pathToFileURL(join(DIR, 'endpoint-meta.ts')).href);
const { EVENT_DOCS } = await import(pathToFileURL(join(DIR, 'events.ts')).href);
const { DOCS_META } = await import(pathToFileURL(join(DIR, 'docs-meta.ts')).href);
const catalogue = JSON.parse(read('error-catalogue.json'));
const shell = read('shell.tsx');
const reference = read('reference.tsx');
const sdkVersion = JSON.parse(readFileSync(join(ROOT, 'sdk/typescript/package.json'), 'utf8')).version;

const block = (name) => shell.slice(shell.indexOf(`export const ${name}`), shell.indexOf('];', shell.indexOf(`export const ${name}`)));
const areas = [...block('AREAS_EN').matchAll(/\{ slug: '([a-z-]*)', label: '([^']+)', desc: '([^']+)' \}/g)].map((m) => ({ slug: m[1], label: m[2] }));
const groups = [...shell.slice(shell.indexOf('export const NAV_GROUPS')).matchAll(/\{ id: '([a-z]+)', title: \{ pt: '[^']+', en: '([^']+)' \}, slugs: \[([^\]]*)\] \}/g)]
  .map((m) => ({ title: m[2], slugs: [...m[3].matchAll(/'([a-z-]*)'/g)].map((x) => x[1]) }));
const endpoints = [...reference.matchAll(/id: '(ref-[^']+)',\s*method: '(GET|POST|DELETE)',\s*path: '([^']+)'/g)].map((m) => ({ id: m[1], method: m[2], path: m[3] }));

const lines = [];
const push = (...l) => lines.push(...l);
push(
  '# Banzami Developers',
  '',
  `> ${DOCS_META[''].en[1]}`,
  '',
  `- API: ${ORIGIN.replace('developers', 'sandbox-api')}/v1 (Sandbox). Authentication: Authorization: Bearer bz_test_sk_… (project secret key, server-side only).`,
  `- Financial Live: unavailable (fail-closed). bz_live_ keys are refused.`,
  `- Amounts are integers in minor units: 100 = 1 Kz.`,
  `- Server SDK: @banzami/sdk (npm install @banzami/sdk), current version ${sdkVersion}. OpenAPI: ${ORIGIN}/developers/openapi/banzami-sandbox.openapi.json`,
  `- Portuguese pages: ${ORIGIN}/docs · English pages: ${ORIGIN}/docs/en`,
  '',
);
for (const g of groups) {
  push(`## ${g.title}`, '');
  for (const slug of g.slugs) {
    const a = areas.find((x) => x.slug === slug);
    const url = `${ORIGIN}/docs/en${slug ? `/${slug}` : ''}`;
    push(`- [${a.label}](${url}): ${DOCS_META[slug].en[1]}`);
  }
  push('');
}
push('## Endpoints', '');
for (const e of endpoints) {
  const m = ENDPOINT_META[e.id];
  push(`- ${e.method} ${e.path} — scope ${m.scope ?? 'none (public)'}${m.sdk ? `; SDK ${m.sdk}()` : ''}${m.events.length ? `; events ${m.events.join(', ')}` : ''} — ${ORIGIN}/docs/en/reference#${e.id}`);
}
push('', '## Webhook events', '');
for (const e of EVENT_DOCS) push(`- ${e.name}: ${e.when.en} Fields: ${e.fields.map((f) => f.name).join(', ')}. — ${ORIGIN}/docs/en/events#event-${e.name.replace('.', '-')}`);
push('', '## Errors', '', `Envelope: { ${catalogue.envelope.fields.join(', ')} }. Branch on code. ${catalogue.idempotency_rule.en}`, '');
for (const e of catalogue.errors) push(`- ${e.code} (${e.http.join(', ')}): ${e.meaning.en} ${e.action.en}`);
push('');

const text = `${lines.join('\n')}\n`;
if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { /* missing */ }
  const stale = current !== text;
  console.log(`AI_READABLE_DOCS_LINES=${lines.length}`);
  console.log(`AI_READABLE_DOCS_STALE=${stale ? 1 : 0}`);
  console.log(`DOCS_AI_READABLE=${stale ? 'FAIL' : 'PASS'}`);
  if (stale) { console.error('✗ apps/website/public/llms.txt is stale — run node tools/docs/build-llms-txt.mjs'); process.exit(1); }
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT} (${lines.length} lines)`);
}
