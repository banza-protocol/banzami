import { describe, expect, it } from 'vitest';
import { isTodayWAT, watDayBoundary, watDayFromBoundary, watDayKey } from './time';

describe('the Luanda (WAT) day', () => {
  it('00:30 WAT is already the next day, though it is still the previous UTC day', () => {
    expect(watDayKey('2026-09-10T23:30:00Z')).toBe('2026-09-11');
    expect(watDayKey('2026-09-10T22:59:59Z')).toBe('2026-09-10');
  });

  it('"today" is the Luanda day, whatever the browser zone', () => {
    const now = new Date('2026-09-11T10:00:00Z');
    expect(isTodayWAT('2026-09-10T23:30:00Z', now)).toBe(true);  // 00:30 WAT on the 11th
    expect(isTodayWAT('2026-09-10T22:30:00Z', now)).toBe(false); // 23:30 WAT on the 10th
    expect(isTodayWAT(null, now)).toBe(false);
    expect(isTodayWAT('not a date', now)).toBe(false);
  });

  it('a picked day filters from its first to its last Luanda moment', () => {
    expect(watDayBoundary('2026-09-11', 'start')).toBe('2026-09-10T23:00:00.000Z');
    expect(watDayBoundary('2026-09-11', 'end')).toBe('2026-09-11T22:59:59.999Z');
    expect(watDayFromBoundary(watDayBoundary('2026-09-11', 'start'))).toBe('2026-09-11');
    expect(watDayFromBoundary(watDayBoundary('2026-09-11', 'end'))).toBe('2026-09-11');
    expect(watDayFromBoundary(undefined)).toBe('');
  });
});
