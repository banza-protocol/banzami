#!/usr/bin/env node
/**
 * The API reference, held to the gateway it documents.
 *
 * Every endpoint on /docs/reference must carry the same parts — what it is for,
 * authentication, scope, typed parameters, an example response, reachable
 * errors, events, the SDK method and the guides that use it — and each part must
 * be true of the source:
 *
 *   scope        the scope literal the route's handler demands
 *   body fields  json tags the handler decodes (its own struct or a named one)
 *   query params the parameters the handler reads from the URL
 *   path params  the placeholders in the path
 *   refused      fields the gateway refuses from a project key
 *   SDK method   a method @banzami/sdk defines, calling that route
 *   events       events the operator emits (events.ts, held to core by the
 *                event catalogue gate)
 *   errors       codes in the public error catalogue
 *   guides       documentation pages that exist
 *
 *   node tools/check-docs-api-reference.mjs
 */
// Type-stripped .ts modules warn about the package type; the warning is noise here.
process.removeAllListeners('warning');
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gatewayRoutes, goFunctions } from './lib/error-surface.mjs';

const ROOT = process.env.BZ_DOCS_ROOT ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DOCS = join(ROOT, 'apps/website/app/developers/docs');
const read = (p) => readFileSync(p, 'utf8');

const { ENDPOINT_META } = await import(pathToFileURL(join(DOCS, 'endpoint-meta.ts')).href);
const { EVENT_NAMES } = await import(pathToFileURL(join(DOCS, 'events.ts')).href);
const catalogue = JSON.parse(read(join(DOCS, 'error-catalogue.json')));
const CODES = new Set(catalogue.errors.map((e) => e.code));
const reference = read(join(DOCS, 'reference.tsx'));
const shell = read(join(DOCS, 'shell.tsx'));
const SLUGS = new Set([...shell.slice(shell.indexOf('export const AREAS_PT'), shell.indexOf('];', shell.indexOf('export const AREAS_PT'))).matchAll(/slug: '([a-z-]*)'/g)].map((m) => m[1]));
const sdk = read(join(ROOT, 'sdk/typescript/src/client.ts'));

// ── endpoints as documented ──────────────────────────────────────────────────
const blocks = [];
const starts = [...reference.matchAll(/\{\s*\n\s*id: '(ref-[^']+)',\s*method: '(GET|POST|PUT|DELETE)',\s*path: '([^']+)'/g)];
starts.forEach((m, i) => {
  const end = i + 1 < starts.length ? starts[i + 1].index : reference.indexOf('export const RESTRICTED_ROWS');
  blocks.push({ id: m[1], method: m[2], path: m[3], src: reference.slice(m.index, end) });
});

// ── the gateway ─────────────────────────────────────────────────────────────
const handlerDir = join(ROOT, 'services/api-gateway/internal/handler');
const fns = goFunctions(handlerDir);
const routes = gatewayRoutes(ROOT);
const allGo = readdirSync(handlerDir).filter((f) => f.endsWith('.go') && !f.endsWith('_test.go')).map((f) => read(join(handlerDir, f))).join('\n');
const structTags = (name) => {
  const m = new RegExp(`type ${name} struct \\{([\\s\\S]*?)\\n\\}`).exec(allGo);
  return m ? [...m[1].matchAll(/json:"([a-z_]+)[,"]/g)].map((x) => x[1]) : [];
};
const payeeBlock = /func rejectClientPayeeFields[\s\S]*?\[\]string\{([^}]*)\}/.exec(allGo);
const REFUSED = new Set(payeeBlock ? [...payeeBlock[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]) : []);

