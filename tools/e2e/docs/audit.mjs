#!/usr/bin/env node
/**
 * The deployed developer documentation, against the product it describes.
 *
 * Documentation rots differently from code: nothing fails, nobody notices, and
 * the reader finds out by writing an integration against a sentence that stopped
 * being true. This reads the pages as they are served and checks each
 * machine-checkable claim against the thing that decides it:
 *
 *   an install command      → the package registry
 *   "not published"         → the package registry, the other way round
 *   an endpoint             → the published OpenAPI v1 document
 *   a link or anchor        → the pages themselves
 *   a PT page               → its EN counterpart
 *
 * Everything it reports is a contradiction between two things that already
 * exist. It invents no policy of its own.
 *
 *   node tools/e2e/docs/audit.mjs [--origin https://developers.banzami.com]
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assuranceDir } from '../lib/assurance-output.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const ORIGIN = argv.includes('--origin') ? argv[argv.indexOf('--origin') + 1] : 'https://developers.banzami.com';

const PAGES = ['', '/get-started', '/console', '/sdk', '/guides', '/doa', '/reference', '/testing', '/trust', '/artifacts', '/changelog', '/glossary'];

let failures = 0;
const findings = [];
const fail = (area, msg, detail) => {
  failures += 1; findings.push({ area, verdict: 'FAIL', msg, detail });
  console.error(`  ✗ [${area}] ${msg}${detail ? `\n      ${detail}` : ''}`);
};
const pass = (area, msg) => { findings.push({ area, verdict: 'PASS', msg }); console.log(`  ✓ [${area}] ${msg}`); };

/** Strip tags; keep reading order so "X is not published" stays one sentence. */
const flatten = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, '\n')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"')
  .split('\n').map((l) => l.trim()).filter(Boolean);

const fetched = new Map();
async function page(path) {
  if (fetched.has(path)) return fetched.get(path);
  let res;
  try { res = await fetch(ORIGIN + path); } catch { res = { ok: false, status: 0 }; }
  const html = res.ok ? await res.text() : '';
  const lines = flatten(html);
  const v = { status: res.status, html, lines, text: lines.join(' ') };
  fetched.set(path, v);
  return v;
}

console.log(`developer documentation audit — ${ORIGIN}\n`);

// ── every page is served ─────────────────────────────────────────────────────
console.log('── pages ──');
for (const p of PAGES) {
  for (const prefix of ['/docs', '/docs/en']) {
    const r = await page(prefix + p);
    r.status === 200 ? pass('pages', `${prefix}${p} → 200 (${r.lines.length} lines)`)
                     : fail('pages', `${prefix}${p} → ${r.status}`);
  }
}

// ── SDK claims against the registries ────────────────────────────────────────
console.log('\n── SDK publication ──');
const REGISTRIES = [
  { name: 'TypeScript', pkg: '@banzami/sdk', url: 'https://registry.npmjs.org/@banzami%2Fsdk',
    install: 'npm install @banzami/sdk', version: (j) => j['dist-tags']?.latest },
  { name: 'Dart client', pkg: 'banzami_client', url: 'https://pub.dev/api/packages/banzami_client',
    install: 'dart pub add banzami_client', version: (j) => j.latest?.version },
  { name: 'Python', pkg: 'banzami', url: 'https://pypi.org/pypi/banzami/json',
    install: 'pip install banzami', version: (j) => j.info?.version },
  { name: 'PHP', pkg: 'banzami/sdk-php', url: 'https://repo.packagist.org/p2/banzami/sdk-php.json',
    install: 'composer require banzami/sdk-php', version: (j) => (Object.keys(j.packages ?? {}).length ? 'published' : null) },
];

const allDocsText = [
  (await page('/docs/sdk')).text,
  (await page('/docs/get-started')).text,
  (await page('/docs')).text,
].join(' ');

