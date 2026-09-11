import { describe, expect, it } from 'vitest';
import { linkIsPaid } from './api';

describe('linkIsPaid', () => {
  it('a used link is paid', () => {
    expect(linkIsPaid({ status: 'USED' })).toBe(true);
  });

  it('a link retired because its session was paid by QR is paid, not invalid', () => {
    expect(linkIsPaid({ status: 'CANCELLED', paid: true })).toBe(true);
  });

  it('a cancelled or expired link whose payment was not made is not paid', () => {
    expect(linkIsPaid({ status: 'CANCELLED', paid: false })).toBe(false);
    expect(linkIsPaid({ status: 'CANCELLED' })).toBe(false);
    expect(linkIsPaid({ status: 'EXPIRED', paid: false })).toBe(false);
    expect(linkIsPaid({ status: 'ACTIVE', paid: false })).toBe(false);
  });
});
