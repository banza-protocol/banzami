import { describe, expect, it } from 'vitest';
import { formatMoneyDisplay, formatWatTime } from './money';
import { formatAmount } from './api';

describe('Money Engine display on pay.banzami.com', () => {
  it('groups with a space, Kz last, no cêntimos when whole', () => {
    expect(formatMoneyDisplay(5_000_000)).toBe('50 000 Kz');
    expect(formatMoneyDisplay(0)).toBe('0 Kz');
    expect(formatMoneyDisplay(123_456_700)).toBe('1 234 567 Kz');
  });

  it('shows two cêntimo digits when present — 1 050 minor is "10,50 Kz", never "10,5 Kz"', () => {
    expect(formatMoneyDisplay(1050)).toBe('10,50 Kz');
    expect(formatMoneyDisplay(1)).toBe('0,01 Kz');
    expect(formatAmount(1050, 'AOA')).toBe('10,50 Kz');
  });

  it('never uses dot grouping', () => {
    expect(formatAmount(10_000_000, 'AOA')).not.toContain('.');
  });
});

describe('deadline time', () => {
  it('is Angola time, labelled WAT, whatever the device zone', () => {
    // 13:05 UTC is 14:05 in Luanda (UTC+1, no DST).
    expect(formatWatTime('2026-09-11T13:05:00Z')).toBe('14:05 WAT');
  });
});
