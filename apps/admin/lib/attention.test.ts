import { describe, expect, it } from 'vitest';
import {
  ATTENTION_STALE_AFTER_MS,
  attentionHref,
  attentionLabel,
  attentionPhrase,
  badgeText,
  countFor,
  filterByStates,
  usableSummary,
  type AttentionSummary,
} from './attention';

const summary = (env: 'LIVE' | 'SANDBOX', count = 4): AttentionSummary => ({
  environment: env,
  generated_at: '2026-09-10T12:00:00Z',
  total: count,
  categories: { business_applications: { count }, payouts: { count: 0, states: ['PENDING', 'PROCESSING', 'SENT'] } },
});

describe('badgeText', () => {
  it.each([
    [0, null], [-3, null], [Number.NaN, null], [Number.POSITIVE_INFINITY, null], [null, null], [undefined, null],
    [1, '1'], [9, '9'], [99, '99'], [100, '99+'], [4521, '99+'],
  ])('%s → %s', (n, want) => {
    expect(badgeText(n as number)).toBe(want);
  });
});

describe('accessible wording', () => {
  it('says the count in words, singular and plural', () => {
    expect(attentionPhrase(1)).toBe('1 item requer atenção');
    expect(attentionPhrase(4)).toBe('4 itens requerem atenção');
    expect(attentionLabel('Candidaturas', 4)).toBe('Candidaturas, 4 itens requerem atenção');
    expect(attentionLabel('Candidaturas', 1)).toBe('Candidaturas, 1 item requer atenção');
  });
  it('is just the label when nothing waits', () => {
    expect(attentionLabel('Candidaturas', 0)).toBe('Candidaturas');
    expect(attentionLabel('Candidaturas', null)).toBe('Candidaturas');
  });
  it('says the real number past 99 (the badge says 99+)', () => {
    expect(attentionLabel('Pagamentos', 130)).toBe('Pagamentos, 130 itens requerem atenção');
  });
});

describe('usableSummary', () => {
  const t0 = 1_000_000;
  it('serves the last good summary within the stale window', () => {
    expect(usableSummary(summary('SANDBOX'), t0, t0 + ATTENTION_STALE_AFTER_MS, 'SANDBOX')).not.toBeNull();
  });
  it('drops it past the window — no badge, never a zero', () => {
    expect(usableSummary(summary('SANDBOX'), t0, t0 + ATTENTION_STALE_AFTER_MS + 1, 'SANDBOX')).toBeNull();
  });
  it('never shows another environment’s counts', () => {
    expect(usableSummary(summary('LIVE'), t0, t0, 'SANDBOX')).toBeNull();
  });
  it('is null before the first answer', () => {
    expect(usableSummary(null, null, t0, 'SANDBOX')).toBeNull();
  });
});

describe('countFor / attentionHref', () => {
  it('reads a returned category and nothing else', () => {
    const s = summary('SANDBOX');
    expect(countFor(s, 'business_applications')).toBe(4);
    expect(countFor(s, 'payouts')).toBe(0);
    expect(countFor(s, 'disputes')).toBeNull(); // not returned: the role cannot open it
    expect(countFor(s, undefined)).toBeNull();
    expect(countFor(null, 'business_applications')).toBeNull();
  });
  it('opens the attention view only when something waits', () => {
    expect(attentionHref('/merchants', 4)).toBe('/merchants?attention=1');
    expect(attentionHref('/merchants', 0)).toBe('/merchants');
    expect(attentionHref('/merchants', null)).toBe('/merchants');
  });
});

describe('filterByStates', () => {
  const rows = [{ s: 'PENDING' }, { s: 'confirmed' }, { s: 'sent' }, { s: 'FAILED' }];
  it('keeps the rows in the server’s states, case-insensitively', () => {
    expect(filterByStates(rows, ['PENDING', 'PROCESSING', 'SENT'], (r) => r.s)).toEqual([{ s: 'PENDING' }, { s: 'sent' }]);
  });
  it('filters nothing without states', () => {
    expect(filterByStates(rows, undefined, (r) => r.s)).toHaveLength(4);
    expect(filterByStates(rows, [], (r) => r.s)).toHaveLength(4);
  });
});
