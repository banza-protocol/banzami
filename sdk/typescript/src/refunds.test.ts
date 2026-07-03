import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BanzamiClient } from './client.js';

// The refund surface always names a TYPED source explicitly (BANZA ADR-030):
// the SDK never sends a bare transaction_id and never infers a source type.
const AUTH = '/v1/auth/token';
const isAuth = (u: unknown): boolean => String(u).includes(AUTH);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function tokenBody(): unknown {
  return { token: 'jwt', expires_at: new Date(Date.now() + 3_600_000).toISOString(), token_type: 'Bearer', environment: 'sandbox' };
}
function stubFetch(handler: (url: string, init: RequestInit) => Response): void {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init: RequestInit = {}) =>
    Promise.resolve(isAuth(url) ? jsonResponse(200, tokenBody()) : handler(String(url), init))));
}
function lastBody(): Record<string, unknown> {
  const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) => !isAuth(c[0]));
  const init = calls[calls.length - 1][1] as RequestInit;
  return JSON.parse(init.body as string);
}

let client: BanzamiClient;
beforeEach(() => {
  client = new BanzamiClient({ baseUrl: 'https://api.test.ao', apiKey: 'bz_test_k' });
});

describe('createRefund — typed source (ADR-030)', () => {
  it('posts an explicit WALLET_PAYMENT source with currency, never a transaction_id', async () => {
    stubFetch(() => jsonResponse(201, {
      id: 'r1', source_type: 'WALLET_PAYMENT', source_id: 'wp-1', merchant_id: 'm1',
      consumer_id: 'c1', amount_minor: 250, currency: 'AOA', status: 'SUCCEEDED',
      created_at: '2026-07-03T00:00:00Z', updated_at: '2026-07-03T00:00:00Z',
    }));
    const r = await client.createRefund({ source_type: 'WALLET_PAYMENT', source_id: 'wp-1', amount_minor: 250, currency: 'AOA', idempotency_key: 'k1' });
    expect(r.source_type).toBe('WALLET_PAYMENT');
    expect(r.source_id).toBe('wp-1');
    const body = lastBody();
    expect(body.source_type).toBe('WALLET_PAYMENT');
    expect(body.source_id).toBe('wp-1');
    expect(body.currency).toBe('AOA');
    expect(body.amount_minor).toBe(250);
    expect(body.idempotency_key).toBe('k1');
    expect('transaction_id' in body).toBe(false);
  });

  it('sends ACQUIRING_PAYMENT and auto-generates an idempotency key when omitted', async () => {
    stubFetch(() => jsonResponse(201, {
      id: 'r2', source_type: 'ACQUIRING_PAYMENT', source_id: 'tx-1', transaction_id: 'tx-1',
      merchant_id: 'm1', amount_minor: 100, currency: 'AOA', status: 'SUCCEEDED',
      created_at: '2026-07-03T00:00:00Z', updated_at: '2026-07-03T00:00:00Z',
    }));
    await client.createRefund({ source_type: 'ACQUIRING_PAYMENT', source_id: 'tx-1', amount_minor: 100, currency: 'AOA' });
    const body = lastBody();
    expect(body.source_type).toBe('ACQUIRING_PAYMENT');
    expect(body.source_id).toBe('tx-1');
    expect(typeof body.idempotency_key).toBe('string');
    expect((body.idempotency_key as string).length).toBeGreaterThan(0);
  });
});
