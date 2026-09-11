import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BanzamiClient } from './client.js';

// A1-05: a dispute names no consumer the caller asserts. The SDK no longer
// sends consumer_id (still accepted, deprecated, in the params) and reads the
// null the API answers for disputes opened today.
const AUTH = '/v1/auth/token';
const isAuth = (u: unknown): boolean => String(u).includes(AUTH);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function tokenBody(): unknown {
  return { token: 'jwt', expires_at: new Date(Date.now() + 3_600_000).toISOString(), token_type: 'Bearer', environment: 'sandbox' };
}

let client: BanzamiClient;
beforeEach(() => {
  client = new BanzamiClient({ baseUrl: 'https://api.test.ao', apiKey: 'bz_test_k' });
});

describe('openDispute', () => {
  it('sends no consumer_id and reads a null one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) =>
      Promise.resolve(isAuth(url) ? jsonResponse(200, tokenBody()) : jsonResponse(201, {
        id: 'd1', transaction_id: 't1', merchant_id: 'm1', consumer_id: null, amount_minor: 250,
        currency: 'AOA', reason: 'r', status: 'OPEN', created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z',
      }))));
    const d = await client.openDispute({ transaction_id: 't1', consumer_id: 'someone', amount_minor: 250, currency: 'AOA', reason: 'r' });
    expect(d.consumer_id).toBeNull();
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) => !isAuth(c[0]));
    const body = JSON.parse((calls[calls.length - 1][1] as RequestInit).body as string);
    expect(body).not.toHaveProperty('consumer_id');
  });
});
