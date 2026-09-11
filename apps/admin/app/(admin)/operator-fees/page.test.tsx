// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const listOperatorFees = vi.fn(async (_f: Record<string, string>) => ({ data: [] }));

vi.mock('@/lib/session', () => ({ getSession: () => ({ token: 't' }) }));
vi.mock('@/lib/admin-api', () => ({ AdminApi: class { listOperatorFees = listOperatorFees; } }));

import OperatorFeesPage from './page';
import { ToastProvider } from '@/components/ui/toast';

afterEach(() => { cleanup(); listOperatorFees.mockClear(); });

describe('Taxas do operador — a picked day is a Luanda day', () => {
  it('filters from 00:00 WAT to 23:59:59.999 WAT, and shows the picked day back', async () => {
    render(<ToastProvider><OperatorFeesPage /></ToastProvider>);
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(screen.getByLabelText('Desde (dia WAT)'), { target: { value: '2026-09-11' } });
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(screen.getByLabelText('Até (dia WAT)'), { target: { value: '2026-09-11' } });
    await act(async () => { await Promise.resolve(); });

    const last = listOperatorFees.mock.calls.at(-1)![0];
    expect(last.from).toBe('2026-09-10T23:00:00.000Z');
    expect(last.to).toBe('2026-09-11T22:59:59.999Z');
    expect((screen.getByLabelText('Desde (dia WAT)') as HTMLInputElement).value).toBe('2026-09-11');
    expect(screen.getByText('Datas em hora de Luanda (WAT)')).toBeTruthy();
  });
});