function handlerFacts(method, path) {
  const norm = (p) => p.replace(/\{[^}]+\}/g, '{x}');
  const route = routes.find((r) => r.method === method && norm(r.path) === norm(path));
  if (!route) return null;
  const f = fns.get(route.handler);
  let body = f?.body ?? '';
  for (const c of body.matchAll(/h\.(\w+)\(/g)) { const g = fns.get(`${f.type}.${c[1]}`); if (g) body += g.body; }
  // Helpers the handler calls by name (linkActor, resolveWebhookAuthority, …) carry the scope check.
  for (const c of body.matchAll(/\b([a-z]\w+)\(w, r/g)) { const g = fns.get(c[1]); if (g) body += g.body; }
  const scopes = [...new Set([...body.matchAll(/"([a-z_]+:(?:read|write|create))"/g)].map((m) => m[1]))];
  const tags = new Set([...body.matchAll(/json:"([a-z_]+)[,"]/g)].map((m) => m[1]));
  for (const d of body.matchAll(/var\s+\w+\s+(\w+)\s*\n/g)) for (const t of structTags(d[1])) tags.add(t);
  const query = new Set([...body.matchAll(/Query\(\)\.Get\("([a-z_]+)"\)/g)].map((m) => m[1]));
  return { route, scopes, tags, query, middleware: route.middleware };
}

const problems = { REQUIRED: [], SCOPE: [], DEAD: [], FAKE_EVENTS: [], FAKE_ERRORS: [], SDK: [], GUIDES: [], ORPHAN_META: [] };
const flag = (k, m) => problems[k].push(m);

