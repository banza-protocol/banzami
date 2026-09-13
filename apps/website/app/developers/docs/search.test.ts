import { describe, expect, it } from 'vitest';
import index from './search-index.json';
import { searchDocs } from './DocsSearch';

type E = Parameters<typeof searchDocs>[0][number];
const pt = index.pt as E[];
const en = index.en as E[];

describe('documentation search', () => {
  it('finds what a developer types, in both languages', () => {
    for (const [entries, q, kind] of [
      [pt, 'PAYMENTS_UNAVAILABLE', 'error'], [en, 'payments_unavailable', 'error'],
      [pt, 'payment_session.paid', 'event'], [en, 'refund.completed', 'event'],
      [pt, 'createPaymentSession', 'method'], [en, 'constructEvent', 'method'],
      [pt, 'POST /v1/refunds', 'endpoint'], [en, '/v1/webhooks/endpoints', 'endpoint'],
      [pt, 'configuracao financeira', 'term'], [en, 'Minor units', 'term'],
      [pt, 'Comprovativos', 'section'], [en, 'Rate limits', 'section'],
    ] as const) {
      const r = searchDocs(entries, q);
      expect(r.some((e) => e.k === kind), `${q} → ${JSON.stringify(r.map((x) => x.k + ':' + x.t))}`).toBe(true);
    }
  });
  it('ranks an exact code first', () => {
    expect(searchDocs(pt, 'NOT_FOUND')[0].t).toBe('NOT_FOUND');
  });
  it('ignores one-character queries', () => {
    expect(searchDocs(pt, 'a')).toEqual([]);
  });
  it('links only into the documentation', () => {
    for (const e of [...pt, ...en]) expect(e.h.startsWith('/docs')).toBe(true);
  });
});
