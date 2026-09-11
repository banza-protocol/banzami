// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const createPricingRule = vi.fn(async (_b: unknown) => ({ id: 'r2', version: 1 }));

vi.mock('@/lib/session', () => ({ getSession: () => ({ token: 't' }) }));
vi.mock('@/lib/admin-env', () => ({ useAdminEnv: () => ({ env: 'SANDBOX', liveAvailable: false }) }));
vi.mock('@/lib/admin-api', async (orig) => {
  const real = await orig<typeof import('@/lib/admin-api')>();
  return {
    ...real,
    AdminApi: class {
      listPricingProfiles = async () => ({ data: [] });
      listFeePolicies = async () => ({ data: [] });
      listPricingRules = async () => ({
        data: [{
          id: 'r1', rule_key: 'payout-standard', version: 2, environment: 'SANDBOX', enabled: true,
          business_category: null, pricing_profile: 'STANDARD', fee_policy_ref: null, currency: 'AOA',
          country: null, pricing_operation: 'PAYOUT', rate_bps: 75, flat_minor: 0, min_fee_minor: null,
          max_fee_minor: null, rounding: 'HALF_UP', priority: 0, effective_from: '2026-09-01T00:00:00Z',
          effective_to: null, description: null, used: true, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
        }],
      });
      createPricingRule = createPricingRule;
    },
  };
});

import PricingRulesPage from './page';
import { DialogProvider } from '@/components/ui/dialog';
import { ToastProvider } from '@/components/ui/toast';

afterEach(() => { cleanup(); createPricingRule.mockClear(); });

async function renderPage() {
  render(<ToastProvider><DialogProvider><PricingRulesPage /></DialogProvider></ToastProvider>);
  await screen.findByText('payout-standard');
}

describe('Regras de preço — the operation a rule prices', () => {
  it('lists each rule’s operation', async () => {
    await renderPage();
    expect(screen.getByRole('columnheader', { name: 'Operação' })).toBeTruthy();
    expect(screen.getByText('Levantamento')).toBeTruthy();
  });

  it('refuses to send a rule with no operation, then sends the chosen one', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Nova regra/ }));
    fireEvent.change(screen.getByPlaceholderText('ex.: donation-standard'), { target: { value: 'settle-std' } });
    const inputs = screen.getAllByRole('combobox');
    const profile = inputs.find((i) => i.getAttribute('list') === 'pr-profiles')!;
    fireEvent.change(profile, { target: { value: 'STANDARD' } });

    fireEvent.click(screen.getByRole('button', { name: 'Criar regra' }));
    await act(async () => { await Promise.resolve(); });
    expect(createPricingRule).not.toHaveBeenCalled();
    expect(screen.getByText(/Escolha a operação/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Operação taxada'), { target: { value: 'SETTLEMENT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar regra' }));
    await act(async () => { await Promise.resolve(); });
    expect(createPricingRule).toHaveBeenCalledTimes(1);
    expect(createPricingRule.mock.calls[0][0]).toMatchObject({ rule_key: 'settle-std', pricing_operation: 'SETTLEMENT', pricing_profile: 'STANDARD' });
  });
});
