#!/usr/bin/env node
/**
 * Developer-experience properties of the documentation that a reader feels and
 * a type checker does not: can they find the task, does every guide lead
 * somewhere, does every link land, is money explained where it first appears,
 * do the webhook and testing guides tell the truth, can a screen reader read the
 * diagrams. Each counter is computed from the sources; nothing is asserted.
 *
 *   node tools/check-docs-dx.mjs
 */
process.removeAllListeners('warning');
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.BZ_DOCS_ROOT ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIR = join(ROOT, 'apps/website/app/developers/docs');
const read = (f) => readFileSync(join(DIR, f), 'utf8');

const { ENDPOINT_META } = await import(pathToFileURL(join(DIR, 'endpoint-meta.ts')).href);
const { EVENT_DOCS } = await import(pathToFileURL(join(DIR, 'events.ts')).href);
const { SYMPTOMS } = await import(pathToFileURL(join(DIR, 'symptoms.ts')).href);
const catalogue = JSON.parse(read('error-catalogue.json'));
const CODES = new Set(catalogue.errors.map((e) => e.code));

const SLUG = {
  GetStarted: 'get-started', Concepts: 'concepts', Payments: 'payments', Webhooks: 'webhooks', Events: 'events', Refunds: 'refunds',
  Settlements: 'settlements', Receipts: 'receipts', Transfers: 'transfers', Doa: 'doa', Console: 'console', Reference: 'reference',
  Errors: 'errors', Sdk: 'sdk', Artifacts: 'artifacts', Testing: 'testing', GoingLive: 'going-live', Trust: 'trust',
  Troubleshooting: 'troubleshooting', Support: 'support', Changelog: 'changelog', Glossary: 'glossary',
};
const split = (src, prefix) => {
  const out = {};
  const ms = [...src.matchAll(new RegExp(`export function ${prefix}(\\w+)\\(`, 'g'))];
  ms.forEach((m, i) => { out[m[1]] = src.slice(m.index, i + 1 < ms.length ? ms[i + 1].index : src.length); });
  return out;
};
const pages = { pt: split(read('content-pt.tsx'), 'Pt'), en: split(read('content-en.tsx'), 'En') };
const shell = read('shell.tsx');
const areaBlock = (name) => shell.slice(shell.indexOf(`export const ${name}`), shell.indexOf('];', shell.indexOf(`export const ${name}`)));
const AREAS = { pt: [...areaBlock('AREAS_PT').matchAll(/\{ slug: '([a-z-]*)', label: '([^']+)', desc: '([^']+)' \}/g)].map((m) => ({ slug: m[1], label: m[2], desc: m[3] })), en: [...areaBlock('AREAS_EN').matchAll(/\{ slug: '([a-z-]*)', label: '([^']+)', desc: '([^']+)' \}/g)].map((m) => ({ slug: m[1], label: m[2], desc: m[3] })) };
const SLUGS = new Set(AREAS.pt.map((a) => a.slug));
const results = {};
const set = (k, list) => { results[k] = list; };

// ── navigation ──────────────────────────────────────────────────────────────
{
  const groups = [...shell.slice(shell.indexOf('export const NAV_GROUPS')).matchAll(/\{ id: '([a-z]+)', title: \{ pt: '([^']+)', en: '([^']+)' \}, slugs: \[([^\]]*)\] \}/g)]
    .map((m) => ({ id: m[1], en: m[3], slugs: [...m[4].matchAll(/'([a-z-]*)'/g)].map((x) => x[1]) }));
  const problems = [];
  const required = ['Get started', 'Build', 'Console', 'Reference', 'Learn', 'Resources'];
  if (groups.map((g) => g.en).join('|') !== required.join('|')) problems.push(`groups are ${groups.map((g) => g.en).join(', ')}, not ${required.join(', ')}`);
  const listed = groups.flatMap((g) => g.slugs);
  for (const s of SLUGS) if (listed.filter((x) => x === s).length !== 1) problems.push(`page "${s}" appears ${listed.filter((x) => x === s).length} times in the sidebar`);
  for (const s of listed) if (!SLUGS.has(s)) problems.push(`sidebar lists "${s}", which is not a page`);
  if (AREAS.pt.length !== AREAS.en.length) problems.push('PT and EN list a different number of pages');
  set('DOCS_NAVIGATION_PROBLEMS', problems);
  // One level: a group holds pages; no page holds pages.
  set('MAX_UNNECESSARY_DEPTH', /slugs: \[[^\]]*\{/.test(shell) ? ['a sidebar group nests another level'] : []);
  const dup = [];
  for (const lang of ['pt', 'en']) {
    const seen = new Map();
    for (const a of AREAS[lang]) {
      for (const key of [a.label.toLowerCase(), a.desc.toLowerCase()]) {
        if (seen.has(key)) dup.push(`${lang}: "${a.slug}" and "${seen.get(key)}" share "${key}"`);
        seen.set(key, a.slug);
      }
    }
    const h1s = Object.entries(pages[lang]).map(([fn, body]) => [fn, /<h1[^>]*>([^<]+)<\/h1>/.exec(body)?.[1]]);
    for (const [fn, h1] of h1s) if (!h1) dup.push(`${lang} ${fn}: no page title`);
    const titles = h1s.map(([, h]) => h);
    for (const t of titles) if (titles.filter((x) => x === t).length > 1) dup.push(`${lang}: two pages are titled "${t}"`);
  }
  set('DUPLICATE_PURPOSE_PAGES', [...new Set(dup)]);
}

