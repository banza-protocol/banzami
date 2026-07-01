import { describe, it, expect } from 'vitest';
import {
  formatKwanza, formatMoneyDisplay, parseMoneyInput, tryParseMoneyInput,
  parseKwanzaInput, formatMoneyInput, splitEvenlyMinor,
} from './money';

describe('formatMoneyDisplay — minor units, space-grouped, comma decimals', () => {
  it('spec examples', () => {
    expect(formatMoneyDisplay(0)).toBe('0 Kz');
    expect(formatMoneyDisplay(5000000)).toBe('50 000 Kz');
    expect(formatMoneyDisplay(5000050)).toBe('50 000,50 Kz');
    expect(formatMoneyDisplay(125075)).toBe('1 250,75 Kz');
    expect(formatMoneyDisplay(1)).toBe('0,01 Kz');
    expect(formatMoneyDisplay(null)).toBe('—');
  });
  it('never a dot as thousands', () => {
    expect(formatMoneyDisplay(100000000)).toBe('1 000 000 Kz');
    expect(formatMoneyDisplay(5000050).includes('.')).toBe(false);
  });
});

describe('formatKwanza — whole kwanzas', () => {
  it('examples', () => {
    expect(formatKwanza(50000)).toBe('50 000 Kz');
    expect(formatKwanza(1250000)).toBe('1 250 000 Kz');
  });
});

describe('parseMoneyInput → minor units', () => {
  it('spec examples', () => {
    expect(parseMoneyInput('50000')).toBe(5000000);
    expect(parseMoneyInput('50 000')).toBe(5000000);
    expect(parseMoneyInput('50 000,50')).toBe(5000050);
    expect(parseMoneyInput('1250,75')).toBe(125075);
    expect(parseMoneyInput('0,01')).toBe(1);
  });
  it('rejects invalid', () => {
    expect(() => parseMoneyInput('abc')).toThrow();
    expect(() => parseMoneyInput('1,234')).toThrow();
    expect(() => parseMoneyInput('1,,23')).toThrow();
    expect(() => parseMoneyInput('1.23')).toThrow();
    expect(() => parseMoneyInput('-5')).toThrow();
    expect(tryParseMoneyInput('abc')).toBeNull();
  });
});

describe('parseKwanzaInput / formatMoneyInput', () => {
  it('parseKwanzaInput (whole kwanzas)', () => {
    expect(parseKwanzaInput('50 000')).toBe(50000);
    expect(parseKwanzaInput('1 250 000,75')).toBe(1250000);
    expect(parseKwanzaInput('')).toBe(0);
  });
  it('formatMoneyInput (live)', () => {
    expect(formatMoneyInput('50000')).toBe('50 000');
    expect(formatMoneyInput('50000,5')).toBe('50 000,5');
    expect(formatMoneyInput('50000,505')).toBe('50 000,50');
    expect(formatMoneyInput('')).toBe('');
  });
});

describe('splitEvenlyMinor — sum == total', () => {
  it('examples', () => {
    expect(splitEvenlyMinor(5000000, 3)).toEqual([1666667, 1666667, 1666666]);
    expect(splitEvenlyMinor(10001, 2)).toEqual([5001, 5000]);
  });
  it('sum invariant', () => {
    for (const total of [1, 100, 5000000, 10001]) {
      for (const people of [2, 3, 7]) {
        const parts = splitEvenlyMinor(total, people);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });
});