const registry = [];
for (const r of REGISTRIES) {
  let published = false, version = null;
  try {
    const res = await fetch(r.url);
    if (res.ok) { const j = await res.json(); version = r.version(j); published = Boolean(version); }
  } catch { /* treated as unpublished below */ }
  registry.push({ name: r.name, pkg: r.pkg, published, version });

  const tellsYouToInstall = allDocsText.includes(r.install);
  if (published && !tellsYouToInstall) {
    fail('sdk', `${r.name} (${r.pkg}) is published as ${version} but the docs never give "${r.install}"`);
  } else if (!published && tellsYouToInstall) {
    fail('sdk', `the docs tell a reader to run "${r.install}" but ${r.pkg} is not in its registry`);
  } else {
    pass('sdk', published
      ? `${r.name} ${version} is published and the docs give the registry install`
      : `${r.name} is not published and the docs do not tell anyone to install it`);
  }
}

// A blanket claim that nothing is published, on a product with published packages.
const publishedNames = registry.filter((r) => r.published).map((r) => r.pkg);
const BLANKET = [
  /não publica pacotes em registries públicos/i,
  /does not publish packages to public registries/i,
  /não são .{0,40}prova de publicação pública dos pacotes/i,
  /are not .{0,40}proof of public package publication/i,
];
for (const prefix of ['/docs', '/docs/en']) {
  const hit = [];
  for (const p of PAGES) {
    const t = (await page(prefix + p)).text;
    for (const re of BLANKET) if (re.test(t)) hit.push(`${prefix}${p}: ${(t.match(re) ?? [''])[0]}`);
  }
  hit.length
    ? fail('sdk', `${prefix}: says no package is published, while ${publishedNames.join(' and ')} are`, hit[0])
    : pass('sdk', `${prefix}: no blanket "nothing is published" claim`);
}

// ── preview-era framing ──────────────────────────────────────────────────────
// The SDK is released. Language describing a controlled preview, an invitation
// or an approval needed to obtain it describes a product that no longer exists.
console.log('\n── preview-era language ──');
const PREVIEW = [
  [/preview SDK/i, 'the SDK is on a public registry; there is no preview to be admitted to'],
  [/SDK preview/i, 'the SDK is on a public registry; there is no preview to be admitted to'],
  [/onboarding do preview/i, 'preview onboarding'],
  [/acesso controlado/i, 'controlled access'],
  [/controlled access/i, 'controlled access'],
  [/parceiros aprovados/i, 'approved partners'],
  [/approved partners/i, 'approved partners'],
];
for (const prefix of ['/docs', '/docs/en']) {
  const hits = [];
  for (const p of PAGES) {
    const t = (await page(prefix + p)).text;
    for (const [re, why] of PREVIEW) if (re.test(t)) hits.push(`${prefix}${p} — ${why}`);
  }
  hits.length
    ? fail('preview', `${prefix}: ${hits.length} preview-era claim(s) on a released SDK`, [...new Set(hits)].slice(0, 6).join('\n      '))
    : pass('preview', `${prefix}: no preview-era framing`);
}

// ── documented endpoints against OpenAPI v1 ──────────────────────────────────
console.log('\n── API reference vs OpenAPI ──');
const spec = JSON.parse(readFileSync(join(ROOT, 'docs/developer/openapi/banzami-sandbox.openapi.json'), 'utf8'));
const specPaths = new Set(Object.keys(spec.paths));
const refText = (await page('/docs/reference')).text;
const documented = new Set((refText.match(/\/v1\/[a-z0-9/_{}-]+/g) ?? [])
  .map((p) => p.replace(/[.,;:)]+$/, ''))
  .filter((p) => !/\{[^}]*\{/.test(p)));

/**
 * A worked example writes the id out — /v1/payment-sessions/psess_exemplo — and
 * that is the documented path with the placeholder filled in, not a different
 * endpoint. Each documented path is matched against the spec as a TEMPLATE, so
 * an example counts as documenting the route it demonstrates. Reading the first
 * run of this audit without that, eleven examples looked like eleven endpoints
 * nobody had published.
 */
