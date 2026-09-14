#!/usr/bin/env node
/**
 * PUBLIC-TRUTH-001 §51 — banzami.com states one current truth.
 *
 * The marketing site is the surface furthest from the runtime, and it drifted
 * furthest: it described an onboarding the platform no longer had, SDKs no
 * registry served, store badges for an app in no store and a "Live" nobody can
 * use. This gate reads every file banzami.com renders and fails when:
 *
 *   PUBLIC_SITE_LEGACY_API_REFS            /v1/business/*, applicationFeeBps, a /v2, or an
 *                                          anchor into the old /developers reference
 *   PUBLIC_SITE_UNPUBLISHED_SDK_CLAIMS     an SDK or install command no registry serves
 *   PUBLIC_SITE_API_VERSION_DRIFT          lib/public-truth.ts and the OpenAPI disagree
 *   PUBLIC_SITE_LIVE_CLAIMS                Live, a licence, a certification or a rail
 *                                          integration stated as available, or the facts
 *                                          module disagrees with the assurance manifest
 *   PUBLIC_SITE_SANDBOX_APPROVAL_DRIFT     the Sandbox described as needing approval
 *   PUBLIC_SITE_KEY_PREFIX_DRIFT           a key shape the runtime does not issue
 *   PUBLIC_SITE_ENVIRONMENT_STATUS_MISSING a surface that no longer states the status
 *   PUBLIC_SITE_COMPETITOR_MENTIONS        a competitor or card network named
 *   PUBLIC_SITE_UNSUPPORTED_COPY           superlatives, speed promises, roadmap promises,
 *                                          waitlists, "tu" forms
 *   PUBLIC_EMAIL_OBFUSCATION_BROKEN        the Cloudflare email_off opt-out is gone
 *
 *   node tools/check-public-site-truth.mjs
 *   BZ_PUBLIC_TRUTH_ROOT=/tmp/copy node tools/check-public-site-truth.mjs   (selftest)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.BZ_PUBLIC_TRUTH_ROOT ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const WEB = 'apps/website';
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir) => {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [dir];
  return readdirSync(abs, { recursive: true }).map(String)
    .filter((f) => /\.(tsx?|md)$/.test(f) && !/\.test\.|node_modules/.test(f))
    .map((f) => `${dir}/${f}`);
};

const walkAll = (dir) => walk(dir);

/** Everything banzami.com renders. The documentation and the Console have gates of their own. */
const SURFACE = [
  ...['app/page.tsx', 'app/layout.tsx', 'app/not-found.tsx', 'app/developers/page.tsx'].map((f) => `${WEB}/${f}`),
  ...['app/produto', 'app/comerciantes', 'app/faq', 'app/sobre', 'app/suporte', 'app/verificar', 'app/app-demo', 'app/ecras'].flatMap((d) => walk(`${WEB}/${d}`)),
  ...['components/site', 'components/app', 'components/produto'].flatMap((d) => walk(`${WEB}/${d}`)),
  ...['components/PlatformBanner.tsx', 'lib/site.ts', 'lib/nav-menus.ts', 'lib/public-truth.ts', 'lib/entities.ts', 'lib/public-pages.ts'].map((f) => `${WEB}/${f}`),
].filter((f) => existsSync(join(ROOT, f)));

const findings = {
  PUBLIC_SITE_LEGACY_API_REFS: [],
  PUBLIC_SITE_UNPUBLISHED_SDK_CLAIMS: [],
  PUBLIC_SITE_API_VERSION_DRIFT: [],
  PUBLIC_SITE_LIVE_CLAIMS: [],
  PUBLIC_SITE_SANDBOX_APPROVAL_DRIFT: [],
  PUBLIC_SITE_KEY_PREFIX_DRIFT: [],
  PUBLIC_SITE_ENVIRONMENT_STATUS_MISSING: [],
  PUBLIC_SITE_COMPETITOR_MENTIONS: [],
  PUBLIC_SITE_UNSUPPORTED_COPY: [],
  PUBLIC_EMAIL_OBFUSCATION_BROKEN: [],
};

// Comments explain history ("it used to say App Store"); only what renders counts.
const stripComments = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));

