import { describe, expect, it } from 'vitest';
import { takeReason } from './reason';

describe('takeReason', () => {
  it('a cancelled prompt performs nothing', () => {
    expect(takeReason(null)).toBeNull();
    expect(takeReason(undefined)).toBeNull();
  });

  it('a blank reason performs nothing', () => {
    expect(takeReason('')).toBeNull();
    expect(takeReason('   \n\t ')).toBeNull();
  });

  it('a written reason is sent trimmed', () => {
    expect(takeReason('  Documentos falsificados \n')).toBe('Documentos falsificados');
  });
});
