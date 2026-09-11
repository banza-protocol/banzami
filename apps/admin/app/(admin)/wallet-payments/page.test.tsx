// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// A listed synthetic reference (tools/assurance/synthetic-proof-references.txt).
const REF = 'BZM-Q7RT-CFAF-00ZT-ADSF-P4N7-FB0T';

const row = (p: Record<string, unknown>) => ({
  merchant_id: 'aaaaaaaa-0000-0000-0000-000000000000', merchant_name: 'Sandbox · Doa-Sandbox',
  payee_handle: 'doa', payee_display_name: 'Doa', payer_name: 'Ana Paula', amount_minor: 200_000,
  currency: 'AOA', status: 'COMPLETED', environment: 'SANDBOX', created_at: '2026-09-11T10:00:00Z',
  receipt_available: true, proof_reference: '', ...p,
});

vi.mock('@/lib/session', () => ({ getSession: () => ({ token: 't' }) }));
vi.mock('@/lib/admin-api', () => ({
  AdminApi: class {
    listWalletPayments = async () => ({
      items: [row({ id: 'with', proof_reference: REF }), row({ id: 'without', payer_name: 'Sem Prova' })],
    });
  },
}));

import WalletPaymentsPage from './page';
import { ToastProvider } from '@/components/ui/toast';

afterEach(() => cleanup());

describe('Pagamentos recebidos', () => {
  it('names the payee as receipts do and shows the operation’s proof reference', async () => {
    render(<ToastProvider><WalletPaymentsPage /></ToastProvider>);
    await screen.findByText(REF);
    expect(screen.getByRole('columnheader', { name: 'Negócio' })).toBeTruthy();
    expect(screen.getAllByText('@doa · Doa')).toHaveLength(2);
    expect(screen.queryByText('Sandbox · Doa-Sandbox')).toBeNull();

    const noProof = screen.getByText('Sem Prova').closest('tr')!;
    expect(noProof.querySelector('td')?.textContent).toBe('—');
  });
});
