// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { FinancialOnboardingPanel } from './FinancialOnboarding';
import type {
  FinancialOnboarding,
  FinancialSetupState,
  OnboardingApplication,
  OnboardingState,
  ProjectReadiness,
} from '@/lib/developer-api';

const submit = vi.fn();
const link = vi.fn();
vi.mock('@/lib/developer-api', async (orig) => {
  const real = await orig<typeof import('@/lib/developer-api')>();
  return {
    ...real,
    developerApi: {
      submitFinancialApplication: (...a: unknown[]) => submit(...a),
      linkExistingBusiness: (...a: unknown[]) => link(...a),
    },
  };
});

const resubmit = vi.fn();
const listDocs = vi.fn();
vi.mock('@/lib/api', async (orig) => {
  const real = await orig<typeof import('@/lib/api')>();
  return {
    ...real,
    resubmitApplication: (...a: unknown[]) => resubmit(...a),
    listApplicationDocuments: (...a: unknown[]) => listDocs(...a),
    getApplicationRequirements: async () => null,
    checkHandle: async () => ({ available: true }),
    uploadKybDocument: async () => ({ ok: false, reason: 'NOT_CONFIGURED', message: '' }),
  };
});

const APP: OnboardingApplication = {
  application_id: '3f2a9c1e-0b7d-4e55-9a10-2c6f1b8e7d44',
  status: 'UNDER_REVIEW',
  origin: 'DEVELOPER_CONSOLE',
  requested_handle: 'loja',
  business_name: 'Loja Kianda',
  created_at: '2026-09-01T10:00:00Z',
  requirements: {
    policy_version: 'ao-business-2026-09',
    currently_due: [{ code: 'REPRESENTATIVE_ID', kind: 'document', label: 'Documento de identidade do representante', reason: 'MISSING' }],
    pending_verification: [{ code: 'BUSINESS_REGISTRATION', kind: 'document', label: 'Registo Comercial', reason: 'UPLOADED' }],
    errors: [],
    accepted: [],
  },
};

const READINESS: ProjectReadiness = {
  financial_identity: { handle: '@kianda' },
  kyb: { status: 'APPROVED' },
  wallet: { status: 'ACTIVE', ready: true, currency: 'AOA' },
  pricing: { profile: 'sandbox-reference', settlement_bps: 200, payout_bps: 75 },
  fee_destination: {
    handle: '@kianda', required: true, resolved: true, owned_by_project: true, kyb_approved: true,
    wallet_active: true, type_allowed: true, application_account_ready: true, eligible: true, blocker: null,
  },
  settlement: { ready: true, blockers: [], warnings: [] },
};

const BUSINESS = { name: 'Loja Kianda', handle: '@kianda', kyb_status: 'APPROVED', verified: true };

/** The server's answer for a Project in `state`, as `role` sees it. */
function setupFor(state: OnboardingState, role = 'OWNER', over: Partial<FinancialOnboarding> = {}): FinancialSetupState {
  const actor = role === 'OWNER' || role === 'ADMIN';
  const bound = state === 'READY' || state === 'BLOCKED';
  const canAct = actor && (state === 'NOT_CONFIGURED' || state === 'REJECTED' || state === 'INFORMATION_REQUIRED');
  const application =
    state === 'NOT_CONFIGURED' || bound ? undefined
      : state === 'INFORMATION_REQUIRED'
        ? {
            ...APP,
            status: 'INFORMATION_REQUIRED',
            information_request: 'Envie o registo comercial legível.',
            requirements: {
              ...APP.requirements,
              errors: [
                { code: 'BUSINESS_REGISTRATION', kind: 'document' as const, label: 'Registo Comercial', reason: 'REJECTED: ilegível' },
                { code: 'information_request', kind: 'field' as const, label: 'Pedido de informação', reason: 'Envie o registo comercial legível.' },
              ],
              pending_verification: [],
            },
          }
        : { ...APP, status: state === 'REJECTED' ? 'REJECTED' : state === 'APPROVED_PROVISIONING' ? 'APPROVED' : 'UNDER_REVIEW' };
  return {
    state: bound ? 'READY' : 'UNCONFIGURED',
    environment: 'SANDBOX',
    can_configure: canAct,
    role,
    sealed: false,
    readiness: bound ? READINESS : undefined,
    onboarding: {
      state,
      can_act: canAct,
      business: bound ? BUSINESS : undefined,
      application,
      blockers: [],
      ...over,
    },
  };
}

function open(setup: FinancialSetupState, onChanged = vi.fn()) {
  render(<FinancialOnboardingPanel setup={setup} projectId="prj_1" csrf="csrf-token" onChanged={onChanged} />);
  return { onChanged };
}

const container = () => screen.getByTestId('financial-onboarding');
const heading = () => document.getElementById('fo-heading')?.textContent;

beforeEach(() => {
  submit.mockReset();
  link.mockReset();
  resubmit.mockReset();
  listDocs.mockReset();
  listDocs.mockResolvedValue([
    { document_id: 'd1', document_type: 'BUSINESS_REGISTRATION', original_filename: 'registo.pdf', status: 'UPLOADED', size_bytes: 1000, uploaded_at: null, rejection_reason: null },
  ]);
});
afterEach(cleanup);

