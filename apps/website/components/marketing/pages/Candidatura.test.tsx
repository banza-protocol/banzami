// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { submitApplication, getPlatformMode } = vi.hoisted(() => ({
  submitApplication: vi.fn(),
  getPlatformMode: vi.fn(async () => ({ mode: 'SANDBOX' as const })),
}));
vi.mock('@/lib/api', () => ({ submitApplication, getPlatformMode }));
vi.mock('@/lib/terms', () => ({ TERMS: { version: '2026-09-beta.4' }, isTermsPublished: () => true }));

import { CandidaturaPage } from './Candidatura';

beforeEach(() => { submitApplication.mockReset(); submitApplication.mockResolvedValue({ ok: true, applicationId: 'app-uuid-1' }); });
afterEach(cleanup);

const testDataBtn = () => screen.findByRole('button', { name: /Usar dados de teste/ });
const cont = () => screen.getByRole('button', { name: /Continuar/ });
const send = () => screen.getByRole('button', { name: /Enviar candidatura/ });

describe('Sandbox Business application — full rehearsal flow', () => {
  it('"Usar dados de teste" fills the whole wizard and submits the full payload', async () => {
    const user = userEvent.setup();
    render(<CandidaturaPage lang="pt" />);
    await user.click(await testDataBtn()); // Step 1 button fills every step + both fixtures
    await user.click(cont()); // → Responsável
    await user.click(cont()); // → Documentos
    // Both canonical document fixtures are attached (flow parity, test only).
    expect(screen.getByText('Registo Comercial')).toBeTruthy();
    expect(screen.getByText('Documento de identidade do representante')).toBeTruthy();
    expect(screen.getAllByText('Documento de teste carregado')).toHaveLength(2);
    await user.click(cont()); // → Confirmar
    await user.click(send());

    expect(submitApplication).toHaveBeenCalledTimes(1);
    const payload = submitApplication.mock.calls[0][0];
    expect(payload.nif).toBeTruthy();
    expect(payload.legal_representative).toBeTruthy();
    expect(payload.representative_email).toContain('@');
    expect(payload.sandbox_documents).toEqual(['BUSINESS_REGISTRATION', 'REPRESENTATIVE_ID']);
    expect(payload.locale).toBe('pt');
    // Server-authoritative reference on the success screen.
    expect(await screen.findByText('app-uuid-1')).toBeTruthy();
  });

  it('a missing document blocks the documents step (no generic error, no submit)', async () => {
    const user = userEvent.setup();
    render(<CandidaturaPage lang="pt" />);
    await testDataBtn(); // wait for sandbox mode
    // Fill Step 1 manually (avoid the fill-all button so documents stay empty).
    await user.type(screen.getByLabelText(/Nome comercial/), 'Cantina Teste');
    await user.type(screen.getByLabelText(/@negócio/), 'cantina_teste_x');
    await user.selectOptions(screen.getByLabelText(/Categoria/), 'Restauração');
    await user.type(screen.getByLabelText(/E-mail de contacto/), 'x@exemplo.ao');
    await user.click(cont()); // → Responsável
    // Fill Step 2 via its section button, continue to Documentos.
    await user.click(screen.getByRole('button', { name: /Usar dados de teste/ }));
    await user.click(cont()); // → Documentos
    // No documents attached → Continue must block with the specific error.
    await user.click(cont());
    expect(screen.getAllByText('Anexe o documento de teste para continuar.').length).toBeGreaterThan(0);
    expect(submitApplication).not.toHaveBeenCalled();
    // Still on the documents step (the slots are visible, not the confirm summary).
    expect(screen.getByText('Registo Comercial')).toBeTruthy();
  });

  it('renders the four steps and Sandbox test-data warnings on the sensitive steps', async () => {
    const user = userEvent.setup();
    render(<CandidaturaPage lang="pt" />);
    await user.click(await testDataBtn());
    await user.click(cont()); // → Responsável
    // The representative/NIF step warns to use fictitious data only.
    expect(screen.getByText(/Não introduza NIF, nomes, contactos ou documentos reais/i)).toBeTruthy();
    await user.click(cont()); // → Documentos
    expect(screen.getByText(/utilize apenas documentos de teste/i)).toBeTruthy();
    // Step labels in the stepper.
    for (const s of ['Negócio', 'Responsável', 'Documentos', 'Confirmar']) {
      expect(screen.getAllByText(s).length).toBeGreaterThan(0);
    }
  });
});
