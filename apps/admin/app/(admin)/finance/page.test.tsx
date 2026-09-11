// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const getFinanceDashboard = vi.fn(async (_f: unknown) => ({
  window: { from: '', to: '' }, environment: 'SANDBOX', currency: null,
  operator_fees: {
    today: [{ key: 'AOA', count: 2, total_minor: 200_000 }, { key: 'USD', count: 1, total_minor: 5_000 }],
    month: [],
    by_currency: [{ key: 'AOA', count: 2, total_minor: 200_000 }, { key: 'USD', count: 1, total_minor: 5_000 }],
    // Core summed these over both currencies: 200 000 cêntimos + 5 000 cents.
    by_business_category: [{ key: 'DONATION', count: 3, total_minor: 205_000 }],
    by_pricing_profile: [],
    by_day: [],
  },
  application_settlements: { today_count: 0, pending_count: 0, failed_count: 0, by_status: [] },
}));

vi.mock('@/lib/session', () => ({ getSession: () => ({ token: 't' }) }));
vi.mock('@/lib/admin-api', () => ({ AdminApi: class { getFinanceDashboard = getFinanceDashboard; } }));

import FinancePage from './page';

afterEach(() => { cleanup(); getFinanceDashboard.mockClear(); });

describe('Finanças — never adds two currencies', () => {
  it('asks for kwanza by default and labels money once, per currency', async () => {
    render(<FinancePage />);
    await screen.findByText('Receita por categoria');
    expect(getFinanceDashboard.mock.calls[0][0]).toMatchObject({ currency: 'AOA' });
    expect(screen.getAllByText('2 000 Kz · 50 USD').length).toBeGreaterThan(0); // "Taxas hoje"
    expect(document.body.textContent).not.toMatch(/Kz (AOA|USD)/);
  });

  it('with every currency, the mixed breakdowns show counts — not a sum across currencies', async () => {
    render(<FinancePage />);
    await screen.findByText('Receita por categoria');
    fireEvent.change(screen.getByDisplayValue('AOA'), { target: { value: '' } });
    await screen.findByText('Taxas por categoria');
    expect(document.body.textContent).not.toContain('2 050 Kz'); // the meaningless 205 000 "cêntimos"
    expect(screen.getAllByText(/nunca se somam/).length).toBeGreaterThan(0);
  });
});
