#!/usr/bin/env node
/**
 * The error reference says what the API returns — in both directions, in both
 * languages, route by route.
 *
 * What it replaced: two hand-written tables that told a developer a missing
 * scope is "403 FORBIDDEN … or a project without an active binding" (it is
 * INSUFFICIENT_SCOPE, and the second half is PAYMENTS_UNAVAILABLE), that a
 * reused key is "409 CONFLICT" and a bad field "422 VALIDATION_ERROR" (no
 * developer route returns either), and a landing page listing
 * `invalid_api_key` and `rate_limit_exceeded`, which no route has ever
 * returned. Nothing checked any of it.
 *
 * The truth is derived, not kept (tools/lib/error-surface.mjs): the routes a
 * project key or a public caller can reach, read from server.go; the codes each
 * route's handler, helpers and middleware write; and the codes the financial
 * core writes that the gateway passes through. Against that:
 *
 *   DOC_ERRORS_MISSING               a reachable code the catalogue does not document
 *   DOC_ERRORS_NOT_PUBLIC            a documented or named code that is not reachable —
 *                                    internal, invented, or retired
 *   DOC_ERRORS_ROUTE_DRIFT           an endpoint's reference names a code THAT route cannot return
 *   DOC_ERRORS_UNCLASSIFIED          a code the gateway writes that is in neither the
 *                                    public nor the internal list — somebody must decide
 *   DOC_ERRORS_UNDECLARED_FORWARDING a surface handler writes a code it did not choose,
 *                                    from somewhere the catalogue does not declare
 *   DOC_ERRORS_STATUS_DRIFT          the catalogue's HTTP status is not the one the source sends
 *   DOC_ERROR_CATALOGUE_PT_EN_DRIFT  a meaning or an action missing in one language, or the
 *                                    two languages naming different codes
 *   DOC_ERRORS_INTERNAL_DETAIL       catalogue text that exposes implementation internals
 *
 *   node tools/check-docs-error-catalogue.mjs
 *   BZ_ERRCAT_ROOT=/tmp/copy node tools/check-docs-error-catalogue.mjs   (selftest)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gatewaySurface, gatewayAllCodes, gatewayRoutes, routeCodes, coreCodes, consoleCodes, rustFunctions } from './lib/error-surface.mjs';

const ROOT = process.env.BZ_ERRCAT_ROOT ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DOCS = 'apps/website/app/developers/docs';
const CATALOGUE = `${DOCS}/error-catalogue.json`;

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const cat = JSON.parse(read(CATALOGUE));
const errors = cat.errors;
const documented = new Map(errors.map((e) => [e.code, e]));
const internal = new Set(cat.internal?.codes ?? []);

let failures = 0;
const counters = {};
const report = (name, items, explain) => {
  counters[name] = items.length;
  if (items.length) {
    failures += 1;
    console.error(`  ✗ ${name} = ${items.length}${explain ? ` — ${explain}` : ''}`);
    for (const i of items.slice(0, 25)) console.error(`      ${i}`);
    if (items.length > 25) console.error(`      … and ${items.length - 25} more`);
  } else {
    console.log(`  ✓ ${name} = 0`);
  }
};

console.log('developer documentation — error catalogue\n');

// ── derive what is reachable ────────────────────────────────────────────────
const surface = gatewaySurface(ROOT);
const reachable = new Map(); // code → Set(where)
const statuses = new Map();  // code → Set(status)
const put = (code, where, sts) => {
  if (!reachable.has(code)) { reachable.set(code, new Set()); statuses.set(code, new Set()); }
  for (const w of where) reachable.get(code).add(w);
  for (const s of sts ?? []) statuses.get(code).add(s);
};
for (const [c, w] of surface.codes) put(c, w, surface.statuses.get(c));

const undeclared = [];
const coreFns = rustFunctions(join(ROOT, 'core/api/src/routes'));
for (const f of surface.forwarding) {
  const decl = (cat.forwarded ?? []).find((d) => d.surface === f.entry);
  // fd.Code in CreateBusiness is chosen by a function in the same package, so
  // its codes are already in the closure — but only because the declaration
  // says so and the derivation found them. Any other undeclared point fails.
  if (!decl) undeclared.push(`${f.entry} → ${f.at}: ${f.line}`);
}
for (const d of cat.forwarded ?? []) {
  const missingFns = d.core.filter((k) => !coreFns.has(k));
  if (missingFns.length) undeclared.push(`${d.surface} declares core handler(s) that do not exist: ${missingFns.join(', ')}`);
  if (!surface.entries.includes(d.surface)) undeclared.push(`${d.surface} is declared as forwarding but is not on the developer surface`);
  const r = coreCodes(ROOT, d.core, { includeServerErrors: d.server_errors === 'forwarded' });
  for (const [c, w] of r.codes) put(c, [...w].map((x) => `core:${x}`), r.statuses.get(c));
}
for (const fb of cat.fallbacks ?? []) {
  const src = existsSync(join(ROOT, fb.file)) ? read(fb.file) : '';
  if (!src.includes(`"${fb.code}"`)) undeclared.push(`fallback ${fb.code} is not in ${fb.file}`);
  else put(fb.code, [`fallback:${fb.file.split('/').pop()}`], []);
}

console.log(`  surface: ${surface.entries.length} handler(s) · ${surface.middleware.length} middleware · ${reachable.size} reachable code(s) · ${errors.length} documented · ${internal.size} classified internal\n`);

// ── A. reachable but undocumented ───────────────────────────────────────────
report('DOC_ERRORS_MISSING',
  [...reachable.keys()].filter((c) => !documented.has(c)).sort()
    .map((c) => `${c}${internal.has(c) ? ' (classified INTERNAL, but a developer can receive it)' : ''} ← ${[...reachable.get(c)].slice(0, 3).join(' · ')}`),
  'a developer can receive these and the catalogue does not say what they mean');

// ── B. documented or named, but not public ──────────────────────────────────
const consoleSet = consoleCodes(ROOT);
const notPublic = errors.filter((e) => !reachable.has(e.code)).map((e) => `${e.code} is in the catalogue but no developer route returns it`);

/** Text files the public reads for the developer platform. */
const docFiles = [
  'apps/website/app/developers/page.tsx',
  ...readdirSync(join(ROOT, DOCS), { recursive: true })
    .map(String)
    .filter((f) => /\.(tsx|ts)$/.test(f) && !/\.test\.|selftest|ErrorCatalogue\.tsx$|content-map\.ts$|glossary\.ts$|assurance-manifest\.ts$|published-packages\.ts$/.test(f))
    .map((f) => `${DOCS}/${f}`),
];
const universe = new Set([...gatewayAllCodes(ROOT), ...consoleSet, ...internal, ...documented.keys()]);
for (const [, fn] of coreFns) for (const m of fn.body.matchAll(/ApiError::\w+\(\s*"([A-Z][A-Z0-9_]{2,})"/g)) universe.add(m[1]);
const ERRORISH = /(ERROR|INVALID|NOT_|UNAUTH|FORBIDDEN|CONFLICT|LIMIT|VALIDATION|MISSING|UNAVAILABLE|DENIED|EXPIRED|REUSED|MISMATCH|INSUFFICIENT|UNSUPPORTED|REJECTED|FAILED|RETIRED|FROZEN|UNPROCESSABLE|EXCEEDS)/;

/** Every error-code mention in a file, with a line number and whether it sits in the Console list. */
function mentions(file) {
  const src = read(file);
  const out = [];
  // The Console list documents the Console's own backend, not the Developer API.
  const consoleRanges = [];
  for (const m of src.matchAll(/<H3(?: id="[^"]*")?>Console \((?:acesso e chaves|access and keys)\)<\/H3>/g)) {
    const end = src.indexOf('<H3', m.index + 5);
    consoleRanges.push([m.index, end < 0 ? src.length : end]);
  }
  const inConsole = (i) => consoleRanges.some(([a, b]) => i >= a && i < b);
  const lineOf = (i) => src.slice(0, i).split('\n').length;
  const add = (token, i, ctx) => {
    const t = token.replace(/\*$/, '');
    // A wildcard counts only when it is the prefix of a known code
    // (FEE_DESTINATION_*), not any starred identifier (NEXT_PUBLIC_*).
    const isCode = token.endsWith('*') ? [...universe].some((c) => c.startsWith(t)) : (universe.has(t) || (ERRORISH.test(t) && t.includes('_')));
    if (!isCode) return;
    out.push({ code: token, line: lineOf(i), console: inConsole(i), ctx });
  };
  // "403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE", "400 A · B"
  for (const m of src.matchAll(/\b(?:[1-5]\d\d|[45]xx)\s+([A-Z][A-Z0-9_]+\*?(?:\s*(?:\/|·|,)\s*(?:[1-5]\d\d\s+)?[A-Z][A-Z0-9_]+\*?)*)/g)) {
    for (const t of m[1].matchAll(/[A-Z][A-Z0-9_]+\*?/g)) add(t[0], m.index, 'status');
  }
  // <Code>X</Code>
  for (const m of src.matchAll(/<Code>([A-Z][A-Z0-9_]{2,}\*?)<\/Code>/g)) add(m[1], m.index, 'code');
  // failures: 'A, B, C.'   /  ERROR_CODES { code: 'A' }   /  a string list of codes
  for (const m of src.matchAll(/failures:\s*'([^']*)'/g)) for (const t of m[1].matchAll(/[A-Za-z][A-Za-z0-9_]{2,}/g)) if (/_/.test(t[0])) add(t[0].toUpperCase() === t[0] ? t[0] : `${t[0]}`, m.index, 'failures');
  // An ERROR_CODES list is a list of error codes: a lower-case entry there is
  // an invented code (invalid_api_key), not a payment state.
  for (const block of src.matchAll(/const ERROR_CODES[^=]*=\s*\[([\s\S]*?)\n\];/g)) {
    for (const m of block[1].matchAll(/code:\s*'([^']+)'/g)) {
      if (/^[a-z]/.test(m[1])) out.push({ code: m[1], line: lineOf(block.index), console: false, ctx: 'lowercase' });
      else add(m[1], block.index, 'error-list');
    }
  }
  // Lower-case pseudo-codes in a failures list are never real.
  for (const m of src.matchAll(/failures:\s*'([^']*)'/g)) for (const t of m[1].matchAll(/\b[a-z]+_[a-z_]+\b/g)) out.push({ code: t[0], line: lineOf(m.index), console: false, ctx: 'lowercase' });
  return out;
}

const matchesDocumented = (token) => token.endsWith('*')
  ? [...documented.keys()].some((c) => c.startsWith(token.slice(0, -1)))
  : documented.has(token) && reachable.has(token);

const mentionsByFile = new Map();
for (const f of docFiles) {
  const ms = mentions(f);
  mentionsByFile.set(f, ms);
  for (const m of ms) {
    if (m.console) {
      if (!consoleSet.has(m.code)) notPublic.push(`${f}:${m.line} names ${m.code} in the Console list; the Console backend never returns it`);
      continue;
    }
    if (matchesDocumented(m.code)) continue;
    const why = internal.has(m.code) ? 'an INTERNAL code (merchant/onboarding/operator surface)'
      : universe.has(m.code) ? 'not returned by any developer route'
      : 'not a code anything returns';
    notPublic.push(`${f}:${m.line} names ${m.code} — ${why}`);
  }
}
report('DOC_ERRORS_NOT_PUBLIC', [...new Set(notPublic)], 'documentation names codes that are not part of the developer contract');

// ── route by route ──────────────────────────────────────────────────────────
const routes = gatewayRoutes(ROOT).filter((r) => r.middleware.includes('DualAuth') || r.middleware.includes('DeveloperKeyAuth') || r.path.startsWith('/v1/public/'));
const routeDrift = [];
const checkRoute = (label, method, path, tokens) => {
  const r = routes.find((x) => x.method === method && x.path === path);
  if (!r) { routeDrift.push(`${label}: ${method} ${path} is not a developer route`); return; }
  const can = routeCodes(ROOT, r, cat.forwarded ?? []);
  for (const t of tokens) {
    const ok = t.endsWith('*') ? [...can].some((c) => c.startsWith(t.slice(0, -1))) : can.has(t);
    if (!ok) routeDrift.push(`${label}: ${method} ${path} documents ${t}, which that route cannot return`);
  }
};
{
  const ref = read(`${DOCS}/reference.tsx`);
  for (const b of ref.matchAll(/method: '(GET|POST|DELETE)',\s*path: '([^']+)'[\s\S]*?errors: \[([\s\S]*?)\n\s*\],/g)) {
    const tokens = [...b[3].matchAll(/code: '([^']+)'/g)].flatMap((m) => [...m[1].matchAll(/[A-Z][A-Z0-9_]+\*?/g)].map((x) => x[0]));
    checkRoute('reference.tsx', b[1], b[2], tokens);
  }
  const landing = read('apps/website/app/developers/page.tsx');
  for (const b of landing.matchAll(/method: '(GET|POST|DELETE)',\s*path: '([^']+)',[\s\S]*?failures: '([^']*)'/g)) {
    checkRoute('developers/page.tsx', b[1], b[2], [...b[3].matchAll(/[A-Z][A-Z0-9_]{2,}/g)].map((x) => x[0]));
  }
  for (const b of landing.matchAll(/\{\s*method: '(GET|POST|DELETE)', path: '([^']+)', desc:/g)) checkRoute('developers/page.tsx', b[1], b[2], []);
}
report('DOC_ERRORS_ROUTE_DRIFT', routeDrift, 'an endpoint promises a code that route does not send, or documents a route developers cannot call');

// ── classification ──────────────────────────────────────────────────────────
report('DOC_ERRORS_UNCLASSIFIED',
  [...gatewayAllCodes(ROOT)].filter((c) => !documented.has(c) && !internal.has(c)).sort()
    .map((c) => `${c} — add it to errors[] if a developer can receive it, or to internal.codes if not`),
  'every code the gateway writes must be explicitly public or internal');
report('DOC_ERRORS_UNDECLARED_FORWARDING', undeclared, 'codes chosen somewhere the derivation cannot see');

// ── statuses ────────────────────────────────────────────────────────────────
const statusDrift = [];
for (const e of errors) {
  const derived = [...(statuses.get(e.code) ?? [])].filter((s) => typeof s === 'number');
  if (!derived.length) continue;
  const claimed = new Set(e.http.map(String));
  for (const s of derived) {
    const ok = claimed.has(String(s)) || (s >= 400 && s < 500 && claimed.has('4xx')) || (s >= 500 && claimed.has('5xx'));
    if (!ok) statusDrift.push(`${e.code}: the source sends ${s}, the catalogue says ${e.http.join(', ')}`);
  }
  for (const c of e.http) if (typeof c === 'number' && !derived.includes(c)) statusDrift.push(`${e.code}: the catalogue says ${c}, the source only sends ${derived.join(', ')}`);
}
report('DOC_ERRORS_STATUS_DRIFT', statusDrift);

// ── two languages ───────────────────────────────────────────────────────────
const drift = [];
for (const e of errors) {
  for (const f of ['meaning', 'action']) for (const l of ['pt', 'en']) if (!e[f]?.[l]?.trim()) drift.push(`${e.code}: ${f}.${l} is empty`);
}
const ptSrc = read(`${DOCS}/content-pt.tsx`);
const enSrc = read(`${DOCS}/content-en.tsx`);
if (!/<ErrorCatalogue lang="pt"/.test(ptSrc)) drift.push('content-pt.tsx does not render <ErrorCatalogue lang="pt" />');
if (!/<ErrorCatalogue lang="en"/.test(enSrc)) drift.push('content-en.tsx does not render <ErrorCatalogue lang="en" />');
const named = (f) => new Set(mentionsByFile.get(f).map((m) => m.code));
const ptNamed = named(`${DOCS}/content-pt.tsx`);
const enNamed = named(`${DOCS}/content-en.tsx`);
for (const c of ptNamed) if (!enNamed.has(c)) drift.push(`${c} is named in Portuguese and not in English`);
for (const c of enNamed) if (!ptNamed.has(c)) drift.push(`${c} is named in English and not in Portuguese`);
{
  const ref = read(`${DOCS}/reference.tsx`);
  for (const m of ref.matchAll(/\{\s*code: '([^']+)', note: \{ pt: '([^']*)', en: '([^']*)' \} \}/g)) {
    if (!m[2].trim() || !m[3].trim()) drift.push(`reference.tsx ${m[1]}: a note is empty in one language`);
  }
}
report('DOC_ERROR_CATALOGUE_PT_EN_DRIFT', drift);

// ── what must never be published ────────────────────────────────────────────
const INTERNALS = /\b(redis|postgres(?:ql)?|sqlx?|core-api|internal\/v1|CORE_INTERNAL|pepper|goroutine|panic|stack trace|\w+\.go|\w+\.rs)\b/i;
report('DOC_ERRORS_INTERNAL_DETAIL',
  errors.flatMap((e) => ['meaning', 'action'].flatMap((f) => ['pt', 'en'].filter((l) => INTERNALS.test(e[f][l])).map((l) => `${e.code} ${f}.${l}: "${e[f][l]}"`))));

console.log('');
for (const [k, v] of Object.entries(counters)) console.log(`${k}=${v}`);
console.log(`DOC_ERRORS_REACHABLE=${reachable.size}`);
console.log(`DOC_ERRORS_DOCUMENTED=${errors.length}`);
console.log(`DOC_ERROR_CATALOGUE=${failures === 0 ? 'PASS' : 'FAIL'}`);

if (failures) { console.error(`\n✗ ${failures} check(s) failed`); process.exit(1); }
console.log('\n✓ the error reference and the API agree, route by route, in both languages');