// ── every guide ends somewhere ──────────────────────────────────────────────
{
  const dead = [];
  for (const lang of ['pt', 'en']) for (const [fn, body] of Object.entries(pages[lang])) {
    const m = /<NextStepCards lang="(pt|en)" items=\{\[([\s\S]*?)\]\} \/>/.exec(body);
    if (!m) { dead.push(`${lang} ${fn}: no next steps`); continue; }
    if (![...m[2].matchAll(/href: '/g)].length) dead.push(`${lang} ${fn}: next steps lead nowhere`);
  }
  set('DOCS_DEAD_END_MAJOR_GUIDES', dead);
}

// ── links land ──────────────────────────────────────────────────────────────
const anchors = (() => {
  const byPage = { pt: {}, en: {} };
  const reference = read('reference.tsx');
  const refIds = [...reference.matchAll(/id: '(ref-[^']+)'/g)].map((m) => m[1])
    .concat([...reference.matchAll(/\{ id: '(resource-[a-z]+)'/g)].map((m) => m[1]), 'restricted-routes');
  const errorIds = [...CODES].map((c) => `error-${c}`).concat(['400', '401', '403', '404', '409', '410', '422', '429', '5xx'].map((s) => `http-${s}`));
  const families = [...read('ErrorCatalogue.tsx').matchAll(/\{ id: '([a-z_]+)', pt: '/g)].map((m) => m[1].replace('_', '-'));
  const eventIds = EVENT_DOCS.map((e) => `event-${e.name.replace('.', '-')}`);
  const glossaryPt = [...read('glossary.ts').matchAll(/id: '([^']+)',\s*term:/g)].map((m) => `glossario-${m[1]}`);
  for (const lang of ['pt', 'en']) {
    for (const [fn, body] of Object.entries(pages[lang])) {
      const slug = SLUG[fn];
      const ids = new Set([...body.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
      for (const m of body.matchAll(/r=\{\{\s*id: '([^']+)'/g)) ids.add(m[1]);
      if (body.includes('<ResourceReference')) refIds.forEach((x) => ids.add(x));
      if (body.includes('<ErrorCatalogue')) { errorIds.forEach((x) => ids.add(x)); families.forEach((f) => ids.add(`${lang === 'pt' ? 'erros' : 'errors'}-${f}`)); }
      if (body.includes('<EventReference')) eventIds.forEach((x) => ids.add(x));
      if (body.includes('<Troubleshooting')) SYMPTOMS.forEach((x) => ids.add(x.id));
      if (fn === 'Glossary' && lang === 'pt') glossaryPt.forEach((x) => ids.add(x));
      byPage[lang][slug] = ids;
    }
    byPage[lang][''] = new Set(['inicio', 'home']);
  }
  return byPage;
})();
function resolveLink(href) {
  const m = /^\/docs(\/en)?(?:\/([a-z-]+))?\/?(?:#(.+))?$/.exec(href);
  if (!m) return `not a documentation URL`;
  const lang = m[1] ? 'en' : 'pt';
  const slug = m[2] ?? '';
  if (slug === 'guides') return 'links to the retired /docs/guides page';
  if (!SLUGS.has(slug)) return `no page "${slug}"`;
  if (m[3] && !anchors[lang][slug]?.has(m[3])) return `no anchor #${m[3]} on ${lang} ${slug || 'home'}`;
  return null;
}
{
  const broken = [];
  const sources = ['content-pt.tsx', 'content-en.tsx', 'HomePage.tsx', 'CapabilityCards.tsx', 'dx.tsx', 'EventReference.tsx', 'Troubleshooting.tsx', 'reference.tsx'];
  for (const f of sources) {
    const src = read(f);
    for (const m of src.matchAll(/href(?:=|: )["'](\/docs[^"'#]*(?:#[^"']*)?)["']/g)) {
      const why = resolveLink(m[1]);
      if (why) broken.push(`${f}: ${m[1]} — ${why}`);
    }
  }
  for (const [id, meta] of Object.entries(ENDPOINT_META)) for (const g of meta.guides) if (!SLUGS.has(g)) broken.push(`endpoint-meta.ts ${id}: guide ${g}`);
  for (const e of EVENT_DOCS) if (!SLUGS.has(e.guide)) broken.push(`events.ts ${e.name}: guide ${e.guide}`);
  for (const s of SYMPTOMS) if (!SLUGS.has(s.guide)) broken.push(`symptoms.ts ${s.id}: guide ${s.guide}`);
  set('DOCS_BROKEN_INTERNAL_LINKS', broken);

  // Links from the Console into the documentation.
  const consoleBroken = [];
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'docs' || e.name === 'node_modules' ? [] : walk(join(d, e.name))) : [join(d, e.name)]);
  const consoleFiles = [...walk(join(ROOT, 'apps/website/app/developers')), ...walk(join(ROOT, 'apps/website/components/developers'))].filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f));
  let count = 0;
  for (const f of consoleFiles) {
    for (const m of readFileSync(f, 'utf8').matchAll(/<DocsLink href="([^"]+)"/g)) {
      count += 1;
      const why = resolveLink(m[1]);
      if (why) consoleBroken.push(`${f.replace(ROOT + '/', '')}: ${m[1]} — ${why}`);
    }
  }
  results.CONSOLE_DOCS_LINKS = count;
  set('CONSOLE_DOCS_BROKEN_DEEP_LINKS', consoleBroken);
}

// ── money is explained where it first appears ───────────────────────────────
{
  const problems = [];
  const MINOR = { pt: /unidades menores/i, en: /minor units/i };
  for (const fn of ['GetStarted', 'Payments', 'Refunds', 'Settlements', 'Transfers', 'Doa']) {
    for (const lang of ['pt', 'en']) {
      const body = pages[lang][fn];
      const firstMoney = body.search(/amount_?[mM]inor|gross_amount|100000/);
      const firstMinor = body.search(MINOR[lang]);
      if (firstMoney < 0) continue;
      if (firstMinor < 0 || firstMinor > firstMoney) problems.push(`${lang} ${fn}: an amount appears before minor units are explained`);
    }
  }
  set('MONEY_MINOR_UNIT_FIRST_USE_UNCLEAR', problems);
}

// ── receipts: two references, one table ─────────────────────────────────────
{
  const problems = [];
  for (const lang of ['pt', 'en']) {
    const body = pages[lang].Receipts;
    const table = body.slice(body.indexOf('<table'), body.indexOf('</table>'));
    if (!/SECURE_V1/.test(table) || !/5AD6BEA0/.test(table) || !/BZM-/.test(table)) problems.push(`${lang}: no table comparing the transaction reference and the SECURE_V1 proof reference`);
  }
  set('RECEIPT_REFERENCE_DISTINCTION_MISSING', problems);
}

// ── settlements: the worked example ─────────────────────────────────────────
{
  const problems = [];
  for (const lang of ['pt', 'en']) {
    const body = pages[lang].Settlements;
    for (const needle of ['100000', '2000', '98000', '200', '−100000 + 2000 + 98000 = 0']) if (!body.includes(needle)) problems.push(`${lang}: the worked example lacks ${needle}`);
    if (!(lang === 'pt' ? /Não\. Só acontece quando a pede/ : /No\. It happens only when you request it/).test(body)) problems.push(`${lang}: does not say settlement is not automatic`);
    if (!/SettlementSplitDiagram/.test(body)) problems.push(`${lang}: no settlement diagram`);
  }
  set('SETTLEMENT_CLARITY_PROBLEMS', problems);
}

// ── webhooks: the safe pattern, the retry and disable truth ─────────────────
{
  const safe = [];
  const retry = [];
  const disable = [];
  for (const lang of ['pt', 'en']) {
    const body = pages[lang].Webhooks;
    const steps = [...body.matchAll(/<StepCard[^>]*?\bid="([^"]+)"\s+title="([^"]+)"/g)].map((m) => m[2]);
    if (steps.length !== 10) safe.push(`${lang}: ${steps.length} steps, not 10`);
    const raw = body.indexOf('req.text()');
    const verify = body.indexOf('constructEvent(raw');
    if (raw < 0 || verify < 0 || raw > verify) safe.push(`${lang}: reading the raw body is not taught before verifying`);
    if (!/(ERRADO|WRONG)[\s\S]*(CERTO|RIGHT)/.test(read(`content-${lang}.tsx`).match(/const SAMPLE_WEBHOOK_WRONG = `[\s\S]*?`;/)?.[0] ?? '')) safe.push(`${lang}: no wrong-and-right example`);
    if (!body.includes('SAMPLE_WEBHOOK_WRONG')) safe.push(`${lang}: the wrong-and-right example is not shown`);
    for (const t of ['1', '5', '30', '2']) if (!new RegExp(`\\['\\d', '${t} (minuto|minutos|minute|minutes|horas|hours)`).test(body)) retry.push(`${lang}: the retry table lacks the ${t} wait`);
    if (/8\s*h/.test(body)) retry.push(`${lang}: mentions an 8 h wait that never happens`);
    if (!(lang === 'pt' ? /nunca lhe são entregues/ : /never delivered to it/).test(body)) disable.push(`${lang}: does not say events emitted while disabled are never delivered`);
  }
  set('WEBHOOK_GUIDE_UNSAFE', safe);
  set('WEBHOOK_GUIDE_RETRY_UNTRUE', retry);
  set('WEBHOOK_GUIDE_DISABLE_UNTRUE', disable);
}

// ── sandbox recipes: real mechanisms only ───────────────────────────────────
{
  const invalid = [];
  const magic = [];
  // What is NOT magic (ADR-060): the published test-payer and scenario routes,
  // and an external-network outcome requested explicitly with one of the four
  // simulate values. Anything else that changes behaviour by its value is.
  const MAGIC = /\/v1\/sandbox\/(?!test-payers|scenarios|external-rail)|4242|magic|simulate(?!d)(?!: &quot;(?:DECLINED|PROVIDER_UNAVAILABLE|TIMEOUT|DELAYED)&quot;)|test card|cart[aã]o de teste|montante m[aá]gico|amount_minor:\s*(?:666|13|999|1)\b/i;
  const SCENARIO_IDS = new Set(JSON.parse(readFileSync(join(ROOT, 'services/api-gateway/internal/handler/sandbox_scenarios.json'), 'utf8')).scenarios.map((x) => x.id));
  const sdk = readFileSync(join(ROOT, 'sdk/typescript/src/client.ts'), 'utf8');
  for (const lang of ['pt', 'en']) {
    const body = pages[lang].Testing;
    const recipes = [...body.matchAll(/<RecipeCard lang="(?:pt|en)" r=\{\{([\s\S]*?)\}\} \/>/g)];
    if (recipes.length < 12) invalid.push(`${lang}: only ${recipes.length} recipes`);
    for (const r of recipes) {
      const id = /id: '([^']+)'/.exec(r[1])?.[1];
      for (const k of ['trigger', 'api', 'event', 'console', 'cleanup']) if (!new RegExp(`\\b${k}: `).test(r[1])) invalid.push(`${lang} ${id}: no ${k}`);
      for (const m of r[1].matchAll(/\b((?:create|get|list|rotate|replay|deactivate)[A-Z]\w+)\b/g)) if (!new RegExp(`\\n\\s+(?:async\\s+)?${m[1]}\\(`).test(sdk)) invalid.push(`${lang} ${id}: ${m[1]} is not an SDK method`);
      for (const c of r[1].matchAll(/<Code>\d{3} ([A-Z][A-Z0-9_]+)<\/Code>/g)) if (!CODES.has(c[1])) invalid.push(`${lang} ${id}: ${c[1]} is not a documented code`);
      if (MAGIC.test(r[1])) magic.push(`${lang} ${id}: ${MAGIC.exec(r[1])[0]}`);
    }
    if (!/(montantes, cartões nem referências especiais|no special amounts, cards or references)/.test(body)) invalid.push(`${lang}: does not say there is no test magic`);
    // Every scenario GET /v1/sandbox/scenarios returns is produced by a recipe on
    // this page, and no recipe names a scenario the catalogue does not have.
    const named = new Set();
    for (const r of recipes) for (const id of (/scenario: '([^']+)'/.exec(r[1])?.[1] ?? '').split(' ').filter(Boolean)) {
      if (!SCENARIO_IDS.has(id)) invalid.push(`${lang}: recipe names scenario ${id}, which GET /v1/sandbox/scenarios does not return`);
      named.add(id);
    }
    for (const id of SCENARIO_IDS) if (!named.has(id)) invalid.push(`${lang}: scenario ${id} has no recipe`);
  }
  set('SANDBOX_TEST_RECIPES_INVALID', invalid);
  set('SANDBOX_UNDOCUMENTED_TEST_MAGIC', magic);
}

// ── realtime: the numbers the pages publish are the gateway's ───────────────
{
  const problems = [];
  const go = readFileSync(join(ROOT, 'services/api-gateway/internal/handler/realtime.go'), 'utf8');
  const constant = (name, unit = '') => Number(new RegExp(`\\b${name}\\s*=\\s*(\\d+)${unit}`).exec(go)?.[1]);
  const beat = constant('RealtimeHeartbeat', ' \\* time\\.Second');
  const perSession = constant('RealtimeMaxPerSession');
  const perIP = constant('RealtimeMaxPerIP');
  if (!beat || !perSession || !perIP) problems.push('realtime.go: heartbeat or stream limits not found');
  const openapi = JSON.parse(readFileSync(join(ROOT, 'docs/developer/openapi/banzami-sandbox.openapi.json'), 'utf8'));
  const rtDesc = JSON.stringify(openapi.paths?.['/v1/realtime/payment-sessions/{id}'] ?? {});
  const checks = [
    ['openapi', rtDesc, [new RegExp(`heartbeat' comment every ${beat} seconds`), new RegExp(`${perSession} streams per session, ${perIP} per IP`)]],
    ['content-pt.tsx', pages.pt.Payments ?? read('content-pt.tsx'), [new RegExp(`heartbeat a cada ${beat} segundos`)]],
    ['content-en.tsx', pages.en.Payments ?? read('content-en.tsx'), [new RegExp(`heartbeat every ${beat} seconds`)]],
    ['reference.tsx', read('reference.tsx'), [new RegExp(`heartbeat a cada ${beat} s\\b`), new RegExp(`heartbeat every ${beat} s\\b`)]],
  ];
  for (const [where, text, patterns] of checks) for (const re of patterns) if (!re.test(text)) problems.push(`${where}: does not say ${re.source} (realtime.go)`);
  for (const [where, text] of [['content-pt.tsx', read('content-pt.tsx')], ['content-en.tsx', read('content-en.tsx')], ['reference.tsx', read('reference.tsx')], ['openapi', rtDesc]]) {
    for (const m of text.matchAll(/heartbeat (?:a cada|every|' comment every) (\d+)/g)) if (Number(m[1]) !== beat) problems.push(`${where}: heartbeat ${m[1]} s, realtime.go says ${beat} s`);
  }
  set('REALTIME_DOCS_NUMBERS_DRIFT', problems);
}

// ── diagrams: title and description, same in both languages ─────────────────
{
  const problems = [];
  for (const f of ['content-pt.tsx', 'content-en.tsx', 'HomePage.tsx']) {
    const src = read(f);
    for (const m of src.matchAll(/<(\w+Diagram)\b([\s\S]*?)\/>/g)) {
      const props = m[2];
      if (!/title[=:]/.test(props)) problems.push(`${f}: ${m[1]} without a title`);
      if (!/desc[=:]/.test(props)) problems.push(`${f}: ${m[1]} without a description`);
    }
  }
  if (!/role="img"/.test(read('diagrams.tsx')) || !/<desc id=/.test(read('diagrams.tsx'))) problems.push('diagrams.tsx does not render role="img" with <title> and <desc>');
  set('DOCS_DIAGRAM_ACCESSIBILITY_PROBLEMS', problems);
}

// ── diagrams: 3–7 nodes, or the drawing stops teaching ───────────────────────
{
  const problems = [];
  const within = (where, n) => { if (n < 3 || n > 7) problems.push(`${where}: ${n} nodes (3–7)`); };
  for (const f of ['content-pt.tsx', 'content-en.tsx']) {
    const src = read(f);
    for (const m of src.matchAll(/<PathDiagram\b[\s\S]*?steps=\{\[([\s\S]*?)\]\}/g)) within(`${f} PathDiagram`, [...m[1].matchAll(/'[^']*'/g)].length);
    for (const m of src.matchAll(/<ResponsibilityDiagram\b[\s\S]*?steps=\{\[([\s\S]*?)\]\}/g)) within(`${f} ResponsibilityDiagram`, [...m[1].matchAll(/side:/g)].length);
  }
  for (const m of read('HomePage.tsx').matchAll(/path: \[([^\]]*)\]/g)) within('HomePage.tsx path', [...m[1].matchAll(/'[^']*'/g)].length);
  // Fixed drawings: count the boxes each one draws.
  const diagrams = read('diagrams.tsx');
  for (const name of ['ConceptModelDiagram', 'SegregatedAccountsDiagram', 'FinancialSetupDiagram']) {
    const at = diagrams.indexOf(`export function ${name}(`);
    const body = diagrams.slice(at, diagrams.indexOf('\n}\n', at));
    const boxes = [...body.matchAll(/<Node\b/g)].length + [...body.matchAll(/<rect x=/g)].length + ([...body.matchAll(/\]\.map\(\(b\)/g)].length ? 2 : 0);
    within(`diagrams.tsx ${name}`, boxes);
  }
  // Realtime channels: the session and its channels.
  for (const f of ['content-pt.tsx', 'content-en.tsx']) {
    for (const m of read(f).matchAll(/<RealtimeChannelsDiagram\b[\s\S]*?channels: \[([\s\S]*?)\],\s*authority:/g)) within(`${f} RealtimeChannelsDiagram`, 1 + [...m[1].matchAll(/name:/g)].length);
  }
  set('DOCS_DIAGRAM_NODE_COUNT_PROBLEMS', problems);
}

// ── quickstart, financial setup, DOA ────────────────────────────────────────
{
  const problems = [];
  for (const lang of ['pt', 'en']) {
    const body = pages[lang].GetStarted;
    const steps = [...body.matchAll(/<StepCard lang="(?:pt|en)" n=\{(\d+)\} of=\{12\}/g)].map((m) => Number(m[1]));
    if (steps.join(',') !== '1,2,3,4,5,6,7,8,9,10,11,12') problems.push(`${lang}: quickstart steps are ${steps.join(',')}`);
    if (!/<StageBar /.test(body)) problems.push(`${lang}: no progress model`);
    const fs = body.slice(body.indexOf('<FinancialSetupDiagram'), body.indexOf('n={5}'));
    if (!fs.includes('<table')) problems.push(`${lang}: Financial Setup has no path comparison`);
    for (const w of ['binding', 'merchant_id', 'owner id', 'wallet_id', 'PRIMARY']) if (fs.includes(w)) problems.push(`${lang}: Financial Setup mentions internal term "${w}"`);
  }
  set('QUICKSTART_FINANCIAL_SETUP_PROBLEMS', problems);

  const { checkContract } = await import(pathToFileURL(join(ROOT, 'tools/e2e/docs/doa-tutorial-e2e.mjs')).href);
  // The contract is judged on the page source: the same text a reader gets, code blocks included.
  const doaText = (lang) => pages[lang].Doa.replace(/\{' '\}/g, ' ').replace(/&apos;/g, "'").replace(/&#123;/g, '{').replace(/&#125;/g, '}');
  const contract = [];
  for (let n = 1; n <= 13; n += 1) contract.push(...checkContract(n, { PT: doaText('pt'), EN: doaText('en') }).map((p) => `step ${n}: ${p}`));
  const human = [];
  for (const lang of ['pt', 'en']) {
    const body = pages[lang].Doa;
    if (!/<ResponsibilityDiagram/.test(body)) human.push(`${lang}: no responsibility diagram`);
    if ([...body.matchAll(/<ChapterFacts /g)].length < 5) human.push(`${lang}: chapters lack goal / DOA does / Banzami does / result / failure`);
    if (/tenant especial|inquilino|a sério|vaquinha|special tenant|real app/i.test(body)) human.push(`${lang}: casual or awkward wording about DOA`);
  }
  set('DOA_TUTORIAL_CONTRACT_PROBLEMS', contract);
  set('DOA_TUTORIAL_HUMAN_FLOW_PROBLEMS', human);
}

// ── troubleshooting ─────────────────────────────────────────────────────────
{
  const problems = [];
  for (const s of SYMPTOMS) {
    for (const k of ['symptom', 'causes', 'check', 'console', 'retry']) if (!s[k]?.pt || !s[k]?.en) problems.push(`${s.id}: ${k} missing in a language`);
    for (const c of s.codes) if (!CODES.has(c)) problems.push(`${s.id}: ${c} is not a documented code`);
  }
  set('TROUBLESHOOTING_PROBLEMS', problems);
}

// ── report ──────────────────────────────────────────────────────────────────
let failures = 0;
console.log('documentation developer experience\n');
for (const [k, v] of Object.entries(results)) {
  if (!Array.isArray(v)) continue;
  failures += v.length;
  if (v.length) { console.error(`  ✗ ${k}=${v.length}`); for (const x of v.slice(0, 25)) console.error(`      ${x}`); } else console.log(`  ✓ ${k}=0`);
}
const pass = (k) => (results[k].length === 0 ? 'PASS' : 'FAIL');
console.log(`
DOCS_NAVIGATION_TASK_ORIENTED=${pass('DOCS_NAVIGATION_PROBLEMS')}
MAX_UNNECESSARY_DEPTH=${results.MAX_UNNECESSARY_DEPTH.length}
DUPLICATE_PURPOSE_PAGES=${results.DUPLICATE_PURPOSE_PAGES.length}
DOCS_DEAD_END_MAJOR_GUIDES=${results.DOCS_DEAD_END_MAJOR_GUIDES.length}
CONSOLE_DOCS_LINKS=${results.CONSOLE_DOCS_LINKS}
CONSOLE_DOCS_BROKEN_DEEP_LINKS=${results.CONSOLE_DOCS_BROKEN_DEEP_LINKS.length}
MONEY_MINOR_UNIT_FIRST_USE_CLARITY=${pass('MONEY_MINOR_UNIT_FIRST_USE_UNCLEAR')}
RECEIPT_REFERENCE_DISTINCTION=${pass('RECEIPT_REFERENCE_DISTINCTION_MISSING')}
WEBHOOK_GUIDE_SAFE_PATTERN=${pass('WEBHOOK_GUIDE_UNSAFE')}
WEBHOOK_GUIDE_RETRY_TRUTH=${pass('WEBHOOK_GUIDE_RETRY_UNTRUE')}
WEBHOOK_GUIDE_DISABLE_TRUTH=${pass('WEBHOOK_GUIDE_DISABLE_UNTRUE')}
SANDBOX_TEST_RECIPES_VALID=${pass('SANDBOX_TEST_RECIPES_INVALID')}
SANDBOX_TESTING_COOKBOOK=${pass('SANDBOX_TEST_RECIPES_INVALID')}
SANDBOX_UNDOCUMENTED_TEST_MAGIC=${results.SANDBOX_UNDOCUMENTED_TEST_MAGIC.length}
REALTIME_DOCS_NUMBERS=${pass('REALTIME_DOCS_NUMBERS_DRIFT')}
DOCS_DIAGRAM_ACCESSIBILITY=${pass('DOCS_DIAGRAM_ACCESSIBILITY_PROBLEMS')}
DOCS_DIAGRAM_NODE_COUNT=${pass('DOCS_DIAGRAM_NODE_COUNT_PROBLEMS')}
FINANCIAL_SETUP_BEGINNER_COMPREHENSION=${pass('QUICKSTART_FINANCIAL_SETUP_PROBLEMS')}
DOA_TUTORIAL_CONTRACT_FLOW=${pass('DOA_TUTORIAL_CONTRACT_PROBLEMS')}
DOA_TUTORIAL_HUMAN_FLOW=${pass('DOA_TUTORIAL_HUMAN_FLOW_PROBLEMS')}`);
process.exit(failures ? 1 : 0);
