import { describe, it, expect } from 'vitest';
import { formatKz } from './money';

describe('formatKz — the canonical "50 000 Kz" format', () => {
  it('groups thousands with a space and appends Kz, no cents', () => {
    expect(formatKz(1000000)).toBe('10 000 Kz'); // 10 000 Kz (the grant)
    expect(formatKz(250000)).toBe('2 500 Kz');
    expect(formatKz(150000)).toBe('1 500 Kz');
    expect(formatKz(5000000)).toBe('50 000 Kz');
    expect(formatKz(0)).toBe('0 Kz');
  });
  it('can omit the suffix', () => {
    expect(formatKz(1000000, { withSuffix: false })).toBe('10 000');
  });
});
