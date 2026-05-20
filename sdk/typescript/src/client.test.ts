import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BanzaClient } from './client.js';
import { BanzaApiError } from './errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(status: number, body: unknown): void {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

function lastFetchCall(): { url: string; init: RequestInit } {
  const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
  const [url, init] = calls[calls.length - 1];
  return { url, init };
}

let client: BanzaClient;

beforeEach(() => {
  client = new BanzaClient({ baseUrl: 'https://api.test.ao', apiKey: 'bz_live_testkey' });
});

// ---------------------------------------------------------------------------
// Authorization header
// ---------------------------------------------------------------------------

describe('authorization', () => {
  it('sends Bearer token on every request', async () => {
    mockFetch(200, { id: '1' });
    await client.getTransaction('1');
    const { init } = lastFetchCall();
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer bz_live_testkey');
  });

  it('throws BanzaApiError on 4xx', async () => {
    mockFetch(404, { code: 'NOT_FOUND', message: 'not found' });
    await expect(client.getTransaction('missing')).rejects.toBeInstanceOf(BanzaApiError);
  });

  it('BanzaApiError carries status and code', async () => {
    mockFetch(422, { code: 'INVALID_AMOUNT', message: 'amount must be positive' });
    const err = await client.getTransaction('x').catch((e) => e) as BanzaApiError;
    expect(err.status).toBe(422);
    expect(err.code).toBe('INVALID_AMOUNT');
  });
});

// ---------------------------------------------------------------------------
// createTransaction
// ---------------------------------------------------------------------------

describe('createTransaction', () => {
  const tx = {
    id: 'tx-1', merchant_id: 'm-1', amount_minor: 5000, currency: 'AOA',
    status: 'PENDING', created_at: '', updated_at: '',
  };

  it('POSTs to /v1/transactions', async () => {
    mockFetch(201, tx);
    await client.createTransaction({ idempotencyKey: 'ik-1', amountMinor: 5000 });
    const { url, init } = lastFetchCall();
    expect(url).toBe('https://api.test.ao/v1/transactions');
    expect(init.method).toBe('POST');
  });

  it('sends idempotency_key and amount_minor in body', async () => {
    mockFetch(201, tx);
    await client.createTransaction({ idempotencyKey: 'ik-2', amountMinor: 1000 });
    const body = JSON.parse(lastFetchCall().init.body as string);
    expect(body.idempotency_key).toBe('ik-2');
    expect(body.amount_minor).toBe(1000);
  });

  it('defaults currency to AOA and transaction_type to payment', async () => {
    mockFetch(201, tx);
    await client.createTransaction({ idempotencyKey: 'ik-3', amountMinor: 500 });
    const body = JSON.parse(lastFetchCall().init.body as string);
    expect(body.currency).toBe('AOA');
    expect(body.transaction_type).toBe('payment');
  });

  it('passes optional fields through', async () => {
    mockFetch(201, tx);
    await client.createTransaction({
      idempotencyKey:   'ik-4',
      amountMinor:      2000,
      currency:         'USD',
      description:      'test payment',
      walletId:         'w-1',
      transactionType:  'top_up',
    });
    const body = JSON.parse(lastFetchCall().init.body as string);
    expect(body.currency).toBe('USD');
    expect(body.description).toBe('test payment');
    expect(body.wallet_id).toBe('w-1');
    expect(body.transaction_type).toBe('top_up');
  });
});

// ---------------------------------------------------------------------------
// Payment links
// ---------------------------------------------------------------------------

describe('createPaymentLink', () => {
  const link = {
    id: 'pl-1', slug: 'abc123', merchant_id: 'm-1', wallet_id: 'w-1',
    currency: 'AOA', status: 'ACTIVE', created_at: '', updated_at: '',
  };

  it('POSTs to /v1/payment-links', async () => {
    mockFetch(201, link);
    await client.createPaymentLink({ merchantId: 'm-1', walletId: 'w-1' });
    const { url, init } = lastFetchCall();
    expect(url).toBe('https://api.test.ao/v1/payment-links');
    expect(init.method).toBe('POST');
  });

  it('sends merchant_id and wallet_id', async () => {
    mockFetch(201, link);
    await client.createPaymentLink({ merchantId: 'm-1', walletId: 'w-1' });
    const body = JSON.parse(lastFetchCall().init.body as string);
    expect(body.merchant_id).toBe('m-1');
    expect(body.wallet_id).toBe('w-1');
  });

  it('defaults currency to AOA', async () => {
    mockFetch(201, link);
    await client.createPaymentLink({ merchantId: 'm-1', walletId: 'w-1' });
    const body = JSON.parse(lastFetchCall().init.body as string);
    expect(body.currency).toBe('AOA');
  });

  it('serialises expiresAt as ISO string', async () => {
    mockFetch(201, link);
    const date = new Date('2026-12-31T00:00:00Z');
    await client.createPaymentLink({ merchantId: 'm-1', walletId: 'w-1', expiresAt: date });
    const body = JSON.parse(lastFetchCall().init.body as string);
    expect(body.expires_at).toBe('2026-12-31T00:00:00.000Z');
  });
});

