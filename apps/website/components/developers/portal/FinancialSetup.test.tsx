// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FinancialReadinessPanel, FinancialSetupPointer } from './FinancialSetup';
import type { FinancialSetupState } from '@/lib/developer-api';

const unconfigured: FinancialSetupState = {
  state: 'UNCONFIGURED', environment: 'SANDBOX', can_configure: true, role: 'OWNER', sealed: false,
  onboarding: { state: 'NOT_CONFIGURED', can_act: true, blockers: [] },
};

afterEach(cleanup);

// What Saldos and Transações show for a Project that does not receive into a
// Business yet. It used to be a one-click button that created a synthetic,
// self-approved Business; that is retired (the server answers it 410
// FINANCIAL_SETUP_BY_REVIEW) and this is now a pointer to the page where a
// Project applies for a Business or connects one.
describe('FinancialSetupPointer', () => {
  it('names the state and points to Configuração financeira, inside the Console', () => {
    render(<FinancialSetupPointer setup={unconfigured} />);
    expect(screen.getByText('Não configurado')).not.toBeNull();
    const link = screen.getByRole('link', { name: 'Abrir configuração financeira' });
    expect(link.getAttribute('href')).toBe('/financeiro');
    expect(document.body.textContent).toMatch(/o Banzami tem de verificar a entidade legal responsável por este projeto/);
  });

  it('offers no one-click setup any more', () => {
    render(<FinancialSetupPointer setup={unconfigured} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Configurar ambiente financeiro/);
  });

  it('shows where an application stands, not "not configured", while it is in review', () => {
    render(<FinancialSetupPointer setup={{ ...unconfigured, onboarding: { state: 'IN_REVIEW', can_act: false, blockers: [] } }} />);
    expect(screen.getByText('Em análise')).not.toBeNull();
  });

  // The developer never sees, chooses or supplies an internal identifier.
  it('exposes no merchant, wallet or binding vocabulary', () => {
    render(<FinancialSetupPointer setup={unconfigured} />);
    const body = (document.body.textContent ?? '').toLowerCase();
    for (const leak of ['merchant', 'binding', 'wallet_id', 'uuid']) {
      expect(body, `the card mentions "${leak}"`).not.toContain(leak);
    }
  });

  // "You may not" and "nobody can here" lead different places.
  it('says a deployment that cannot onboard cannot, and offers no way in', () => {
    render(<FinancialSetupPointer setup={{ ...unconfigured, state: 'UNAVAILABLE', can_configure: false }} />);
    expect(screen.getByText('Indisponível')).not.toBeNull();
    expect(document.body.textContent).toMatch(/Nada do que faça aqui pode alterar isso/);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('FinancialReadinessPanel', () => {
  const readiness = {
    financial_identity: { handle: '@doa' },
    kyb: { status: 'APPROVED' },
    wallet: { status: 'ACTIVE', ready: true, currency: 'AOA' },
    pricing: { profile: 'sandbox-reference', settlement_bps: 200, payout_bps: 75 },
    fee_destination: {
      handle: '@doa', required: true, resolved: true, owned_by_project: true, kyb_approved: true,
      wallet_active: true, type_allowed: true, application_account_ready: true, eligible: true, blocker: null,
    },
    settlement: { ready: true, blockers: [] as string[], warnings: [] as string[] },
  };
  const ready: FinancialSetupState = { ...unconfigured, state: 'SEALED', sealed: true, readiness };

  it('shows the same readiness an integration reads with its key', () => {
    render(<FinancialReadinessPanel setup={ready} />);
    const body = document.body.textContent ?? '';
    expect(body).toContain('Pronto para liquidar');
    expect(body).toContain('@doa');
    expect(body).toContain('sandbox-reference');
    expect(body).toMatch(/2%.*0,75%/);
  });

  it('names each blocker, and still shows a code it does not know', () => {
    const blocked = {
      ...ready,
      readiness: { ...readiness, settlement: { ready: false, blockers: ['FEE_DESTINATION_TYPE_NOT_ALLOWED', 'SOMETHING_NEW'], warnings: [] } },
    };
    render(<FinancialReadinessPanel setup={blocked} />);
    const body = document.body.textContent ?? '';
    expect(body).toContain('Bloqueado');
    expect(body).toContain('Receber taxas de aplicação requer aprovação do operador Banzami (classificação da conta).');
    // Classification is the operator's decision about the account, not a
    // verification the Business failed: the sentence must not read as KYB.
    const item = screen.getByRole('list', { name: 'Bloqueios' }).querySelector('li')?.textContent ?? '';
    expect(item).not.toMatch(/KYB|verifica/i);
    expect(body).toContain('SOMETHING_NEW');
  });

  it('an unreadable readiness is not reported as missing configuration', () => {
    render(<FinancialReadinessPanel setup={{ ...ready, readiness: null, readiness_unavailable: true }} />);
    const body = document.body.textContent ?? '';
    expect(body).toMatch(/Não foi possível ler/);
    expect(body).not.toContain('Bloqueado');
  });

  it('renders nothing for an unconfigured project, and names nothing behind the project', () => {
    const { container } = render(<FinancialReadinessPanel setup={unconfigured} />);
    expect(container.textContent).toBe('');
    cleanup();
    render(<FinancialReadinessPanel setup={ready} />);
    const body = (document.body.textContent ?? '').toLowerCase();
    for (const leak of ['merchant', 'binding', 'wallet_id', 'account_id']) expect(body).not.toContain(leak);
  });
});
