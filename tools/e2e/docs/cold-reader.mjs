#!/usr/bin/env node
/**
 * The twelve questions, asked of the published documentation and nothing else.
 *
 * DOCS-PROD-001 §68 names exactly twelve things an external developer must be
 * able to answer with no Slack, no repository, no engineer beside them. An older
 * harness proved ten steps of the quickstart, which is a different thing: that
 * one asks "can a stranger follow the instructions", this one asks "does the
 * documentation actually answer the question".
 *
 * The rule that makes it worth running: every answer must be found by FETCHING
 * THE DEPLOYED PAGES. Nothing is read from the repository, so a fix that has not
 * shipped does not count, and a page that renders its content only in the
 * browser bundle fails here exactly as it would for a reader with a slow
 * connection and an impatient afternoon.
 *
 * An answer is not a keyword. Each question below names the SUBSTANCE that has
 * to be present — the actual command, the actual header, the actual refusal —
 * because "the page mentions webhooks" is how documentation passes a test and
 * fails a person.
 *
 *   node tools/e2e/docs/cold-reader.mjs
 *   BZ_DOCS=https://developers.banzami.com node tools/e2e/docs/cold-reader.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { assuranceDir } from '../lib/assurance-output.mjs';

const BASE = process.env.BZ_DOCS ?? 'https://developers.banzami.com';

/** Every canonical documentation route, in both languages. */
const ROUTES = [
  '/docs', '/docs/get-started', '/docs/console', '/docs/guides', '/docs/reference',
  '/docs/sdk', '/docs/testing', '/docs/trust', '/docs/doa', '/docs/glossary',
  '/docs/changelog', '/docs/artifacts',
];
const EN = ROUTES.map((r) => r.replace('/docs', '/docs/en'));

/**
 * The twelve, each with what counts as an answer.
 *
 * `needs` is a list of alternatives-of-requirements: every entry must match
 * somewhere in the corpus. A question passes only when the documentation says
 * the substantive thing, not when it uses the topic word.
 */
const QUESTIONS = [
  {
    n: 1, q: 'What do I create first?',
    needs: [
      [/workspace/i],
      [/projeto|project/i],
      // The order has to be teachable, not just the nouns present.
      [/workspace[\s\S]{0,400}(projeto|project)/i],
    ],
  },
  {
    n: 2, q: 'Which key goes on the server?',
    needs: [
      [/bz_test_sk_/],
      [/servidor|server[- ]side|no servidor|only on (your |the )?server/i],
      [/nunca.{0,60}(browser|navegador|cliente)|never.{0,60}(browser|client)/i],
    ],
  },
  {
    n: 3, q: 'How do I install the SDK?',
    needs: [[/npm install @banzami\/sdk/]],
  },
  {
    n: 4, q: 'How do I create a payment?',
    needs: [
      [/payment-sessions|payment_session|payment-links/i],
      [/POST \/v1\/(payment-sessions|payment-links)/],
      [/amount_minor/],
    ],
  },
  {
    n: 5, q: 'How do I know it paid?',
    needs: [
      [/payment_session\.paid|payment_link\.paid/],
      [/webhook/i],
      [/status|estado/i],
    ],
  },
  {
    n: 6, q: 'What should I do after a timeout?',
    needs: [
      [/Idempotency-Key/i],
      // The actual guidance, not the word: reuse the key, do not re-issue.
      [/(mesma chave|same key|reutiliz|reuse|repetir com a mesma)/i],
    ],
  },
  {
    n: 7, q: 'How do I verify a webhook?',
    needs: [
      [/banza-signature/],
      [/(corpo em bruto|raw body|req\.text\(\)|raw)/i],
      [/(verif)/i],
      // Verify BEFORE parsing — the rule, not just the verb.
      [/(antes de|before).{0,80}(parse|analisar|olhar|trust|confiar)/i],
    ],
  },
  {
    n: 8, q: 'What is Sandbox?',
    needs: [
      [/sandbox/i],
      [/(dinheiro fict|fictitious|não é dinheiro real|not real money|sem dinheiro real)/i],
    ],
  },
  {
    n: 9, q: 'Can I use Live?',
    needs: [
      [/(live|produção|production)/i],
      [/(indispon|unavailable|não est[áa] dispon|not ready|fail-closed|fechado)/i],
    ],
  },
  {
    n: 10, q: 'How do I refund?',
    needs: [
      [/(reembolso|refund)/i],
      [/(POST \/v1\/refunds|refunds\.create|\/v1\/refunds)/],
      [/(parcial|partial)/i],
    ],
  },
  {
    n: 11, q: 'How do settlements work?',
    needs: [
      [/(liquida|settlement)/i],
      [/application[-_ ]settlement/i],
      // The economics, not just the noun.
      [/(bruto|gross)/i],
      [/(l[íi]quido|net)/i],
    ],
  },
  {
    n: 12, q: 'How do I get support?',
    needs: [
      [/(suporte|support)/i],
      [/request_id/],
      // What NOT to send matters as much as where to write.
      [/(nunca|never).{0,120}(chave|key|segredo|secret)/i],
    ],
  },
];

const fetchText = async (path) => {
  try {
    const r = await fetch(BASE + path, { headers: { 'user-agent': 'banzami-cold-reader' } });
    return r.ok ? await r.text() : '';
  } catch {
    return '';
  }
};

console.log(`the twelve questions, asked of ${BASE}\n`);

const pages = {};
for (const p of [...ROUTES, ...EN]) pages[p] = await fetchText(p);
const fetched = Object.values(pages).filter(Boolean).length;
if (fetched < ROUTES.length) {
  console.error(`✗ only ${fetched} of ${ROUTES.length + EN.length} documentation routes answered — cannot judge the documentation on a partial fetch`);
  process.exit(2);
}

/** Ask one language's corpus. */
function ask(corpus, label) {
  const results = [];
  for (const { n, q, needs } of QUESTIONS) {
    const missing = needs.filter((alts) => !alts.some((re) => re.test(corpus)));
    const answered = missing.length === 0;
    results.push({ n, q, answered, missing: missing.map((alts) => alts.map(String).join(' | ')) });
    console.log(`  ${answered ? '✓' : '✗'} ${label} Q${String(n).padStart(2)} ${q}${answered ? '' : `\n        the documentation does not say: ${missing.map((a) => a[0]).join(' · ')}`}`);
  }
  return results;
}

const ptCorpus = ROUTES.map((r) => pages[r]).join('\n');
const enCorpus = EN.map((r) => pages[r]).join('\n');

console.log('── Portuguese ──');
const pt = ask(ptCorpus, 'PT');
console.log('\n── English ──');
const en = ask(enCorpus, 'EN');

const ptOK = pt.filter((r) => r.answered).length;
const enOK = en.filter((r) => r.answered).length;

const out = join(assuranceDir('docs-cold-reader'), `cold-reader-${Date.now()}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ ran_at: new Date().toISOString(), base: BASE, pt, en }, null, 2)}\n`);

console.log(`\nDOCS_COLD_READER_ACCEPTANCE_PT=${ptOK}/12`);
console.log(`DOCS_COLD_READER_ACCEPTANCE_EN=${enOK}/12`);
console.log(`DOCS_COLD_READER_ACCEPTANCE=${Math.min(ptOK, enOK)}/12`);
console.log(`evidence: ${out}`);

if (ptOK < 12 || enOK < 12) {
  console.error('\n✗ the documentation does not answer every question a stranger has to ask.');
  console.error('  Each miss above is a GAP: fix the page, deploy, and run this again.');
  process.exit(1);
}
console.log('\n✓ twelve of twelve, in both languages, from the published pages alone');
