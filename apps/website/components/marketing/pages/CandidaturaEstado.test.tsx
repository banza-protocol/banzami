// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { fetchApplicationStatus } = vi.hoisted(() => ({ fetchApplicationStatus: vi.fn() }));
vi.mock('@/lib/application-status', async (orig) => ({
  ...(await orig<typeof import('@/lib/application-status')>()),
  fetchApplicationStatus,
}));

import { CandidaturaEstadoPage } from './CandidaturaEstado';

const REF = '11111111-2222-4333-8444-555555555555';
const emptyReq = { policy_version: 'v', currently_due: [], pending_verification: [], errors: [], accepted: [] };
const approved = (activated: boolean) => ({
  ok: true as const,
  status: { application_id: REF, status: 'APPROVED' as const, origin: 'STANDALONE_BUSINESS' as const, requested_handle: 'loja', created_at: '2026-09-20T00:00:00Z', activated, requirements: emptyReq },
});

beforeEach(() => fetchApplicationStatus.mockReset());
afterEach(cleanup);

async function lookup(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Referência da candidatura/), REF);
  await user.click(screen.getByRole('button', { name: /Consultar estado/ }));
}

describe('Application status — approval vs activation', () => {
  it('APPROVED but not activated keeps telling the merchant to activate', async () => {
    fetchApplicationStatus.mockResolvedValue(approved(false));
    const user = userEvent.setup();
    render(<CandidaturaEstadoPage lang="pt" />);
    await lookup(user);
    expect(await screen.findByText('Aprovada')).toBeTruthy();
    expect(screen.getByText(/Recebeu por email o link para ativar/)).toBeTruthy();
    // Activation step still pending — the instruction is present.
    expect(screen.getByText('Ative o negócio com o link que lhe enviarmos.')).toBeTruthy();
    expect(screen.queryByText('Ativa')).toBeNull();
  });

  it('APPROVED and activated shows Ativa and stops asking to activate', async () => {
    fetchApplicationStatus.mockResolvedValue(approved(true));
    const user = userEvent.setup();
    render(<CandidaturaEstadoPage lang="pt" />);
    await lookup(user);
    expect(await screen.findByText('Ativa')).toBeTruthy();
    expect(screen.getByText('O seu negócio está ativo na Sandbox do Banzami Business.')).toBeTruthy();
    // Activation step is now complete — the "activate" instruction is gone.
    expect(screen.getByText('Acesso ao Banzami Business ativado.')).toBeTruthy();
    expect(screen.queryByText('Ative o negócio com o link que lhe enviarmos.')).toBeNull();
    expect(screen.queryByText('Aprovada')).toBeNull();
  });
});