const templates = [...specPaths].map((p) => ({
  path: p,
  re: new RegExp(`^${p.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}$`),
}));
const matchesSpec = (p) => specPaths.has(p) || templates.some((t) => t.re.test(p));
const specPathFor = (p) => (specPaths.has(p) ? p : templates.find((t) => t.re.test(p))?.path);

const notInSpec = [...documented].filter((p) => !matchesSpec(p));
// A spec path counts as documented when the reference names it, or names any
// example of it.
const coveredBy = new Set([...documented].map(specPathFor).filter(Boolean));
const notDocumented = [...specPaths].filter((p) => !refText.includes(p) && !coveredBy.has(p));

// A route may be named in order to say it is NOT part of this contract — retired
// (410), or reachable only by a credential this document is not about. Saying so
// is the opposite of publishing it, so the exemption has to be earned by an
// explicit statement next to the path, not by the path being mentioned.
const DISCLAIMED = /(retirad|retired|410|apenas credencial|apenas sess[ãa]o|superf[íi]cie de consumidor|consumer surface only|merchant credential only|merchant session only|n[ãa]o dispon[íi]vel)/i;
const declaredOut = notInSpec.filter((p) =>
  new RegExp(`${p.replace(/[{}]/g, '.')}[\\s\\S]{0,300}`, 'i').exec(refText)?.[0].match(DISCLAIMED));
const realNotInSpec = notInSpec.filter((p) => !declaredOut.includes(p));

realNotInSpec.length
  ? fail('openapi', `DOC_ENDPOINTS_NOT_IN_OPENAPI = ${realNotInSpec.length}`, realNotInSpec.join('\n      '))
  : pass('openapi', `DOC_ENDPOINTS_NOT_IN_OPENAPI = 0 (${declaredOut.length} named only to say they are not part of this contract)`);
notDocumented.length
  ? fail('openapi', `OPENAPI_ENDPOINTS_UNDOCUMENTED = ${notDocumented.length}`, notDocumented.join('\n      '))
  : pass('openapi', `OPENAPI_ENDPOINTS_UNDOCUMENTED = 0 (${specPaths.size} paths)`);

// ── retired and legacy contracts ─────────────────────────────────────────────
console.log('\n── retired and legacy contracts ──');
const LEGACY = [
  ['/v1/business/', 'the /v1/business/* vocabulary was withdrawn'],
  ['applicationFeeBps', 'the caller never selects a fee rate'],
  ['application_fee_bps', 'the caller never selects a fee rate'],
  ['/v2/', 'the public API is v1 only'],
];
for (const prefix of ['/docs', '/docs/en']) {
  const hits = [];
  for (const p of PAGES) {
    const t = (await page(prefix + p)).text;
    for (const [needle, why] of LEGACY) if (t.includes(needle)) hits.push(`${prefix}${p}: ${needle} — ${why}`);
  }
  hits.length ? fail('legacy', `${prefix}: ${hits.length} legacy contract reference(s)`, hits.join('\n      '))
              : pass('legacy', `${prefix}: PUBLIC_DOC_LEGACY_CONTRACTS = 0`);
}

// ── PT / EN parity ───────────────────────────────────────────────────────────
console.log('\n── PT / EN parity ──');
for (const p of PAGES) {
  const pt = await page('/docs' + p);
  const en = await page('/docs/en' + p);
  if (pt.status !== 200 || en.status !== 200) continue;
  // Prose may differ between languages. The contract may not — but an example id
  // is prose: psess_exemplo and psess_example are the same route, and comparing
  // the raw strings reported a translated placeholder as a contract gap. Each
  // path is reduced to the spec template it matches before comparing.
  const eps = (t) => new Set((t.match(/\/v1\/[a-z0-9/_{}-]+/g) ?? [])
    .map((x) => x.replace(/[.,;:)]+$/, ''))
    .map((x) => (specPaths.has(x) ? x : ([...specPaths].find((sp) =>
      new RegExp(`^${sp.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}$`).test(x)) ?? x))));
  const a = eps(pt.text), b = eps(en.text);
  const onlyPt = [...a].filter((x) => !b.has(x));
  const onlyEn = [...b].filter((x) => !a.has(x));
  (onlyPt.length || onlyEn.length)
    ? fail('parity', `/docs${p}: endpoint sets differ`, `PT only: ${onlyPt.join(', ') || '—'}\n      EN only: ${onlyEn.join(', ') || '—'}`)
    : pass('parity', `/docs${p}: same ${a.size} endpoint(s) in both languages`);
}