for (const b of blocks) {
  const meta = ENDPOINT_META[b.id];
  const at = `${b.method} ${b.path} (${b.id})`;
  if (!meta) { flag('REQUIRED', `${at}: no contract in endpoint-meta.ts`); continue; }

  // Required parts, both languages.
  const bi = (field) => new RegExp(`${field}: \\{\\s*pt: '((?:[^'\\\\]|\\\\.)+)',\\s*en: '((?:[^'\\\\]|\\\\.)+)'`).exec(b.src);
  if (!bi('desc')) flag('REQUIRED', `${at}: description missing in a language`);
  if (!bi('credential')) flag('REQUIRED', `${at}: authentication missing in a language`);
  if (!/response: `/.test(b.src) && b.id !== 'ref-webhook-deactivate') flag('REQUIRED', `${at}: no example response`);
  const errorCodes = [...(b.src.slice(b.src.indexOf('errors: [')).matchAll(/code: '(\d{3}) ([^']+)'/g))];
  if (!errorCodes.length) flag('REQUIRED', `${at}: no errors listed`);
  if (!meta.params?.length) flag('REQUIRED', `${at}: no parameters`);
  for (const p of meta.params ?? []) {
    if (!p.type || p.required === undefined || !p.note?.pt || !p.note?.en) flag('REQUIRED', `${at}: parameter ${p.in} ${p.name} lacks type, required or a note in both languages`);
  }
  if (!meta.guides?.length) flag('REQUIRED', `${at}: no related guide`);
  if (meta.sdk === undefined || (meta.sdk === null && !(meta.sdkNote?.pt && meta.sdkNote?.en))) flag('REQUIRED', `${at}: no SDK method and no note saying what to use instead`);
  if (!Array.isArray(meta.events)) flag('REQUIRED', `${at}: events not stated`);

  // Guides exist.
  for (const g of meta.guides ?? []) if (!SLUGS.has(g)) flag('GUIDES', `${at}: guide "${g}" is not a documentation page`);

  // Events exist.
  for (const e of meta.events ?? []) if (!EVENT_NAMES.includes(e)) flag('FAKE_EVENTS', `${at}: event ${e} is not emitted`);

  // Error codes exist.
  for (const [, , codes] of errorCodes) {
    for (const c of [...codes.matchAll(/\b([A-Z][A-Z0-9_]{2,}\*?)/g)].map((x) => x[1])) {
      if (c.endsWith('*')) { if (![...CODES].some((k) => k.startsWith(c.slice(0, -1)))) flag('FAKE_ERRORS', `${at}: ${c} matches no catalogue code`); continue; }
      if (!CODES.has(c)) flag('FAKE_ERRORS', `${at}: ${c} is not in the error catalogue`);
    }
  }

  // Path placeholders.
  const placeholders = [...b.path.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1]).sort().join(',');
  const pathParams = (meta.params ?? []).filter((p) => p.in === 'path').map((p) => p.name).sort().join(',');
  if (placeholders !== pathParams) flag('DEAD', `${at}: path parameters [${pathParams}] ≠ path [${placeholders}]`);

  // The gateway.
  const facts = handlerFacts(b.method, b.path);
  if (!facts) { flag('DEAD', `${at}: no gateway route`); continue; }
  if (meta.scope === null) {
    if (facts.scopes.length) flag('SCOPE', `${at}: documented as public, handler demands ${facts.scopes.join(', ')}`);
  } else if (!facts.scopes.includes(meta.scope)) {
    flag('SCOPE', `${at}: documented scope ${meta.scope}, handler demands ${facts.scopes.join(', ') || 'none'}`);
  }
  for (const p of meta.params ?? []) {
    if (p.in === 'body' && !facts.tags.has(p.name)) flag('DEAD', `${at}: body field ${p.name} is not decoded by ${facts.route.handler}`);
    if (p.in === 'query' && !facts.query.has(p.name)) flag('DEAD', `${at}: query parameter ${p.name} is not read by ${facts.route.handler}`);
    if (p.in === 'header' && p.name === 'Idempotency-Key' && !facts.middleware.includes('Idempotency')) flag('DEAD', `${at}: Idempotency-Key documented, route has no idempotency middleware`);
  }
  for (const f of meta.refused ?? []) if (!REFUSED.has(f)) flag('DEAD', `${at}: ${f} documented as refused, the gateway does not refuse it`);
  for (const f of (meta.params ?? []).filter((p) => p.in === 'body')) if (REFUSED.has(f.name)) flag('DEAD', `${at}: ${f.name} documented as a field, the gateway refuses it from a project key`);

  // The SDK.
  if (meta.sdk) {
    const start = new RegExp(`\\n\\s+(?:async\\s+)?${meta.sdk}\\(`).exec(sdk);
    if (!start) flag('SDK', `${at}: @banzami/sdk has no method ${meta.sdk}`);
    else {
      // The method's own text: from its signature to the next method signature.
      const rest = sdk.slice(start.index + start[0].length);
      // The next signature of ANOTHER method: an overloaded method's own
      // implementation line is part of its text, not the start of the next one.
      const sigs = [...rest.slice(1).matchAll(/\n  (?:async\s+)?([a-z]\w*)\([^)]*\)?[^;\n]*\{\s*\n/g)];
      const next = sigs.find((m) => m[1] !== meta.sdk);
      const bodyText = rest.slice(0, next ? next.index + 1 : 1500);
      const resource = b.path.replace(/^\/v1/, '').split('/').filter(Boolean)[0];
      const called = bodyText.includes(`/${resource}`) || /return this\.\w+\(/.test(bodyText);
      if (!called) flag('SDK', `${at}: ${meta.sdk} does not call /${resource}`);
    }
  }
}
for (const id of Object.keys(ENDPOINT_META)) if (!blocks.some((b) => b.id === id)) flag('ORPHAN_META', `endpoint-meta.ts ${id} has no endpoint in the reference`);

let failures = 0;
const report = (name, list) => {
  failures += list.length;
  if (list.length) { console.error(`  ✗ ${name}=${list.length}`); for (const x of list) console.error(`      ${x}`); } else console.log(`  ✓ ${name}=0`);
};
console.log(`API reference — ${blocks.length} endpoints against the gateway\n`);
report('API_REFERENCE_REQUIRED_FIELDS_MISSING', problems.REQUIRED);
report('API_REFERENCE_SCOPE_DRIFT', problems.SCOPE);
report('API_REFERENCE_DEAD_FIELDS', problems.DEAD);
report('API_REFERENCE_FAKE_EVENTS', problems.FAKE_EVENTS);
report('API_REFERENCE_FAKE_ERRORS', problems.FAKE_ERRORS);
report('API_REFERENCE_SDK_DRIFT', problems.SDK);
report('API_REFERENCE_BROKEN_GUIDES', problems.GUIDES);
report('API_REFERENCE_ORPHAN_CONTRACTS', problems.ORPHAN_META);
console.log(`\nAPI_REFERENCE_ENDPOINT_CONSISTENCY=${problems.REQUIRED.length === 0 ? 'PASS' : 'FAIL'}`);
console.log(`API_REFERENCE_INFORMATION_DENSITY=${failures === 0 ? 'PASS' : 'FAIL'}`);
process.exit(failures ? 1 : 0);