describe('Configuração financeira — NOT_CONFIGURED', () => {
  it('says what is needed and why, and offers to start', () => {
    open(setupFor('NOT_CONFIGURED'));
    expect(container().getAttribute('data-state')).toBe('NOT_CONFIGURED');
    expect(heading()).toBe('Configuração financeira — Não configurado');
    expect(document.body.textContent).toContain(
      'Para receber pagamentos, liquidações ou taxas de aplicação, o Banzami tem de verificar a entidade legal responsável por este projeto.',
    );
    expect(screen.getByRole('button', { name: 'Iniciar verificação' })).not.toBeNull();
  });

  it('starting shows the two ways, and only those two', () => {
    open(setupFor('NOT_CONFIGURED'));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar verificação' }));
    const fresh = screen.getByTestId('onboarding-path-new');
    const existing = screen.getByTestId('onboarding-path-existing');
    expect(within(fresh).getByRole('heading').textContent).toBe('Criar/verificar um novo negócio');
    expect(within(existing).getByRole('heading').textContent).toBe('Usar um negócio Banzami existente');
    // Neither leaves the Console.
    expect(document.querySelectorAll('a[href*="candidatura"]').length).toBe(0);
  });

  it('the new-business path is the Business application form, with labelled fields', async () => {
    open(setupFor('NOT_CONFIGURED'));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar verificação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar novo negócio' }));
    const form = screen.getByTestId('business-application');
    expect(within(form).getByRole('heading', { name: 'Criar/verificar um novo negócio' })).not.toBeNull();
    for (const label of ['Nome do negócio', 'NIF da empresa', 'Categoria do negócio', 'Email do negócio', 'Província']) {
      expect(within(form).getByLabelText(new RegExp(label))).not.toBeNull();
    }
    // Leaving a step with required fields empty says what is missing.
    fireEvent.click(within(form).getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(form.textContent).toContain('Indique o nome do negócio.'));
    expect(submit).not.toHaveBeenCalled();
  });

  it('the existing-business path takes the consent code, with or without dashes, in any case', async () => {
    link.mockResolvedValue({ business: BUSINESS });
    const { onChanged } = open(setupFor('NOT_CONFIGURED'));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar verificação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ligar negócio existente' }));
    const input = screen.getByLabelText('Código do negócio') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abcd efgh jkmn' } });
    expect(input.value).toBe('ABCD-EFGH-JKMN');
    fireEvent.click(screen.getByRole('button', { name: 'Ligar negócio' }));
    await waitFor(() => expect(link).toHaveBeenCalledWith('prj_1', 'ABCDEFGHJKMN', 'csrf-token'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status').textContent).toContain('Loja Kianda está ligado a este projeto.');
  });

  it('an incomplete code is not sent, and a refused one says what to do', async () => {
    const { ApiError } = await import('@/lib/developer-api');
    link.mockRejectedValue(new ApiError('LINK_CODE_INVALID', 422, 'invalid'));
    open(setupFor('NOT_CONFIGURED'));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar verificação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ligar negócio existente' }));
    const input = screen.getByLabelText('Código do negócio');
    fireEvent.change(input, { target: { value: 'ABCD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ligar negócio' }));
    expect(link).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/12 letras e números/);
    fireEvent.change(input, { target: { value: 'ABCDEFGHJKMN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ligar negócio' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/código novo/));
  });
});

describe('Configuração financeira — an application in review', () => {
  it('IN_REVIEW shows the reference, the @ asked for, what is pending and the documents', async () => {
    open(setupFor('IN_REVIEW'));
    expect(container().getAttribute('data-state')).toBe('IN_REVIEW');
    expect(heading()).toBe('Configuração financeira — Em análise');
    expect(screen.getByTestId('application-reference').textContent).toBe('3F2A9C1E');
    expect(document.body.textContent).toContain('@loja');
    expect(within(screen.getByTestId('requirements-pending')).getByText('Registo Comercial')).not.toBeNull();
    expect(within(screen.getByTestId('requirements-due')).getByText('Em falta')).not.toBeNull();
    await waitFor(() => expect(screen.getByText('registo.pdf')).not.toBeNull());
    expect(listDocs).toHaveBeenCalledWith(APP.application_id);
    // The still-due document can be sent from here; the one in verification is not offered again.
    expect(screen.getByLabelText('Documento de identidade do representante')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Enviar Registo Comercial' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Iniciar verificação' })).toBeNull();
  });

  it('INFORMATION_REQUIRED puts the reviewer’s request first, and resubmits', async () => {
    resubmit.mockResolvedValue({ ok: true });
    const { onChanged } = open(setupFor('INFORMATION_REQUIRED'));
    expect(container().getAttribute('data-state')).toBe('INFORMATION_REQUIRED');
    expect(heading()).toBe('Configuração financeira — Informação pedida');
    expect(screen.getByTestId('information-request').textContent).toContain('Envie o registo comercial legível.');
    expect(within(screen.getByTestId('requirements-errors')).getByText('Recusado: ilegível')).not.toBeNull();
    // The reviewer's request is not repeated as a line of the list.
    expect(within(screen.getByTestId('requirements-errors')).queryByText('Pedido de informação')).toBeNull();
    // A replacement for the refused document can be sent.
    expect(screen.getByRole('button', { name: 'Enviar Registo Comercial' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar para análise' }));
    await waitFor(() => expect(resubmit).toHaveBeenCalledWith(APP.application_id));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it('a resubmission with requirements still unmet says so', async () => {
    resubmit.mockResolvedValue({ ok: false, status: 422, code: 'REQUIREMENTS_NOT_MET' });
    open(setupFor('INFORMATION_REQUIRED'));
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar para análise' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Ainda há requisitos por cumprir/));
  });

  it('APPROVED_PROVISIONING says it is approved and being finished', () => {
    open(setupFor('APPROVED_PROVISIONING'));
    expect(container().getAttribute('data-state')).toBe('APPROVED_PROVISIONING');
    expect(heading()).toBe('Aprovado — a concluir a configuração');
    expect(screen.getByTestId('application-reference').textContent).toBe('3F2A9C1E');
  });

  it('REJECTED says so, and allows starting again', () => {
    open(setupFor('REJECTED'));
    expect(container().getAttribute('data-state')).toBe('REJECTED');
    expect(heading()).toBe('Configuração financeira — Candidatura recusada');
    expect(document.body.textContent).toMatch(/recusou a candidatura/);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar nova verificação' }));
    expect(screen.getByTestId('onboarding-path-new')).not.toBeNull();
    expect(screen.getByTestId('onboarding-path-existing')).not.toBeNull();
  });
});

describe('Configuração financeira — a Project that receives', () => {
  it('READY shows the Business and the settlement readiness', () => {
    open(setupFor('READY'));
    expect(container().getAttribute('data-state')).toBe('READY');
    expect(heading()).toBe('Configuração financeira — Pronto');
    expect(screen.getByTestId('business-card').textContent).toBe('Loja Kianda·@kianda·Verificado');
    expect(document.body.textContent).toContain('Prontidão para liquidação');
  });

  it('BLOCKED names each blocker precisely — fee classification is not KYB — and once', () => {
    const setup = setupFor('BLOCKED', 'OWNER', { blockers: ['FEE_DESTINATION_TYPE_NOT_ALLOWED', 'PRICING_NOT_CONFIGURED'] });
    setup.readiness = { ...READINESS, settlement: { ready: false, blockers: ['FEE_DESTINATION_TYPE_NOT_ALLOWED', 'PRICING_NOT_CONFIGURED'], warnings: [] } };
    open(setup);
    expect(heading()).toBe('Configuração financeira — Bloqueado');
    const list = screen.getByTestId('onboarding-blockers');
    expect(list.textContent).toContain('Receber taxas de aplicação requer aprovação do operador Banzami (classificação da conta).');
    expect(list.textContent).toContain('O Banzami ainda não atribuiu um preço ao negócio deste projeto.');
    expect(screen.getAllByRole('list', { name: 'Bloqueios' })).toHaveLength(1);
  });

  it('a sealed Project says its Business can no longer change', () => {
    const setup = setupFor('READY');
    setup.state = 'SEALED';
    setup.sealed = true;
    open(setup);
    expect(document.body.textContent).toMatch(/Destino fixado/);
  });
});

describe('who may act', () => {
  const STATES: OnboardingState[] = ['NOT_CONFIGURED', 'IN_REVIEW', 'INFORMATION_REQUIRED', 'APPROVED_PROVISIONING', 'REJECTED', 'READY', 'BLOCKED'];

  // Refreshing the state is reading it, not acting on the Project.
  const READ_ONLY_CONTROLS = new Set(['Atualizar estado']);

  for (const role of ['DEVELOPER', 'FINANCE', 'VIEWER']) {
    it.each(STATES)(`${role} sees %s with no action and no upload`, (state) => {
      open(setupFor(state, role));
      const actions = screen.queryAllByRole('button').map((b) => b.textContent ?? '').filter((n) => !READ_ONLY_CONTROLS.has(n));
      expect(actions).toEqual([]);
      expect(document.querySelectorAll('input[type="file"]').length).toBe(0);
    });
  }

  it('someone who may not act is told who can', () => {
    open(setupFor('NOT_CONFIGURED', 'DEVELOPER'));
    expect(screen.getByTestId('onboarding-read-only').textContent).toBe(
      'Só um Owner ou Admin do workspace pode iniciar a verificação. O seu papel neste workspace: Developer.',
    );
  });

  it('ADMIN may act like OWNER', () => {
    open(setupFor('NOT_CONFIGURED', 'ADMIN'));
    expect(screen.getByRole('button', { name: 'Iniciar verificação' })).not.toBeNull();
  });

  it('a deployment that cannot onboard offers nothing to anyone', () => {
    open({ ...setupFor('NOT_CONFIGURED'), state: 'UNAVAILABLE', can_configure: false });
    expect(container().getAttribute('data-state')).toBe('UNAVAILABLE');
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(document.body.textContent).toMatch(/Nada do que faça aqui pode alterar isso/);
  });
});
