// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const resolveDispute = vi.fn(async () => ({}));
const dispute = (id: string, status: string) => ({
  id, transaction_id: `tx-${id}`, merchant_id: 'merchant-1', consumer_id: 'consumer-1',
  amount_minor: 250_000, currency: 'AOA', reason: `Motivo ${id}`, status,
  evidence_deadline: null, resolution_notes: null, created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z', resolved_at: null,
});

vi.mock('@/lib/session', () => ({ getSession: () => ({ token: 't' }) }));
vi.mock('@/lib/admin-api', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin-api')>()),
  AdminApi: class {
    listDisputes = async () => ({
      data: [dispute('open', 'OPEN'), dispute('review', 'UNDER_REVIEW'),
        dispute('wc', 'WON_BY_CONSUMER'), dispute('wm', 'WON_BY_MERCHANT'), dispute('closed', 'CLOSED')],
    });
    resolveDispute = resolveDispute;
  },
}));
vi.mock('@/components/ui/attention-chip', () => ({ AttentionFilterBar: () => null }));
vi.mock('@/components/layout/attention-provider', () => ({
  useAttentionView: () => [false, () => {}],
  useAttentionCategory: () => ({ count: null, states: undefined }),
}));

import DisputesPage from './page';
import { ToastProvider } from '@/components/ui/toast';

async function renderPage() {
  render(<ToastProvider><DisputesPage /></ToastProvider>);
  await screen.findByText('Motivo open');
}
const row = (id: string) => screen.getByText(`Motivo ${id}`).closest('tr') as HTMLElement;

afterEach(() => { cleanup(); resolveDispute.mockClear(); });

describe('Disputas', () => {
  it('a dispute won by either side, or closed, is shown closed with no action', async () => {
    await renderPage();
    for (const [id, label] of [['wc', 'Ganha pelo consumidor'], ['wm', 'Ganha pelo comerciante'], ['closed', 'Encerrada sem decisão']]) {
      expect(within(row(id)).queryByRole('button')).toBeNull();
      expect(within(row(id)).getByText(label)).toBeTruthy();
    }
    expect(within(row('open')).getByRole('button', { name: 'Resolver' })).toBeTruthy();
    expect(within(row('review')).getByRole('button', { name: 'Resolver' })).toBeTruthy();
  });

  it('the outcome is a fixed choice of Core’s values, and nothing is sent until one is chosen', async () => {
    await renderPage();
    fireEvent.click(within(row('open')).getByRole('button', { name: 'Resolver' }));
    const dialog = screen.getByRole('dialog', { name: 'Resolver disputa' });
    const radios = within(dialog).getAllByRole('radio').map((r) => (r as HTMLInputElement).value);
    expect(radios).toEqual(['WON_BY_CONSUMER', 'WON_BY_MERCHANT', 'CLOSED']);
    expect(within(dialog).queryByRole('textbox', { name: /Resultado/ })).toBeNull();

    const submit = within(dialog).getByRole('button', { name: 'Resolver' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.click(within(dialog).getByLabelText(/Ganha pelo consumidor/));
    const moneyButton = within(dialog).getByRole('button', { name: 'Resolver e restituir' });
    fireEvent.change(within(dialog).getByLabelText(/Notas/), { target: { value: ' Prova aceite ' } });
    fireEvent.click(moneyButton);
    await act(async () => { await Promise.resolve(); });
    expect(resolveDispute).toHaveBeenCalledWith('open', 'WON_BY_CONSUMER', 'Prova aceite');
  });

  it('Cancelar sends nothing', async () => {
    await renderPage();
    fireEvent.click(within(row('review')).getByRole('button', { name: 'Resolver' }));
    fireEvent.click(screen.getByLabelText(/Encerrada sem decisão/));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(resolveDispute).not.toHaveBeenCalled();
  });
});
