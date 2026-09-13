#!/usr/bin/env node
/**
 * DOCS-DX-001 §40 — twenty developer tasks, performed against the published
 * documentation only.
 *
 * The cold reader asks whether the corpus contains an answer anywhere. This
 * asks the harder question a person actually has: starting from /docs, can I get
 * to the page that answers my task by following links, and does THAT page — at
 * the section I land on — say the substantive thing?
 *
 * For each task:
 *
 *   page     the page a developer should end up on
 *   anchor   the section on that page; it must exist in the rendered HTML
 *   clicks   the most link hops from /docs allowed to reach the page
 *   needs    what the page must say; every entry must match, in both languages
 *
 * Text is judged on the rendered HTML with scripts removed, so content that
 * exists only in a client bundle or the RSC payload does not count.
 *
 *   node tools/e2e/docs/task-harness.mjs
 *   BZ_DOCS=http://localhost:3006/developers node tools/e2e/docs/task-harness.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { assuranceDir } from '../lib/assurance-output.mjs';

const BASE = process.env.BZ_DOCS ?? 'https://developers.banzami.com';

const SLUGS = ['', 'get-started', 'concepts', 'payments', 'webhooks', 'refunds', 'settlements', 'receipts', 'transfers', 'doa', 'console', 'reference', 'events', 'errors', 'sdk', 'artifacts', 'testing', 'going-live', 'trust', 'glossary', 'troubleshooting', 'support', 'changelog'];
const route = (lang, slug) => `${lang === 'pt' ? '/docs' : '/docs/en'}${slug ? `/${slug}` : ''}`;

/** Both languages in one pattern where the substance is a literal (a code, a path). */
const TASKS = [
  { n: 1, task: 'I want to accept my first payment.', page: 'get-started', anchor: { pt: 'primeiro-pagamento', en: 'first-payment' }, clicks: 1,
    needs: [/createPaymentSession/, /amount_minor/, /pay\.banzami\.com|payment_url|checkout_url/, /payment_session\.paid/] },
  { n: 2, task: 'I already have a Banzami Business. How do I connect it?', page: 'get-started', anchor: { pt: 'configuracao-financeira', en: 'financial-setup' }, clicks: 1,
    needs: [/c[óo]digo de consentimento|consent code/i, /Business (existente|j[áa])|existing Business/i] },
  { n: 3, task: 'I need an API key. Which scope do I need?', page: 'console', anchor: { pt: 'chaves', en: 'keys' }, clicks: 1,
    needs: [/payment_sessions:write/, /refunds:write/, /webhooks:write/, /bz_test_sk_/] },
  { n: 4, task: 'My request timed out. Should I create a new idempotency key?', page: 'reference', anchor: { pt: 'idempotencia', en: 'idempotency' }, clicks: 1,
    needs: [/Idempotency-Key/, /(Timeout ou erro de rede|Timeout or network error).{0,40}(mesma chave|same key)/i, /(chave nova|new key)/i, /IDEMPOTENCY_KEY_REUSED/] },
  { n: 5, task: 'I received a webhook. How do I verify it safely?', page: 'webhooks', anchor: { pt: 'receita', en: 'recipe' }, clicks: 1,
    needs: [/banza-signature/, /req\.text\(\)|raw body|corpo em bruto/i, /(antes de|before).{0,40}(pars(?:e|ing)|interpret)/i, /(5 minutos|5 minutes)/] },
  { n: 6, task: 'I received refund.completed twice. What do I do?', page: 'events', anchor: { pt: 'event-refund-completed', en: 'event-refund-completed' }, clicks: 1,
    needs: [/refund\.completed/, /(pelo|by (the )?event )?\bid\b/, /(duplicad|duplicate)/i] },
  { n: 7, task: 'My Project is not financially ready.', page: 'troubleshooting', anchor: { pt: 'symptom-payments-unavailable', en: 'symptom-payments-unavailable' }, clicks: 1,
    needs: [/PAYMENTS_UNAVAILABLE/, /\/v1\/financial-setup/, /(Configura[çc][ãa]o financeira|Financial setup)/i] },
  { n: 8, task: 'I received PRICING_NOT_CONFIGURED.', page: 'errors', anchor: { pt: 'error-PRICING_NOT_CONFIGURED', en: 'error-PRICING_NOT_CONFIGURED' }, clicks: 1,
    needs: [/PRICING_NOT_CONFIGURED/, /(perfil de pre[çc]o|pricing profile)/i] },
  { n: 9, task: 'I want to issue a partial refund.', page: 'refunds', clicks: 1,
    needs: [/refund_source/, /idempotency_key/, /(parcial|partial)/i, /REFUND_EXCEEDS_CAPTURED/] },
  { n: 10, task: 'I want to settle campaign funds.', page: 'settlements', clicks: 1,
    needs: [/100000/, /98000/, /200 (pontos base|basis points|bps)/i, /(Autom[áa]tica|Automatic) (Sim|Yes)[^.]{0,40} (N[ãa]o|No)\. /, /NOTHING_TO_SETTLE/] },
  { n: 11, task: 'I have a receipt reference. How do I verify it?', page: 'receipts', anchor: { pt: 'verificar', en: 'verify' }, clicks: 1,
    needs: [/banzami\.com\/r\//, /\/v1\/public\/proofs\//, /404/] },
  { n: 12, task: 'I see an 8-character transaction reference. Is that the public proof ref?', page: 'receipts', anchor: { pt: 'duas-referencias', en: 'two-references' }, clicks: 1,
    needs: [/5AD6BEA0/, /BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX/, /(Verific[áa]vel publicamente|Publicly verifiable)/i] },
  { n: 13, task: 'I want to test a bad payment-link cursor.', page: 'testing', anchor: { pt: 'cursor-invalido', en: 'invalid-cursor' }, clicks: 1,
    needs: [/cursor=/, /400 INVALID_PARAM/, /next_cursor/] },
  { n: 14, task: 'Can I use Financial Live?', page: 'concepts', anchor: { pt: 'sandbox-live', en: 'sandbox-live' }, clicks: 1,
    needs: [/fail-closed/, /(Indispon[íi]vel|Unavailable)/i] },
  { n: 15, task: 'How do I rotate my API key?', page: 'trust', anchor: { pt: 'rotacao', en: 'rotation' }, clicks: 2,
    needs: [/\/v1\/me/, /(revogar|revoke)/i] },
  { n: 16, task: 'How do I rotate my webhook secret?', page: 'webhooks', anchor: { pt: 'webhook-passo-10', en: 'webhook-step-10' }, clicks: 1,
    needs: [/rotateWebhookSecret|rotate-secret|(Rodar o segredo|Rotate the secret)/i, /(imediat|immediate)/i] },
  { n: 17, task: 'Where do I see Workspace administrative activity?', page: 'console', anchor: { pt: 'atividade', en: 'activity' }, clicks: 1,
    needs: [/(Configura[çc][õo]es · Atividade|Settings · Activity)/, /(convites|invitations)/i] },
  { n: 18, task: 'Where do I see API/integration logs?', page: 'console', anchor: { pt: 'registos', en: 'logs' }, clicks: 1,
    needs: [/(Registos|Logs)/, /request_id/, /30 (dias|days)/] },
  { n: 19, task: 'I want to understand how DOA integrates Banzami.', page: 'doa', clicks: 1,
    needs: [/@banzami\/sdk/, /(implementa[çc][ãa]o de refer[êe]ncia|reference implementation)/i, /pay\.banzami\.com/, /application_settlement/] },
  { n: 20, task: 'I need help. What information should I send support?', page: 'support', clicks: 1,
    needs: [/developers@banzami\.com/, /request_id/, /(nunca|never).{0,120}(chave|key|segredo|secret)/i] },
];

const unreachable = [];
async function get(path) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const r = await fetch(BASE + path, { headers: { 'user-agent': 'banzami-docs-task-harness' } });
      if (r.ok) return await r.text();
      if (attempt === 3) unreachable.push(`${path} → ${r.status}`);
    } catch (e) {
      if (attempt === 3) unreachable.push(`${path} → ${e.message}`);
    }
    await new Promise((res) => setTimeout(res, 800 * attempt));
  }
  return '';
}

