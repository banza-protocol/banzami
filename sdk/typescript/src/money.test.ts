import { describe, expect, it } from 'vitest';
import { addMinor, formatMinor, subtractMinor } from './money.js';

describe('formatMinor', () => {
  // AOA minor units are cêntimos: 1 Kz = 100 minor (core/types currency.rs,
  // docs/architecture/money-engine.md). The helper used to print minor units as
  // whole kwanzas, so 5 000 000 minor (50 000 Kz) showed as "5.000.000 Kz".
  it('formats AOA minor units (cêntimos) as kwanzas, Money Engine style', () => {
    expect(formatMinor(5_000_000, 'AOA')).toBe('50 000 Kz');
    expect(formatMinor(50_000, 'AOA')).toBe('500 Kz');
    expect(formatMinor(12_500, 'AOA')).toBe('125 Kz');
    expect(formatMinor(5_000_050, 'AOA')).toBe('50 000,50 Kz');
    expect(formatMinor(1, 'AOA')).toBe('0,01 Kz');
    expect(formatMinor(-150, 'AOA')).toBe('-1,50 Kz');
  });

  it('formats AOA zero correctly', () => {
    expect(formatMinor(0, 'AOA')).toContain('Kz');
  });

  it('defaults to AOA when no currency is given', () => {
    expect(formatMinor(1000)).toContain('Kz');
  });

  it('formats USD as decimal with two decimal places', () => {
    const result = formatMinor(1099, 'USD');
    expect(result).toContain('10');
    expect(result).toContain('99');
  });

  it('formats EUR as decimal with two decimal places', () => {
    const result = formatMinor(2050, 'EUR');
    expect(result).toContain('20');
    expect(result).toContain('50');
  });

  it('AOA divides by 100 (1 Kz = 100 cêntimos), like every other currency', () => {
    expect(formatMinor(50000, 'AOA')).not.toContain('50 000');
    expect(formatMinor(100, 'AOA')).toBe('1 Kz');
  });
});

describe('addMinor', () => {
  it('adds two amounts correctly', () => {
    expect(addMinor(10000, 5000)).toBe(15000);
  });

  it('handles zero correctly', () => {
    expect(addMinor(0, 9999)).toBe(9999);
    expect(addMinor(9999, 0)).toBe(9999);
  });

  it('adds large amounts without floating-point drift', () => {
    // If implemented with floats this could drift. Integer arithmetic must be exact.
    expect(addMinor(999_999_999, 1)).toBe(1_000_000_000);
  });
});

describe('subtractMinor', () => {
  it('subtracts correctly', () => {
    expect(subtractMinor(50000, 15000)).toBe(35000);
  });

  it('returns zero when amounts are equal', () => {
    expect(subtractMinor(1000, 1000)).toBe(0);
  });

  it('returns negative when b > a (caller is responsible for validation)', () => {
    expect(subtractMinor(100, 200)).toBe(-100);
  });
});
