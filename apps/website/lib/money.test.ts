import { describe, it, expect } from 'vitest';
import { formatKwanza, formatMoneyDisplay, parseKwanzaInput, formatMoneyInput } from './money';

describe('formatMoneyDisplay — from minor units, space-grouped, no cêntimos', () => {
  it('spec examples', () => {
    expect(formatMoneyDisplay(0)).toBe('0 Kz');
    expect(formatMoneyDisplay(50000)).toBe('500 Kz');       // 50 000 minor = 500 Kz
    expect(formatMoneyDisplay(5000000)).toBe('50 000 Kz');  // 50 000 Kz
    expect(formatMoneyDisplay(125000000)).toBe('1 250 000 Kz');
  });
  it('never renders a dot or comma', () => {
    const r = formatMoneyDisplay(5000000);
    expect(r).not.toContain('.');
    expect(r).not.toContain(',');
  });
  it('null → em dash', () => {
    expect(formatMoneyDisplay(null)).toBe('—');
  });
});

describe('formatKwanza — whole kwanzas', () => {
  it('spec examples', () => {
    expect(formatKwanza(0)).toBe('0 Kz');
    expect(formatKwanza(500)).toBe('500 Kz');
    expect(formatKwanza(50000)).toBe('50 000 Kz');
    expect(formatKwanza(1250000)).toBe('1 250 000 Kz');
  });
});

describe('parseKwanzaInput', () => {
  it('strips the space grouping', () => {
    expect(parseKwanzaInput('50 000')).toBe(50000);
    expect(parseKwanzaInput('1 250 000')).toBe(1250000);
    expect(parseKwanzaInput('50000')).toBe(50000);
    expect(parseKwanzaInput('')).toBe(0);
    expect(parseKwanzaInput('Kz')).toBe(0);
  });
});

describe('formatMoneyInput — live input display', () => {
  it('groups the integer with spaces, no suffix', () => {
    expect(formatMoneyInput('50000')).toBe('50 000');
    expect(formatMoneyInput('1250000')).toBe('1 250 000');
    expect(formatMoneyInput('28525')).toBe('28 525');
    expect(formatMoneyInput('')).toBe('');
  });
});
