// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { FinancialReadinessPanel, FinancialSetupCard } from './FinancialSetup';
import { ToastProvider } from './Toast';
import type { FinancialSetupState } from '@/lib/developer-api';

vi.mock('./DeveloperData', () => ({
  useDeveloperData: () => ({ activeProject: { id: 'prj_1' }, csrf: 'csrf-token' }),
}));

const configure = vi.fn();
vi.mock('@/lib/developer-api', async (orig) => {
  const real = await orig<typeof import('@/lib/developer-api')>();
  return { ...real, developerApi: { configureFinancialSetup: (...a: unknown[]) => configure(...a) } };
});

const unconfigured: FinancialSetupState = {
  state: 'UNCONFIGURED', environment: 'SANDBOX', can_configure: true, role: 'OWNER', sealed: false,
};

function open(setup: Partial<FinancialSetupState> = {}, onConfigured = vi.fn()) {
  return render(
    <ToastProvider>
      <FinancialSetupCard setup={{ ...unconfigured, ...setup }} onConfigured={onConfigured} />
    </ToastProvider>,
  );
}

beforeEach(() => { configure.mockReset(); configure.mockResolvedValue({ ...unconfigured, state: 'READY' }); });
afterEach(cleanup);

describe('FinancialSetupCard', () => {
  it('names the state and offers the action to someone who may take it', () => {
    open();
    expect(screen.getByText('Não configurado')).not.toBeNull();
    expect((screen.getByRole('button', { name: /Configurar ambiente financeiro/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  // The one thing this card must never do is look like Go Live.
  it('says the money is fictional and that this does not enable real payments', () => {
    open();
    const body = document.body.textContent ?? '';
    expect(body).toMatch(/fictício/);
    expect(body).toMatch(/não.*activa pagamentos reais/i);
  });

  // The developer never sees, chooses or supplies an internal identifier.
  it('exposes no merchant, wallet or binding vocabulary', () => {
    open();
    const body = (document.body.textContent ?? '').toLowerCase();
    for (const leak of ['merchant', 'binding', 'wallet_id', 'uuid']) {
      expect(body, `the card mentions "${leak}"`).not.toContain(leak);
    }
  });

  it('configures through the server, with the project and the CSRF token', async () => {
    const onConfigured = vi.fn();
    open({}, onConfigured);
    fireEvent.click(screen.getByRole('button', { name: /Configurar ambiente financeiro/ }));
    await waitFor(() => expect(configure).toHaveBeenCalledWith('prj_1', 'csrf-token'));
    await waitFor(() => expect(onConfigured).toHaveBeenCalledTimes(1));
  });

  // A role that may not configure is told why, and is not shown a control that
  // would refuse. The server enforces it regardless; this is only what is shown.
  it('explains rather than offering, when the role may not configure', () => {
    open({ can_configure: false, role: 'DEVELOPER' });
    expect(screen.queryByRole('button', { name: /Configurar/ })).toBeNull();
    expect(document.body.textContent).toMatch(/DEVELOPER/);
    expect(document.body.textContent).toMatch(/Owner ou\s+Admin/);
  });

  // "You may not" and "nobody can here" lead different places.
  it('says a deployment that cannot provision cannot, rather than blaming the role', () => {
    open({ state: 'UNAVAILABLE', can_configure: false });
    expect(screen.getByText('Indisponível')).not.toBeNull();
    expect(document.body.textContent).toMatch(/Nada do que faça aqui pode alterar isso/);
    expect(screen.queryByRole('button', { name: /Configurar/ })).toBeNull();
  });

  it('surfaces a refusal in words that say what happened', async () => {
    const { ApiError } = await import('@/lib/developer-api');
    configure.mockRejectedValue(new ApiError('SANDBOX_ONLY', 403, 'sandbox only'));
    open();
    fireEvent.click(screen.getByRole('button', { name: /Configurar ambiente financeiro/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/apenas no Sandbox/));
  });

  it('tells the developer that repeating it is safe', () => {
    open();
    expect(document.body.textContent).toMatch(/não cria dois ambientes/);
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
    expect(body).toMatch(/classificada pelo Banzami/);
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
