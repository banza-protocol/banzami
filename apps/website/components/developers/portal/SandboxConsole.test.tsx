// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ApiExplorer } from './ApiExplorer';
import { TestData } from './TestData';
import { EnvironmentCards } from './EnvironmentCards';

/**
 * The self-service Sandbox screens (ADR-060): the API Explorer and Dados de
 * teste run the published API through developer-api's broker — no key is ever
 * held, typed or shown in the browser — and the reset is typed.
 */

const api = vi.hoisted(() => ({
  explorerOperations: vi.fn(),
  runExplorerRequest: vi.fn(),
  resetSandbox: vi.fn(),
}));
vi.mock('@/lib/developer-api', async (orig) => {
  const real = await orig<typeof import('@/lib/developer-api')>();
  return { ...real, developerApi: api };
});
vi.mock('./DeveloperData', () => ({
  useDeveloperData: () => ({ activeProject: { id: 'prj_1', name: 'Loja' }, csrf: 'csrf', onApiError: () => 'erro' }),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const OPS = [
  { operation_id: 'getMe', tag: 'identity', summary: 'Who am I', method: 'GET', path: '/v1/me', scope: 'identity:read', path_params: [], query_params: [], idempotency: false, idempotency_required: false, body: false, example_body: null },
  { operation_id: 'getPaymentSession', tag: 'payment-sessions', summary: 'Fetch a payment session', method: 'GET', path: '/v1/payment-sessions/{id}', scope: 'payment_sessions:read', path_params: [{ name: 'id', example: 'payment_session_xxx' }], query_params: [], idempotency: false, idempotency_required: false, body: false, example_body: null },
];

describe('API Explorer', () => {
  it('runs an operation through the broker with no key field, and shows the answer', async () => {
    api.explorerOperations.mockResolvedValue({ spec_version: 'x', key_ttl_seconds: 60, operations: OPS });
    api.runExplorerRequest.mockResolvedValue({ operation_id: 'getMe', method: 'GET', path: '/v1/me', status: 200, request_id: 'abc123', latency_ms: 42, headers: {}, body: { environment: 'SANDBOX' } });
    render(<ApiExplorer />);
    fireEvent.click(await screen.findByTestId('op-getMe'));
    expect(document.body.textContent).not.toMatch(/bz_test_sk_|chave secreta:/i);
    expect(screen.queryByLabelText(/api key|chave de api/i)).toBeNull();
    fireEvent.click(screen.getByTestId('explorer-send'));
    await waitFor(() => expect(api.runExplorerRequest).toHaveBeenCalledWith('prj_1', expect.objectContaining({ operation_id: 'getMe' }), 'csrf'));
    expect((await screen.findByTestId('explorer-response')).textContent).toContain('SANDBOX');
  });

  it('offers a realtime watch when a session read carries a status token', async () => {
    api.explorerOperations.mockResolvedValue({ spec_version: 'x', key_ttl_seconds: 60, operations: OPS });
    api.runExplorerRequest.mockResolvedValue({
      operation_id: 'getPaymentSession', method: 'GET', path: '/v1/payment-sessions/ps1', status: 200, request_id: 'r', latency_ms: 5, headers: {},
      body: { session_id: 'ps1', status: 'ACTIVE', realtime: { token: 'bzst_a.b', expires_at: 'x', path: '/v1/realtime/payment-sessions/ps1' } },
    });
    render(<ApiExplorer />);
    fireEvent.click(await screen.findByTestId('op-getPaymentSession'));
    fireEvent.change(screen.getByPlaceholderText('payment_session_xxx'), { target: { value: 'ps1' } });
    fireEvent.click(screen.getByTestId('explorer-send'));
    expect(await screen.findByTestId('explorer-watch')).toBeTruthy();
  });
});

describe('Dados de teste', () => {
  it('lists payers and scenarios through the broker, and the reset needs RESET typed', async () => {
    api.runExplorerRequest.mockImplementation(async (_p: string, req: { operation_id: string }) => {
      if (req.operation_id === 'listTestPayers') return { status: 200, headers: {}, body: { data: [{ id: 'tp1', handle: 'tpabc', label: 'Maria', status: 'ACTIVE', balance_minor: 1000000, currency: 'AOA', created_at: 'x', retired_at: null }] } };
      if (req.operation_id === 'listSandboxScenarios') return { status: 200, headers: {}, body: { scenarios: [{ id: 'PAYMENT_DECLINED', group: 'payments', simulated: true, goal: { pt: 'Uma recusa' }, trigger: { pt: 'simulate DECLINED' }, result: { pt: '402' } }] } };
      return { status: 500, headers: {} };
    });
    api.resetSandbox.mockResolvedValue({ test_payers_retired: 1, business_reset: true, payment_sessions_cancelled: 0, payment_links_cancelled: 0, accounts_closed: 0, retired_minor: 1000000 });
    render(<TestData />);
    expect(await screen.findByText('@tpabc')).toBeTruthy();
    expect(screen.getByText('10 000 Kz')).toBeTruthy();
    expect(screen.getByText('PAYMENT_DECLINED · simulado')).toBeTruthy();

    const go = screen.getByTestId('reset-go') as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Escreva RESET para confirmar'), { target: { value: 'reset' } });
    expect(go.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Escreva RESET para confirmar'), { target: { value: 'RESET' } });
    fireEvent.click(go);
    await waitFor(() => expect(api.resetSandbox).toHaveBeenCalledWith('prj_1', 'csrf'));
    expect((await screen.findByTestId('reset-result')).textContent).toContain('1 pagador');
  });
});

describe('Environment cards', () => {
  it('Sandbox available; Live unavailable behind institutional approval — never "coming soon"', () => {
    render(<EnvironmentCards />);
    expect(screen.getByTestId('environment-sandbox').textContent).toContain('Disponível');
    const live = screen.getByTestId('environment-live').textContent ?? '';
    expect(live).toContain('Indisponível');
    expect(live).toContain('aprovação institucional');
    expect(document.body.textContent).not.toMatch(/em breve|coming soon/i);
  });
});