describe('listPaymentLinks', () => {
  it('GETs /v1/payment-links with merchant_id query param', async () => {
    mockFetch(200, { data: [], next_cursor: undefined });
    await client.listPaymentLinks({ merchantId: 'm-1', limit: 10 });
    const { url } = lastFetchCall();
    expect(url).toContain('/v1/payment-links');
    expect(url).toContain('merchant_id=m-1');
    expect(url).toContain('limit=10');
  });
});

describe('getPaymentLink', () => {
  it('GETs /v1/payment-links/{id}', async () => {
    mockFetch(200, { id: 'pl-1' });
    await client.getPaymentLink('pl-1');
    expect(lastFetchCall().url).toBe('https://api.test.ao/v1/payment-links/pl-1');
  });
});

describe('cancelPaymentLink', () => {
  it('DELETEs /v1/payment-links/{id}', async () => {
    mockFetch(200, { id: 'pl-1', status: 'CANCELLED' });
    await client.cancelPaymentLink('pl-1');
    const { url, init } = lastFetchCall();
    expect(url).toBe('https://api.test.ao/v1/payment-links/pl-1');
    expect(init.method).toBe('DELETE');
  });
});

describe('getPublicPaymentLink', () => {
  it('GETs /v1/public/pay/{slug}', async () => {
    mockFetch(200, { id: 'pl-1', slug: 'abc123' });
    await client.getPublicPaymentLink('abc123');
    expect(lastFetchCall().url).toBe('https://api.test.ao/v1/public/pay/abc123');
  });
});

describe('getPaymentLinkStatus', () => {
  it('GETs /v1/public/pay/{slug}/status', async () => {
    mockFetch(200, { paid: true });
    const result = await client.getPaymentLinkStatus('abc123');
    expect(result.paid).toBe(true);
    expect(lastFetchCall().url).toBe('https://api.test.ao/v1/public/pay/abc123/status');
  });
});

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

describe('retry', () => {
  it('retries on 503 and succeeds on third attempt', async () => {
    const tx = { id: 'tx-1', merchant_id: 'm-1', amount_minor: 5000, currency: 'AOA', status: 'PENDING', created_at: '', updated_at: '' };
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.resolve(new Response(JSON.stringify({ code: 'OVERLOAD', message: 'overload' }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
      }
      return Promise.resolve(new Response(JSON.stringify(tx), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }));

    const retryClient = new BanzaClient({ baseUrl: 'https://api.test.ao', apiKey: 'bz_live_testkey', maxRetries: 3, retryDelay: 0 });
    const result = await retryClient.createTransaction({ idempotencyKey: 'ik-retry', amountMinor: 5000 });
    expect(result.id).toBe('tx-1');
    expect(callCount).toBe(3);
  });

  it('does not retry on 422', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(new Response(JSON.stringify({ code: 'INVALID_AMOUNT', message: 'bad amount' }), { status: 422, headers: { 'Content-Type': 'application/json' } }));
    }));

    const retryClient = new BanzaClient({ baseUrl: 'https://api.test.ao', apiKey: 'bz_live_testkey', maxRetries: 3, retryDelay: 0 });
    await expect(retryClient.createTransaction({ idempotencyKey: 'ik-no-retry', amountMinor: -1 })).rejects.toBeInstanceOf(BanzaApiError);
    expect(callCount).toBe(1);
  });

  it('uses the same idempotency key on all retries', async () => {
    const tx = { id: 'tx-2', merchant_id: 'm-1', amount_minor: 1000, currency: 'AOA', status: 'PENDING', created_at: '', updated_at: '' };
    const capturedKeys: string[] = [];
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      callCount++;
      const headers = init.headers as Record<string, string>;
      if (headers['Idempotency-Key']) capturedKeys.push(headers['Idempotency-Key']);
      if (callCount <= 2) {
        return Promise.resolve(new Response(JSON.stringify({ code: 'OVERLOAD', message: 'overload' }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
      }
      return Promise.resolve(new Response(JSON.stringify(tx), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }));

    const retryClient = new BanzaClient({ baseUrl: 'https://api.test.ao', apiKey: 'bz_live_testkey', maxRetries: 3, retryDelay: 0 });
    await retryClient.createTransaction({ idempotencyKey: 'ik-idempotent', amountMinor: 1000 });
    expect(capturedKeys.length).toBe(3);
    expect(capturedKeys.every(k => k === capturedKeys[0])).toBe(true);
  });
});