// ── links and anchors ────────────────────────────────────────────────────────
console.log('\n── links and anchors ──');
const links = [];
for (const [path, v] of fetched) {
  if (v.status !== 200) continue;
  for (const m of v.html.matchAll(/href="(\/[^"#]*)(#[^"]*)?"/g)) {
    if (!/^\/(developers|docs|r)/.test(m[1]) && m[1] !== '/') continue;
    links.push({ from: path, href: m[1] + (m[2] ?? ''), path: m[1], anchor: (m[2] ?? '').slice(1) });
  }
}
const seen = new Set();
let broken = 0, brokenAnchors = 0;
for (const l of links) {
  const k = `${l.from} ${l.href}`;
  if (seen.has(k)) continue;
  seen.add(k);
  const target = await page(l.path);
  if (target.status !== 200) { fail('links', `${l.from} → ${l.path} is ${target.status}`); broken += 1; continue; }
  if (l.anchor && !new RegExp(`id="${l.anchor}"`).test(target.html)) {
    fail('links', `${l.from} → ${l.href} has no element with that id`); brokenAnchors += 1;
  }
}
if (broken === 0 && brokenAnchors === 0) {
  pass('links', `BROKEN_INTERNAL_DOC_LINKS = 0 · BROKEN_DOC_ANCHORS = 0 (${seen.size} checked)`);
}

// ── secrets and private identifiers ──────────────────────────────────────────
console.log('\n── secrets and private identifiers ──');
const SECRETISH = [
  [/bz_(test|live)_sk_[A-Za-z0-9]{8,}/g, 'a secret key value'],
  [/whsec_[A-Za-z0-9]{8,}/g, 'a webhook secret'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, 'a raw UUID'],
  [/postgres:\/\/|\bbanzami_staging\b|\b217\.160\.9\.248\b/g, 'private infrastructure'],
];
let leaks = 0;
for (const [path, v] of fetched) {
  if (v.status !== 200) continue;
  for (const [re, what] of SECRETISH) {
    for (const hit of new Set(v.text.match(re) ?? [])) {
      // Documentation has to show the SHAPE of a key. A placeholder is not a key.
      if (/xxx|YOUR|\.\.\.|example|placeholder|0{8}|1234|aaaa|abcd/i.test(hit)) continue;
      fail('secrets', `${path}: ${what} on a public page`, `${hit.slice(0, 18)}…`);
      leaks += 1;
    }
  }
}
if (leaks === 0) pass('secrets', 'PUBLIC_DOC_REAL_SECRETS = 0 · PUBLIC_DOC_PRIVATE_IDENTIFIERS = 0');

// ── evidence ─────────────────────────────────────────────────────────────────
const out = join(assuranceDir('docs-audit'), `docs-audit-${Date.now()}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ ran_at: new Date().toISOString(), origin: ORIGIN, registry, findings }, null, 2));

const counts = findings.reduce((a, f) => ({ ...a, [f.verdict]: (a[f.verdict] ?? 0) + 1 }), {});
console.log(`\nDOCS_AUDIT: PASS=${counts.PASS ?? 0} FAIL=${counts.FAIL ?? 0}`);
console.log(`evidence: ${out}`);
process.exit(failures ? 1 : 0);
