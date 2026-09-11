import { describe, expect, it } from 'vitest';
import { paidToLabel, payeeDisplay } from './payee';

describe('payee as the payer sees it', () => {
  it('shows the Business name with its @banza under it', () => {
    expect(payeeDisplay('Doa', 'doa')).toEqual({ primary: 'Doa', secondary: '@doa' });
  });

  it('never doubles an "@" the handle already carries', () => {
    expect(payeeDisplay('Doa', '@doa').secondary).toBe('@doa');
  });

  it('a Business with no @banza is shown by name alone', () => {
    expect(payeeDisplay('Cantina Kilamba', null)).toEqual({ primary: 'Cantina Kilamba', secondary: null });
  });

  it('with no name, the @banza leads', () => {
    expect(payeeDisplay('', 'doa')).toEqual({ primary: '@doa', secondary: null });
  });

  it('the confirmation names the @banza', () => {
    expect(paidToLabel('Doa', 'doa')).toBe('Pago a @doa');
    expect(paidToLabel('Cantina Kilamba', null)).toBe('Pago a Cantina Kilamba');
    expect(paidToLabel('', null)).toBeNull();
  });
});
