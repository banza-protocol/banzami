// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { submitApplication, getPlatformMode, checkHandle } = vi.hoisted(() => ({
  submitApplication: vi.fn(async () => ({ ok: true, applicationId: 'app-1' })),
  getPlatformMode: vi.fn(async () => ({ mode: 'SANDBOX' as const })),
  checkHandle: vi.fn(async (): Promise<{ available: boolean; reason?: string }> => ({ available: true })),
}));
vi.mock('@/lib/api', () => ({ submitApplication, getPlatformMode, checkHandle }));
vi.mock('@/lib/terms', () => ({ TERMS: { version: 'v' }, isTermsPublished: () => true }));

import { CandidaturaPage } from './Candidatura';

beforeEach(() => { submitApplication.mockClear(); checkHandle.mockReset(); });
afterEach(cleanup);

const sandboxReady = () => screen.findByRole('button', { name: /Usar dados de teste/ });

describe('@business live availability (debounced, before submit)', () => {
  it('flags a taken handle as you type — no submit needed', async () => {
    checkHandle.mockResolvedValue({ available: false, reason: 'TAKEN' });
    const user = userEvent.setup();
    render(<CandidaturaPage lang="pt" />);
    await sandboxReady();

    await user.type(screen.getByLabelText(/@negócio/), 'review');
    await waitFor(() => expect(checkHandle).toHaveBeenCalledWith('review'));
    expect(await screen.findByText(/já está em uso/i)).toBeTruthy();
    expect(submitApplication).not.toHaveBeenCalled();
  });

  it('confirms an available handle live', async () => {
    checkHandle.mockResolvedValue({ available: true });
    const user = userEvent.setup();
    render(<CandidaturaPage lang="pt" />);
    await sandboxReady();

    await user.type(screen.getByLabelText(/@negócio/), 'cantina_livre');
    await waitFor(() => expect(checkHandle).toHaveBeenCalled());
    expect(await screen.findByText(/está disponível/i)).toBeTruthy();
  });

  it('only queries a well-formed handle (no API call for an invalid one)', async () => {
    const user = userEvent.setup();
    render(<CandidaturaPage lang="pt" />);
    await sandboxReady();

    await user.type(screen.getByLabelText(/@negócio/), 'ab'); // < 3 chars → invalid
    await new Promise((r) => setTimeout(r, 600)); // past the debounce
    expect(checkHandle).not.toHaveBeenCalled();
  });

  it('blocks Continue on a taken handle', async () => {
    checkHandle.mockResolvedValue({ available: false, reason: 'TAKEN' });
    const user = userEvent.setup();
    render(<CandidaturaPage lang="pt" />);
    await sandboxReady();

    await user.type(screen.getByLabelText(/Nome comercial/), 'Cantina X');
    await user.type(screen.getByLabelText(/@negócio/), 'review');
    await user.selectOptions(screen.getByLabelText(/Categoria/), 'Restauração');
    await user.type(screen.getByLabelText(/E-mail de contacto/), 'x@exemplo.ao');
    await screen.findByText(/já está em uso/i);

    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    // Did not advance (still on step 1) and never submitted.
    expect(submitApplication).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/@negócio/)).toBeTruthy();
  });
});
