import { describe, expect, it } from 'vitest';
import { businessLabel, formatAmountMinor, formatDate, formatDateTime, formatKz, formatMoney, formatTotals, totalsByCurrency } from './format';

describe('dates — the Luanda (WAT) calendar, labelled where it is a timestamp', () => {
  it('a date is the Luanda day, not the browser’s', () => {
    expect(formatDate('2026-09-10T23:30:00Z')).toBe('11/09/2026'); // 00:30 WAT
    expect(formatDate('2026-09-10T22:30:00Z')).toBe('10/09/2026'); // 23:30 WAT
    expect(formatDate(null)).toBe('—');
    expect(formatDate('nope')).toBe('—');
  });

  it('a timestamp carries its clock and says WAT', () => {
    expect(formatDateTime('2026-09-10T23:05:00Z')).toBe('11/09/2026, 00:05 (WAT)');
    expect(formatDateTime('2026-09-11T10:00:00Z')).toBe('11/09/2026, 11:00 (WAT)');
    expect(formatDateTime(undefined)).toBe('—');
  });
});

describe('businessLabel', () => {
  it('"@handle · name", either part alone, else the fallback', () => {
    expect(businessLabel('doa', 'Doa')).toBe('@doa · Doa');
    expect(businessLabel('', 'Doa')).toBe('Doa');
    expect(businessLabel('doa', '')).toBe('@doa');
    expect(businessLabel(null, null, 'abc123')).toBe('abc123');
  });
});

describe('money — the currency written once, in its own unit', () => {
  it('kwanza reads "50 000 Kz"', () => {
    expect(formatKz(5_000_000)).toBe('50 000 Kz');
    expect(formatMoney(5_000_050, 'AOA')).toBe('50 000,50 Kz');
    expect(formatMoney(-200_000, 'aoa')).toBe('-2 000 Kz');
    expect(formatMoney(100, null)).toBe('1 Kz');
  });

  it('another currency is never labelled Kz and never doubled', () => {
    expect(formatMoney(5_000, 'USD')).toBe('50 USD');
    expect(formatMoney(1_250, 'EUR')).toBe('12,50 EUR');
    for (const s of [formatMoney(5_000, 'USD'), formatMoney(200_000, 'AOA')]) {
      expect(s).not.toMatch(/Kz (USD|AOA|EUR)|USD USD|AOA/);
    }
  });

  it('a bare amount carries no unit', () => {
    expect(formatAmountMinor(425_000_050)).toBe('4 250 000,50');
    expect(formatAmountMinor(null)).toBe('—');
  });

  it('totals are kept per currency — different currencies are never added', () => {
    const rows = [
      { a: 100_000, c: 'AOA' }, { a: 5_000, c: 'USD' }, { a: 50_000, c: 'AOA' }, { a: null, c: 'EUR' }, { a: 1_000, c: undefined },
    ];
    const t = totalsByCurrency(rows, (r) => r.a, (r) => r.c);
    expect(Object.fromEntries(t)).toEqual({ AOA: 151_000, USD: 5_000 });
    expect(formatTotals(t)).toBe('1 510 Kz · 50 USD');
    expect(formatTotals(new Map())).toBe('0 Kz');
  });
});
