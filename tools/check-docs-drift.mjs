#!/usr/bin/env node
/**
 * A product change that invalidates the public documentation fails here.
 *
 * The deployed audit (tools/e2e/docs/audit.mjs) reads the live pages and is the
 * authority on what a reader sees. It needs a deployment, so it cannot stop a
 * change from being merged — by the time it fails, the wrong sentence is already
 * published.
 *
 * This is the half that can run on a pull request: every claim that can be
 * settled from the repository alone, checked against the thing that settles it.
 *
 *   node tools/check-docs-drift.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (p) => { try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return ''; } };

let failures = 0;
const fail = (m, d) => { console.error(`  ✗ ${m}${d ? `\n      ${d}` : ''}`); failures += 1; };
const pass = (m) => console.log(`  ✓ ${m}`);

const PT = read('apps/website/app/developers/docs/content-pt.tsx');
const EN = read('apps/website/app/developers/docs/content-en.tsx');
const REF = read('apps/website/app/developers/docs/reference.tsx');
const SHELL = read('apps/website/app/developers/docs/shell.tsx');
const DOCS = `${PT}\n${EN}\n${REF}`;

// ── the published contract ───────────────────────────────────────────────────
console.log('── API reference vs OpenAPI v1 ──');
const spec = JSON.parse(read('docs/developer/openapi/banzami-sandbox.openapi.json'));
const specPaths = Object.keys(spec.paths);

const undocumented = specPaths.filter((p) => !REF.includes(p));
undocumented.length
  ? fail(`OPENAPI_ENDPOINTS_UNDOCUMENTED = ${undocumented.length}`, undocumented.join('\n      '))
  : pass(`every one of the ${specPaths.length} published paths appears in the resource reference`);

// The same, per OPERATION. A path check alone let GET /v1/payment-links go
// undocumented for as long as POST /v1/payment-links was documented: the path
// string was on the page, the operation a developer would call was not. An
// operation may instead be named in the reference's "not callable with a project
// key" list, as "METHOD /path", with the reason beside it.
const refOps = new Set([...REF.matchAll(/method: '(GET|POST|DELETE|PATCH|PUT)',\s*path: '([^']+)'/g)].map((m) => `${m[1]} ${m[2]}`));
const disclaimedOps = new Set([...REF.matchAll(/\{ path: '((?:GET|POST|DELETE)(?:\/(?:GET|POST|DELETE))? [^']+)', status:/g)]
  .flatMap((m) => { const [methods, path] = m[1].split(' '); return methods.split('/').map((x) => `${x} ${path}`); }));
const undocumentedOps = Object.entries(spec.paths).flatMap(([path, ops]) => Object.keys(ops)
  .filter((k) => ['get', 'post', 'delete', 'patch', 'put'].includes(k))
  .map((k) => `${k.toUpperCase()} ${path}`))
  .filter((op) => !refOps.has(op) && !disclaimedOps.has(op));
undocumentedOps.length
  ? fail(`OPENAPI_OPERATIONS_UNDOCUMENTED = ${undocumentedOps.length}`, undocumentedOps.join('\n      '))
  : pass(`every published operation has its own reference entry, or is named as not callable with a project key (${refOps.size} documented)`);

// Every path the reference documents must be published. A path may also be named
// in order to say it is NOT part of the contract; that has to be said next to it.
const referenced = [...new Set((REF.match(/\/v1\/[A-Za-z0-9/_{}-]+/g) ?? []).map((p) => p.replace(/[.,;:)]+$/, '')))];
const templates = specPaths.map((p) => new RegExp(`^${p.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}$`));
const DISCLAIMED = /(retirad|retired|410|apenas credencial|apenas sess[ãa]o|merchant credential only|merchant session only|consumer surface only|superf[íi]cie de consumidor)/i;
const stray = referenced.filter((p) => {
  if (specPaths.includes(p) || templates.some((t) => t.test(p))) return false;
  const near = new RegExp(`${p.replace(/[{}]/g, '.')}[\\s\\S]{0,300}`, 'i').exec(REF)?.[0] ?? '';
  return !DISCLAIMED.test(near);
});
stray.length
  ? fail(`DOC_ENDPOINTS_NOT_IN_OPENAPI = ${stray.length}`, stray.join('\n      '))
  : pass('every endpoint the reference documents is published, or says why it is not');

// ── the published packages ───────────────────────────────────────────────────
console.log('\n── SDK install commands ──');
// published-packages.ts is TypeScript, which node cannot import; it is read as
// text. The first version of this wrapped the import in a catch and only read
// the file when the import failed — and the import failing is the ONLY thing
// that ever happens, so a silent path decided whether this section ran at all.
// It printed nothing, and nothing is indistinguishable from passing.
const pkgSrc = read('apps/website/app/developers/docs/published-packages.ts');
if (!pkgSrc) fail('published-packages.ts is missing — nothing says which packages are real');
const installs = [...pkgSrc.matchAll(/install:\s*'([^']+)'/g)].map((m) => m[1]);
const fakes = [...(pkgSrc.split('FAKE_INSTALL_COMMANDS')[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
installs.length
  ? pass(`${installs.length} published package(s) declared`)
  : fail('no published package is declared — the install checks would pass vacuously');
for (const cmd of installs) {
  PT.includes(cmd) && EN.includes(cmd)
    ? pass(`both languages give "${cmd}"`)
    : fail(`a published package's install command is missing from one language: "${cmd}"`);
}
const present = fakes.filter((c) => DOCS.includes(c));
present.length
  ? fail('the docs tell a reader to run a command for a package no registry has', present.join('\n      '))
  : pass(`no install command for an unpublished package (${fakes.length} watched)`);

// ── language that describes a product that no longer exists ──────────────────
console.log('\n── retired vocabulary ──');
const prose = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const ALL = prose(`${PT}\n${EN}\n${SHELL}`);
const RETIRED_WORDS = [
  [/preview SDK|SDK preview/i, 'the packages are on public registries; there is no preview'],
  [/parceiros? aprovados?|approved partners?/i, 'there are no approved partners'],
  [/acesso controlado|controlled access/i, 'access to the SDK is not controlled'],
  [/\/v1\/business\//, 'the /v1/business/* vocabulary was withdrawn'],
  [/applicationFeeBps|application_fee_bps/, 'the caller never selects a fee rate'],
  [/\/v2\//, 'the public API is v1 only'],
];
const hits = RETIRED_WORDS.filter(([re]) => re.test(ALL));
hits.length
  ? fail(`${hits.length} retired claim(s) in the documentation`,
         hits.map(([re, why]) => `${(ALL.match(re) ?? [''])[0]} — ${why}`).join('\n      '))
  : pass('PUBLIC_DOC_LEGACY_CONTRACTS = 0 · no preview-era vocabulary');

// ── PT / EN contract parity ──────────────────────────────────────────────────
console.log('\n── PT / EN parity ──');
// A worked example writes the id out — /v1/payment-sessions/psess_exemplo/qr —
// and PT and EN may pick different example ids for the same route. Comparing the
// raw strings reported that as a parity gap; the routes are what must match.
const toTemplate = (p) => {
  if (specPaths.includes(p)) return p;
  const i = templates.findIndex((t) => t.test(p));
  return i === -1 ? p : specPaths[i];
};
const eps = (src) => new Set((src.match(/\/v1\/[a-z0-9/_{}-]+/g) ?? [])
  .map((p) => toTemplate(p.replace(/[.,;:)]+$/, ''))));
const ptOnly = [...eps(PT)].filter((p) => !eps(EN).has(p));
const enOnly = [...eps(EN)].filter((p) => !eps(PT).has(p));
(ptOnly.length || enOnly.length)
  ? fail('the two languages name different endpoints', `PT only: ${ptOnly.join(', ') || '—'}\n      EN only: ${enOnly.join(', ') || '—'}`)
  : pass(`both languages name the same ${eps(PT).size} endpoint(s)`);

// Every PT area component has an EN counterpart and a page for each.
const areas = [...SHELL.matchAll(/\{ slug: '([a-z-]*)', label:/g)].map((m) => m[1]).filter(Boolean);
const missing = [];
for (const a of new Set(areas)) {
  for (const [dir, lang] of [[`apps/website/app/developers/docs/${a}/page.tsx`, 'PT'], [`apps/website/app/developers/docs/en/${a}/page.tsx`, 'EN']]) {
    if (!existsSync(join(ROOT, dir))) missing.push(`${lang} ${a}`);
  }
}
missing.length
  ? fail(`DOCS_PT_EN_PAGE_PARITY: ${missing.length} area(s) without a page`, missing.join(', '))
  : pass(`DOCS_PT_EN_PAGE_PARITY: all ${new Set(areas).size} areas exist in both languages`);

// ── no credential could be real ──────────────────────────────────────────────
console.log('\n── credentials in examples ──');
const keys = [...new Set(DOCS.match(/bz_(test|live)_(sk|pk)_[A-Za-z0-9]+/g) ?? [])];
const suspicious = keys.filter((k) => !/X{6,}/.test(k));
suspicious.length
  ? fail('a key in the documentation does not look like a placeholder', suspicious.join(', '))
  : pass(`every key in the documentation is a placeholder (${keys.length} checked)`);
// Naming bz_live_ in order to say it is refused is the opposite of using one.
// A USE is a key with a value after the prefix; a mention has nothing after it.
const liveUses = [...new Set(DOCS.match(/bz_live_(sk|pk)_[A-Za-z0-9]{4,}/g) ?? [])];
liveUses.length
  ? fail('the documentation uses a live key, which is issued to nobody', liveUses.join(', '))
  : pass(`no live key is used anywhere (${(DOCS.match(/bz_live_/g) ?? []).length} mention(s), all saying it is refused)`);

if (failures) { console.error(`\n✗ ${failures} documentation drift failure(s)`); process.exit(1); }
console.log('\n✓ the documentation and the product it describes still agree');