const RULES = [
  ['PUBLIC_SITE_LEGACY_API_REFS', /\/v1\/business\//g, 'a retired /v1/business/* contract'],
  ['PUBLIC_SITE_LEGACY_API_REFS', /applicationFeeBps|application_fee_bps/g, 'applicationFeeBps, which the API does not accept'],
  ['PUBLIC_SITE_LEGACY_API_REFS', /\/v[2-9]\//g, 'an API version other than v1'],
  ['PUBLIC_SITE_LEGACY_API_REFS', /['"`]\/developers#[a-z-]+/g, 'an anchor into the retired /developers API reference'],
  ['PUBLIC_SITE_UNPUBLISHED_SDK_CLAIMS', /\b(?:Python|PHP|Ruby|Java|\.NET|iOS|Android|Go|Flutter)\b[^.\n]{0,40}\bSDKs?\b|\bSDKs?\b[^.\n]{0,40}\b(?:Python|PHP|Ruby|Java|\.NET|iOS|Android|Go|Flutter)\b/g, 'an SDK no registry serves'],
  ['PUBLIC_SITE_UNPUBLISHED_SDK_CLAIMS', /pip install|composer require|go get |pod ['"]|banzami_flutter|banzami-python|banzami-go\b|sdk-php/g, 'an install command or package that is not published'],
  ['PUBLIC_SITE_LIVE_CLAIMS', /\b(?:Live|produção|produção real)\s+(?:já\s+)?(?:está\s+)?(?:disponível|ativo|ativa|operacional|aberto)\b/gi, 'Live stated as available'],
  ['PUBLIC_SITE_LIVE_CLAIMS', /licen[cç]a (?:do |pelo )?BNA|licenciad[oa]|autorizad[oa] pelo BNA|certificad[oa] (?:pel[oa]|como)|PST-SP|licen[cç]a pendente|license pending|pending licen[cs]e/gi, 'a licence or certification claim'],
  ['PUBLIC_SITE_LIVE_CLAIMS', /(?:EMIS|Multicaixa(?: Express)?)\s+integrad[oa]/gi, 'a rail integration stated as live'],
  ['PUBLIC_SITE_LIVE_CLAIMS', /DISPON[IÍ]VEL NA|(?<!não está |não |ainda não está )(?:[Dd]isponível|[Aa]vailable) (?:na|no|on the) (?:App Store|Google Play)|Baixar a app|Descarregue a app|Download on the App Store|Get it on Google Play/g, 'an app-store availability claim'],
  ['PUBLIC_SITE_SANDBOX_APPROVAL_DRIFT', /Candidate um Business|pedido de acesso [àa] Sandbox|acesso [àa] Sandbox (?:mediante|após|depende de) aprova|Sandbox (?:privada|por convite|em preview)|programa de preview|preview programme/gi, 'the Sandbox described as gated'],
  ['PUBLIC_SITE_COMPETITOR_MENTIONS', /\b(?:Stripe|BitPay|PayPal|Adyen|Flutterwave|Paystack|M-Pesa|WeChat Pay|Visa|Mastercard|Unitel Money|Afrimoney)\b/g, 'a competitor or card network'],
  ['PUBLIC_SITE_UNSUPPORTED_COPY', /\b(?:o melhor|a melhor|o primeiro|a primeira|líder|revolucion\w*|inovador\w*|incrível|mais rápid\w*|mais segur\w*)\b/gi, 'a superlative'],
  ['PUBLIC_SITE_UNSUPPORTED_COPY', /instantaneamente|em segundos|em minutos|menos de \d+ (?:segundos|minutos)|à velocidade da internet/gi, 'a speed promise'],
  ['PUBLIC_SITE_UNSUPPORTED_COPY', /[Ee]m breve|soon:\s*true|[Ww]aitlist|lista de espera/g, 'a roadmap promise or waitlist'],
  ['PUBLIC_SITE_UNSUPPORTED_COPY', /\b(?:Junta-te|precisares|Constrói connosco|Descobre|Aceita pagamentos|Imprime um|recebes|Vês tudo|procuras|Arrasta para|Toca para|Cria a tua|escolhe o teu|o teu negócio|a tua app)\b/g, 'the "tu" form (the site addresses the reader as "você")'],
  ['PUBLIC_SITE_UNSUPPORTED_COPY', /encripta[çc][ãa]o de ponta a ponta|end-to-end encrypt/gi, 'an end-to-end encryption claim'],
];

const lineOf = (src, i) => src.slice(0, i).split('\n').length;

for (const f of SURFACE) {
  const src = stripComments(read(f));
  for (const [key, re, why] of RULES) {
    for (const m of src.matchAll(re)) findings[key].push(`${relative(WEB, f)}:${lineOf(src, m.index)} ${why}: "${m[0].trim()}"`);
  }
}

// ── published packages: install commands come from the proven list only ─────────
const pkgSrc = read(`${WEB}/app/developers/docs/published-packages.ts`);
const published = [...pkgSrc.matchAll(/install:\s*'([^']+)'/g)].map((m) => m[1]);
for (const m of pkgSrc.matchAll(/evidence:\s*'([^']+)'/g)) {
  if (!existsSync(join(ROOT, m[1]))) findings.PUBLIC_SITE_UNPUBLISHED_SDK_CLAIMS.push(`published-packages.ts names evidence that does not exist: ${m[1]}`);
}
for (const f of SURFACE) {
  const src = stripComments(read(f));
  for (const m of src.matchAll(/(?:npm install|npm i|yarn add|pnpm add|dart pub add|flutter pub add)\s+[@\w/.-]+/g)) {
    if (!published.includes(m[0])) findings.PUBLIC_SITE_UNPUBLISHED_SDK_CLAIMS.push(`${relative(WEB, f)}:${lineOf(src, m.index)} install command not in PUBLISHED_PACKAGES: "${m[0]}"`);
  }
}

// ── the facts module against the runtime ───────────────────────────────────────
const truth = read(`${WEB}/lib/public-truth.ts`);
const field = (re) => (truth.match(re) ?? [])[1];
const apiVersion = field(/apiVersion:\s*'([^']+)'/);
const liveStatus = field(/live:\s*\{\s*status:\s*'([A-Z_]+)'/);
const sandboxStatus = field(/sandbox:\s*\{\s*status:\s*'([A-Z_]+)'/);
const sandboxSummary = field(/sandbox:\s*\{[\s\S]*?summary:\s*'([^']+)'/) ?? '';
const liveSummary = field(/live:\s*\{[\s\S]*?summary:\s*\n?\s*'([^']+)'/) ?? '';
const secretPrefix = field(/secret:\s*'([^']+)'/);
const publishablePrefix = field(/publishable:\s*'([^']+)'/);
const appInStores = field(/appInStores:\s*(true|false)/);

const openapi = JSON.parse(read('docs/developer/openapi/banzami-sandbox.openapi.json'));
const versions = new Set(Object.keys(openapi.paths).map((p) => (p.match(/^\/(v\d+)\//) ?? [])[1]).filter(Boolean));
if (versions.size !== 1 || !versions.has(apiVersion)) {
  findings.PUBLIC_SITE_API_VERSION_DRIFT.push(`lib/public-truth.ts says apiVersion '${apiVersion}'; the OpenAPI serves ${[...versions].join(', ') || 'no versioned path'}`);
}

const manifest = read('quality/operator-assurance-manifest.yaml');
// A capability counts only when it is public: the internal admin portal runs in
// both stacks without making Financial Live available to anyone.
const liveAuthorized = manifest.split(/\n\s*- id: /).some((block) => /public_status:\s*public/.test(block) && /^\s*live:\s*true\b/m.test(block));
if ((liveAuthorized ? 'AVAILABLE' : 'NOT_READY') !== liveStatus) {
  findings.PUBLIC_SITE_LIVE_CLAIMS.push(`lib/public-truth.ts says live '${liveStatus}'; the assurance manifest ${liveAuthorized ? 'authorizes' : 'authorizes no'} live capability`);
}
if (liveStatus === 'NOT_READY' && !/indisponível/.test(liveSummary)) findings.PUBLIC_SITE_LIVE_CLAIMS.push('the Live summary does not say it is unavailable');
if (liveStatus === 'NOT_READY' && !/aprovações regulatórias, contratuais e operacionais/.test(liveSummary)) findings.PUBLIC_SITE_LIVE_CLAIMS.push('the Live summary lost the approvals wording');
if (appInStores !== 'false') findings.PUBLIC_SITE_LIVE_CLAIMS.push('lib/public-truth.ts says the app is in the stores; no store listing exists');
if (sandboxStatus !== 'AVAILABLE' || !/sem aprovação/.test(sandboxSummary)) findings.PUBLIC_SITE_SANDBOX_APPROVAL_DRIFT.push('the Sandbox facts no longer say AVAILABLE and "sem aprovação"');

// Key prefixes the runtime actually issues.
const goFiles = readdirSync(join(ROOT, 'services'), { recursive: true }).map(String).filter((f) => f.endsWith('.go') && !f.endsWith('_test.go'));
const runtimePrefixes = new Set();
for (const f of goFiles) for (const m of readFileSync(join(ROOT, 'services', f), 'utf8').matchAll(/"(bz_(?:test|live)_(?:sk|pk)_)/g)) runtimePrefixes.add(m[1]);
for (const p of [secretPrefix, publishablePrefix]) {
  if (!runtimePrefixes.has(p)) findings.PUBLIC_SITE_KEY_PREFIX_DRIFT.push(`lib/public-truth.ts names ${p}; the runtime issues ${[...runtimePrefixes].sort().join(', ')}`);
}
for (const f of SURFACE) {
  const src = stripComments(read(f));
  for (const m of src.matchAll(/\bbz_[a-z]+_[a-z]+_|(?<!bz_(?:test|live)_)\b(?:sk|pk)_(?:live|test)_/g)) {
    if (!runtimePrefixes.has(m[0])) findings.PUBLIC_SITE_KEY_PREFIX_DRIFT.push(`${relative(WEB, f)}:${lineOf(src, m.index)} key shape the runtime does not issue: "${m[0]}"`);
  }
}

// ── every surface states the environment ───────────────────────────────────────
const imports = (f) => /from '@\/lib\/public-truth'/.test(read(`${WEB}/${f}`));
for (const f of ['app/page.tsx', 'app/developers/page.tsx', 'app/faq/page.tsx', 'app/suporte/page.tsx', 'app/comerciantes/page.tsx', 'components/site/Footer.tsx', 'components/site/CTASection.tsx']) {
  if (!existsSync(join(ROOT, WEB, f)) || !imports(f)) findings.PUBLIC_SITE_ENVIRONMENT_STATUS_MISSING.push(`${f} no longer renders the environment facts from lib/public-truth.ts`);
}
const layout = stripComments(read(`${WEB}/app/layout.tsx`));
if (!/<PlatformBanner\s*\/>/.test(layout)) findings.PUBLIC_SITE_ENVIRONMENT_STATUS_MISSING.push('app/layout.tsx no longer renders the Sandbox banner on every page');
const banner = stripComments(read(`${WEB}/components/PlatformBanner.tsx`));
if (!/SANDBOX/.test(banner) || !/Financial Live está indisponível/.test(banner)) findings.PUBLIC_SITE_ENVIRONMENT_STATUS_MISSING.push('the Sandbox banner no longer says Financial Live is unavailable');
const pages = read(`${WEB}/lib/public-pages.ts`);
for (const m of pages.matchAll(/file:\s*'([^']+)'/g)) {
  if (!existsSync(join(ROOT, WEB, m[1]))) findings.PUBLIC_SITE_ENVIRONMENT_STATUS_MISSING.push(`lib/public-pages.ts lists ${m[1]}, which does not exist`);
}

// ── Cloudflare email obfuscation opt-out ───────────────────────────────────────
if (!/__html:\s*'<!--email_off-->'/.test(layout) || !/__html:\s*'<!--\/email_off-->'/.test(layout)) {
  findings.PUBLIC_EMAIL_OBFUSCATION_BROKEN.push('app/layout.tsx lost the <!--email_off--> pair: Cloudflare rewrites every mailto into a decoder our CSP blocks');
}
// Cloudflare does not nest the markers: a second pair anywhere inside the body
// closes the page's region at its first closing marker, and every address after
// it is obfuscated again (the Suporte page, the first time round).
for (const f of walkAll(`${WEB}/app`).concat(walkAll(`${WEB}/components`), walkAll(`${WEB}/lib`))) {
  if (f === `${WEB}/app/layout.tsx`) continue;
  const src = stripComments(read(f));
  if (/email_off/.test(src)) findings.PUBLIC_EMAIL_OBFUSCATION_BROKEN.push(`${relative(WEB, f)} emits its own email_off marker, which ends the layout's region early`);
}

let failed = 0;
for (const [k, list] of Object.entries(findings)) {
  console.log(`${k}=${list.length}`);
  for (const l of list.slice(0, 20)) console.log(`  ✗ ${l}`);
  failed += list.length;
}
console.log(`PUBLIC_SITE_FILES_SCANNED=${SURFACE.length}`);
console.log(`PUBLIC_SITE_TRUTH=${failed ? 'FAIL' : 'PASS'}`);
if (!failed) console.log('\n✓ banzami.com states the current truth: Sandbox available, Financial Live unavailable, v1, published SDKs only');
process.exit(failed ? 1 : 0);
