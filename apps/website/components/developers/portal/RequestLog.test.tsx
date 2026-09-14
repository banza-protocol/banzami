// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RequestLog } from './RequestLog';

// The API log names the error a failed request returned, linked to its entry in
// the error catalogue, beside method, path, status, latency and request_id.
const api = vi.hoisted(() => ({ listApiRequestLogs: vi.fn() }));
vi.mock('@/lib/developer-api', async (orig) => {
  const real = await orig<typeof import('@/lib/developer-api')>();
  return { ...real, developerApi: api };
});
vi.mock('./DeveloperData', () => ({
  useDeveloperData: () => ({ activeProject: { id: 'prj_1' }, csrf: 'c', onApiError: () => 'x' }),
}));

afterEach(cleanup);

describe('API logs', () => {
  it('shows the error code of a failed request, linked to the catalogue', async () => {
    api.listApiRequestLogs.mockResolvedValue({
      logs: [
        { id: 'l1', method: 'POST', path: '/v1/refunds', status: 422, request_id: 'req_1', latency_ms: 41, error_code: 'REFUND_EXCEEDS_CAPTURED', environment: 'SANDBOX', created_at: '2026-09-14T10:00:00Z', source: 'API' },
        { id: 'l2', method: 'GET', path: '/v1/me', status: 200, request_id: 'req_2', latency_ms: 12, environment: 'SANDBOX', created_at: '2026-09-14T10:00:01Z', source: 'API' },
      ],
      summary: { total: 2, errors: 1 },
      retention_days: 30,
    });
    render(<RequestLog />);
    const code = await screen.findByTestId('log-error-code');
    expect(code.textContent).toBe('REFUND_EXCEEDS_CAPTURED');
    expect(code.getAttribute('href')).toBe('/docs/errors#error-REFUND_EXCEEDS_CAPTURED');
    expect(screen.getAllByTestId('log-error-code')).toHaveLength(1);
    expect(screen.getByText('41 ms')).toBeTruthy();
    expect(screen.getByText('req_1')).toBeTruthy();
  });
});