const visible = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ');

/** Links from a page to other documentation pages, as slugs. */
function linkedSlugs(html, lang) {
  const out = new Set();
  const prefix = lang === 'pt' ? '/docs' : '/docs/en';
  for (const m of html.matchAll(/href="([^"#?]*)(?:[#?][^"]*)?"/g)) {
    let p = m[1].replace(/^https:\/\/developers\.banzami\.com/, '').replace(/^\/developers/, '').replace(/\/$/, '');
    if (p === prefix) { out.add(''); continue; }
    if (!p.startsWith(`${prefix}/`)) continue;
    const slug = p.slice(prefix.length + 1);
    if (SLUGS.includes(slug)) out.add(slug);
  }
  return out;
}

const html = { pt: {}, en: {} };
for (const lang of ['pt', 'en']) for (const s of SLUGS) html[lang][s] = await get(route(lang, s));
if (unreachable.length) {
  console.error(`✗ ${unreachable.length} page(s) could not be fetched — the tasks were not attempted:\n  ${unreachable.join('\n  ')}`);
  process.exit(2);
}

/** Link hops from the documentation home to each page. */
function distances(lang) {
  const dist = { '': 0 };
  let frontier = [''];
  while (frontier.length) {
    const next = [];
    for (const s of frontier) for (const t of linkedSlugs(html[lang][s], lang)) if (!(t in dist)) { dist[t] = dist[s] + 1; next.push(t); }
    frontier = next;
  }
  return dist;
}

const results = [];
let failures = 0;
console.log(`DOCS-DX-001 task harness — ${BASE}\n`);
for (const lang of ['pt', 'en']) {
  const dist = distances(lang);
  console.log(`── ${lang.toUpperCase()} ──`);
  for (const t of TASKS) {
    const problems = [];
    const page = html[lang][t.page];
    const hops = dist[t.page];
    if (hops === undefined) problems.push(`${route(lang, t.page)} is not reachable from ${route(lang, '')}`);
    else if (hops > t.clicks) problems.push(`${route(lang, t.page)} is ${hops} clicks from the home page (allowed ${t.clicks})`);
    let text = visible(page);
    if (t.anchor) {
      // Judge the section the anchor opens — up to the next h2 — not the whole page.
      const id = t.anchor[lang];
      const at = page.search(new RegExp(`id="${id}"`));
      if (at < 0) problems.push(`#${id} does not exist on ${route(lang, t.page)}`);
      else {
        const end = page.indexOf('<h2', at + 4);
        text = visible(page.slice(at, end > at ? end : undefined));
      }
    }
    for (const re of t.needs) if (!re.test(text)) problems.push(`does not say ${re}`);
    const ok = problems.length === 0;
    if (!ok) failures += 1;
    results.push({ lang, n: t.n, task: t.task, path: `${route(lang, t.page)}${t.anchor ? `#${t.anchor[lang]}` : ''}`, clicks: hops ?? null, ok, problems });
    console.log(`  ${ok ? '✓' : '✗'} T${String(t.n).padStart(2)} ${t.task}  →  ${route(lang, t.page)}${t.anchor ? `#${t.anchor[lang]}` : ''} (${hops ?? '∞'} click${hops === 1 ? '' : 's'})${ok ? '' : `\n        ${problems.join('\n        ')}`}`);
  }
  console.log('');
}

const pt = results.filter((r) => r.lang === 'pt' && r.ok).length;
const en = results.filter((r) => r.lang === 'en' && r.ok).length;
const out = join(assuranceDir('docs-task-harness'), `task-harness-${Date.now()}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ ran_at: new Date().toISOString(), base: BASE, results }, null, 2)}\n`);
console.log(`DOCS_DX_TASK_ACCEPTANCE_PT=${pt}/${TASKS.length}`);
console.log(`DOCS_DX_TASK_ACCEPTANCE_EN=${en}/${TASKS.length}`);
console.log(`DOCS_DX_TASK_ACCEPTANCE=${Math.min(pt, en)}/${TASKS.length}`);
console.log(`evidence: ${out}`);
process.exit(failures ? 1 : 0);
