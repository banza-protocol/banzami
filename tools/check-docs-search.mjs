#!/usr/bin/env node
/**
 * Search task success: what a developer types finds the page that answers it.
 *
 * The queries are the ones a developer actually types into a payments docs
 * search box. Each is run through the SAME ranking function the search box uses
 * (search-core.ts), over the SAME generated index the site ships, and passes
 * only if an expected destination is among the first five results. Nothing here
 * is asserted by hand: change the ranking, the index or a page, and this answers
 * again.
 *
 *   node tools/check-docs-search.mjs
 */
// Type-stripped .ts modules warn about the package type; the warning is noise here.
process.removeAllListeners('warning');
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.BZ_DOCS_ROOT ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIR = join(ROOT, 'apps/website/app/developers/docs');
const { searchDocs } = await import(pathToFileURL(join(DIR, 'search-core.ts')).href);
const index = JSON.parse(readFileSync(join(DIR, 'search-index.json'), 'utf8'));

/** [query, expected href prefixes] — any one of them in the top five passes. */
const QUERIES = {
  pt: [
    ['Financial Setup', ['/docs/get-started#configuracao-financeira', '/docs/glossary#glossario-configuracao-financeira', '/docs/console#financeiro']],
    ['configuração financeira', ['/docs/get-started#configuracao-financeira', '/docs/glossary#glossario-configuracao-financeira']],
    ['payment session', ['/docs/payments', '/docs/reference#resource-sessions', '/docs/get-started#passo-8']],
    ['sessão de pagamento', ['/docs/payments', '/docs/get-started#passo-8', '/docs/glossary#glossario-sessao-pagamento']],
    ['payment link', ['/docs/payments#links', '/docs/glossary#glossario-link-pagamento']],
    ['link de pagamento', ['/docs/payments#links', '/docs/glossary#glossario-link-pagamento']],
    ['refund', ['/docs/refunds', '/docs/reference#ref-refund-create', '/docs/events#event-refund-completed']],
    ['reembolso', ['/docs/refunds']],
    ['settlement', ['/docs/settlements', '/docs/events#event-application_settlement']],
    ['liquidação', ['/docs/settlements']],
    ['idempotency', ['/docs/reference#idempotencia', '/docs/concepts#idempotencia']],
    ['idempotência', ['/docs/reference#idempotencia', '/docs/concepts#idempotencia']],
    ['webhook', ['/docs/webhooks']],
    ['assinatura', ['/docs/webhooks#webhook-passo-4', '/docs/troubleshooting#symptom-signature']],
    ['signature', ['/docs/webhooks#webhook-passo-4', '/docs/glossary#glossario-banza-signature', '/docs/testing#webhook-assinatura']],
    ['payment_session.paid', ['/docs/events#event-payment_session-paid']],
    ['refund.completed', ['/docs/events#event-refund-completed']],
    ['PRICING_NOT_CONFIGURED', ['/docs/errors#error-PRICING_NOT_CONFIGURED']],
    ['INVALID_PARAM', ['/docs/errors#error-INVALID_PARAM']],
    ['403', ['/docs/errors#http-403']],
    ['429', ['/docs/errors#http-429']],
    ['amount_minor', ['/docs/glossary#glossario-amount-minor']],
    ['comprovativo', ['/docs/receipts', '/docs/glossary#glossario-comprovativo']],
    ['receipt', ['/docs/receipts']],
    ['SECURE_V1', ['/docs/receipts#formato']],
    ['/v1/payment-links', ['/docs/reference#ref-pl-']],
    ['API key', ['/docs/glossary#glossario-api-key', '/docs/console#chaves']],
    ['chave de API', ['/docs/glossary#glossario-api-key', '/docs/console#chaves', '/docs/get-started#passo-5']],
    ['rotate key', ['/docs/trust#rotacao']],
    ['rodar chave', ['/docs/trust#rotacao']],
    ['Live', ['/docs/going-live', '/docs/concepts#sandbox-live', '/docs/glossary#glossario-producao']],
    ['Sandbox', ['/docs/concepts#sandbox-live', '/docs/testing', '/docs/glossary#glossario-sandbox']],
    ['suporte', ['/docs/support']],
    ['support', ['/docs/support']],
  ],
  en: [
    ['Financial Setup', ['/docs/en/get-started#financial-setup', '/docs/en/glossary#concepts', '/docs/en/console#financial']],
    ['payment session', ['/docs/en/payments', '/docs/en/reference#resource-sessions', '/docs/en/get-started#step-8', '/docs/en/glossary#concepts']],
    ['payment link', ['/docs/en/payments#links', '/docs/en/glossary#concepts']],
    ['refund', ['/docs/en/refunds', '/docs/en/reference#ref-refund-create']],
    ['settlement', ['/docs/en/settlements']],
    ['idempotency', ['/docs/en/reference#idempotency', '/docs/en/concepts#idempotency', '/docs/en/glossary#concepts']],
    ['webhook', ['/docs/en/webhooks']],
    ['signature', ['/docs/en/webhooks#webhook-step-4', '/docs/en/troubleshooting#symptom-signature', '/docs/en/testing#webhook-signature', '/docs/en/glossary#concepts']],
    ['payment_session.paid', ['/docs/en/events#event-payment_session-paid']],
    ['refund.completed', ['/docs/en/events#event-refund-completed']],
    ['PRICING_NOT_CONFIGURED', ['/docs/en/errors#error-PRICING_NOT_CONFIGURED']],
    ['INVALID_PARAM', ['/docs/en/errors#error-INVALID_PARAM']],
    ['403', ['/docs/en/errors#http-403']],
    ['429', ['/docs/en/errors#http-429']],
    ['amount_minor', ['/docs/en/glossary#concepts']],
    ['receipt', ['/docs/en/receipts']],
    ['SECURE_V1', ['/docs/en/receipts#format']],
    ['/v1/payment-links', ['/docs/en/reference#ref-pl-']],
    ['API key', ['/docs/en/glossary#concepts', '/docs/en/console#keys']],
    ['rotate key', ['/docs/en/trust#rotation']],
    ['Live', ['/docs/en/going-live', '/docs/en/concepts#sandbox-live', '/docs/en/glossary#concepts']],
    ['Sandbox', ['/docs/en/concepts#sandbox-live', '/docs/en/testing', '/docs/en/glossary#concepts']],
    ['support', ['/docs/en/support']],
  ],
};

let failed = 0;
let total = 0;
console.log('documentation search — task success (top 5)\n');
for (const [lang, queries] of Object.entries(QUERIES)) {
  for (const [q, expected] of queries) {
    total += 1;
    const top = searchDocs(index[lang], q, 5);
    const hit = top.find((e) => expected.some((p) => e.h.startsWith(p)));
    if (hit) {
      console.log(`  ✓ ${lang} "${q}" → ${hit.h}`);
    } else {
      failed += 1;
      console.error(`  ✗ ${lang} "${q}" → ${top.map((e) => e.h).join(' | ') || '(nothing)'}\n      expected one of ${expected.join(', ')}`);
    }
  }
}
console.log(`\nDOCS_SEARCH_QUERIES=${total}`);
console.log(`DOCS_SEARCH_QUERIES_FAILED=${failed}`);
console.log(`DOCS_SEARCH_TASK_SUCCESS=${failed === 0 ? 'PASS' : 'FAIL'}`);
process.exit(failed ? 1 : 0);
