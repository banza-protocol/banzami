// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const markPayoutReturned = vi.fn(async () => ({}));
const confirmPayout = vi.fn(async () => ({}));

const payout = (id: string, status: string) => ({
  id, merchant_id: 'm-1', wallet_id: 'w-1', status, created_at: '2026-09-01T10:00:00Z',
  amount: { amount_minor: 500_000, currency: 'AOA' },
  destination: { account_number: '1', bank_code: 'BAI', account_holder_name: `Titular ${id}` },
});

vi.mock('@/lib/session', () => ({ getSession: () => ({ token: 't' }) }));
vi.mock('@/lib/admin-api', () => ({
  AdminApi: class {
    listAllPayouts = async () => ({
      data: [payout('pend', 'PENDING'), payout('proc', 'PROCESSING'), payout('sent', 'SENT'), payout('done', 'CONFIRMED')],
    });
    markPayoutReturned = markPayoutReturned;
    confirmPayout = confirmPayout;
  },
}));
vi.mock('@/components/ui/attention-chip', () => ({ AttentionFilterBar: () => null }));
vi.mock('@/components/layout/attention-provider', () => ({
  useAttentionView: () => [false, () => {}],
  useAttentionCategory: () => ({ count: null, states: undefined }),
}));

import PaymentsPage from './page';
import { DialogProvider } from '@/components/ui/dialog';
import { ToastProvider } from '@/components/ui/toast';

async function renderPage() {
  render(<ToastProvider><DialogProvider><PaymentsPage /></DialogProvider></ToastProvider>);
  await screen.findByText('Titular pend');
}
const row = (id: string) => screen.getByText(`Titular ${id}`).closest('tr') as HTMLElement;
const buttons = (id: string) => within(row(id)).queryAllByRole('button').map((b) => b.textContent);

afterEach(() => { cleanup(); markPayoutReturned.mockClear(); confirmPayout.mockClear(); });

describe('Levantamentos — only the actions Core accepts', () => {
  it('offers per-status actions and none on a terminal payout', async () => {
    await renderPage();
    expect(buttons('pend')).toEqual(['Processar', 'Marcar falhado']);
    expect(buttons('proc')).toEqual(['Marcar enviado', 'Marcar falhado']);
    expect(buttons('sent')).toEqual(['Confirmar', 'Devolver', 'Marcar falhado']);
    expect(buttons('done')).toEqual([]);
  });

  it('Devolver sends the reason; Cancelar sends nothing', async () => {
    await renderPage();
    fireEvent.click(within(row('sent')).getByRole('button', { name: 'Devolver' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await act(async () => { await Promise.resolve(); });
    expect(markPayoutReturned).not.toHaveBeenCalled();

    fireEvent.click(within(row('sent')).getByRole('button', { name: 'Devolver' }));
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Conta encerrada' } });
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    await act(async () => { await Promise.resolve(); });
    expect(markPayoutReturned).toHaveBeenCalledWith('sent', 'Conta encerrada');
  });
});
