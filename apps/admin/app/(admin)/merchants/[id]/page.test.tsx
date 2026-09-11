// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const flagAML = vi.fn(async () => ({}));
const suspendMerchant = vi.fn(async () => ({}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'app-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: () => ({ token: 't' }) }));
vi.mock('@/lib/admin-api', () => ({
  AdminApi: class {
    getApplication = async () => ({
      id: 'app-1', status: 'APPROVED', business_name: 'Cantina Kiame', desired_handle: 'kiame',
      created_merchant_id: 'm-1', created_at: '2026-09-01T10:00:00Z',
    });
    flagAML = flagAML;
    suspendMerchant = suspendMerchant;
  },
}));
vi.mock('@/components/applications/KybDocumentsSection', () => ({ KybDocumentsSection: () => null }));
vi.mock('@/components/applications/ApplicationLifecycle', () => ({
  ApplicationActions: () => null, ApplicationOrigin: () => null, BusinessStatePanel: () => null, RequirementsPanel: () => null,
}));

import MerchantDetailPage from './page';
import { DialogProvider } from '@/components/ui/dialog';
import { ToastProvider } from '@/components/ui/toast';

async function renderPage() {
  render(<ToastProvider><DialogProvider><MerchantDetailPage /></DialogProvider></ToastProvider>);
  await act(async () => { await Promise.resolve(); });
  await screen.findByRole('heading', { name: 'Cantina Kiame' });
}

afterEach(() => { cleanup(); flagAML.mockClear(); suspendMerchant.mockClear(); });

describe('Suspender / Sinalizar AML — Cancel means nothing happens', () => {
  it.each([
    ['Suspender', suspendMerchant],
    ['Sinalizar AML', flagAML],
  ])('%s: Cancelar performs no action', async (button, spy) => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(button) }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await act(async () => { await Promise.resolve(); });
    expect(spy).not.toHaveBeenCalled();
  });

  it('a blank reason cannot be submitted', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Suspender/ }));
    const textarea = await screen.findByRole('textbox');
    fireEvent.change(textarea, { target: { value: '   ' } });
    const submit = screen.getAllByRole('button', { name: 'Suspender' }).at(-1)!;
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(textarea.closest('form')!);
    await act(async () => { await Promise.resolve(); });
    expect(suspendMerchant).not.toHaveBeenCalled();
  });

  it('a written reason is sent', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Suspender/ }));
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: ' Fraude confirmada ' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Suspender' }).at(-1)!);
    await act(async () => { await Promise.resolve(); });
    expect(suspendMerchant).toHaveBeenCalledWith('m-1', 'Fraude confirmada');
  });
});
