import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BanzaClient, BanzaError } from '../src/client.js';

const BASE = 'https://api.banzami.com';
const KEY  = 'bz_test_key';

function makeClient(): BanzaClient {
  return new BanzaClient({ gatewayUrl: BASE, apiKey: KEY });
}

// retryDelay=0 so retry tests complete instantly in CI
function makeRetryClient(): BanzaClient {
  return new BanzaClient({ gatewayUrl: BASE, apiKey: KEY, retryDelay: 0 });
}

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok:   status < 400,
    status,
    json: async () => body,
  }));
}

function fetchMock(): ReturnType<typeof vi.fn> {
  return (globalThis as any).fetch as ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Payment Links
// ---------------------------------------------------------------------------

describe('createPaymentLink', () => {
  it('POSTs to /v1/payment-links and returns the link', async () => {
    const link = { id: 'pl_1', slug: 'abc', status: 'ACTIVE' };
    mockFetch(200, link);

    const client = makeClient();
    const result = await client.createPaymentLink({
      merchant_id:  'm_1',
      wallet_id:    'w_1',
      amount_minor: 50000,
      currency:     'AOA',
    });

    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/payment-links`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({ merchant_id: 'm_1', amount_minor: 50000 });
    expect(result).toEqual(link);
  });
});

describe('listPaymentLinks', () => {
  it('builds the correct query string', async () => {
    mockFetch(200, { items: [], next_cursor: null });

    const client = makeClient();
    await client.listPaymentLinks('m_1', 10, 'cursor_xyz');

    const [url] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toContain('merchant_id=m_1');
    expect(url).toContain('limit=10');
    expect(url).toContain('cursor=cursor_xyz');
  });
});

describe('cancelPaymentLink', () => {
  it('POSTs to /v1/payment-links/{id}/cancel', async () => {
    const link = { id: 'pl_1', status: 'CANCELLED' };
    mockFetch(200, link);

    const client = makeClient();
    const result = await client.cancelPaymentLink('pl_1');

    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/payment-links/pl_1/cancel`);
    expect(init.method).toBe('POST');
    expect(result).toEqual(link);
  });
});

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

describe('createTransaction', () => {
  it('POSTs to /v1/transactions and returns the transaction', async () => {
    const tx = { id: 'tx_1', status: 'COMPLETED', amount_minor: 10000 };
    mockFetch(200, tx);

    const client = makeClient();
    const result = await client.createTransaction({
      wallet_id:    'w_1',
      amount_minor: 10000,
      currency:     'AOA',
    });

    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/transactions`);
    expect(init.method).toBe('POST');
    expect(result).toEqual(tx);
  });

  it('throws BanzaError with isInsufficientFunds on 422 INSUFFICIENT_FUNDS', async () => {
    mockFetch(422, { error: { message: 'Not enough funds', code: 'INSUFFICIENT_FUNDS' } });

    const client = makeClient();
    await expect(
      client.createTransaction({ wallet_id: 'w_1', amount_minor: 9999999, currency: 'AOA' }),
    ).rejects.toSatisfy((e: unknown) => e instanceof BanzaError && e.isInsufficientFunds);
  });
});

describe('listTransactions', () => {
  it('includes cursor param when provided', async () => {
    mockFetch(200, { items: [], next_cursor: null });

    const client = makeClient();
    await client.listTransactions('m_1', 5, 'next_page');

    const [url] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toContain('cursor=next_page');
    expect(url).toContain('limit=5');
  });
});

describe('getTransaction', () => {
  it('throws BanzaError with isNotFound on 404', async () => {
    mockFetch(404, { error: { message: 'Not found', code: 'NOT_FOUND' } });

    const client = makeClient();
    await expect(client.getTransaction('tx_missing')).rejects.toSatisfy(
      (e: unknown) => e instanceof BanzaError && e.isNotFound,
    );
  });
});

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

describe('provisionWallet', () => {
  it('POSTs to /v1/wallets and returns the wallet', async () => {
    const wallet = { id: 'wal_1', merchant_id: 'm_1', currency: 'AOA', status: 'ACTIVE', created_at: '2026-01-01T00:00:00Z' };
    mockFetch(200, wallet);

    const client = makeClient();
    const result = await client.provisionWallet({ merchant_id: 'm_1', currency: 'AOA' });

    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/wallets`);
    expect(init.method).toBe('POST');
    expect(result).toEqual(wallet);
  });
});

describe('getWalletBalance', () => {
  it('GETs /v1/wallets/{id}/balance', async () => {
    const balance = { wallet_id: 'wal_1', available_minor: 50000, reserved_minor: 0, total_minor: 50000, currency: 'AOA' };
    mockFetch(200, balance);

    const client = makeClient();
    const result = await client.getWalletBalance('wal_1');

    const [url] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/wallets/wal_1/balance`);
    expect(result).toEqual(balance);
  });
});

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

describe('createPayout', () => {
  it('POSTs to /v1/payouts and returns the payout', async () => {
    const payout = { id: 'po_1', status: 'PENDING', amount_minor: 25000 };
    mockFetch(200, payout);

    const client = makeClient();
    const result = await client.createPayout({
      wallet_id:                'wal_1',
      amount_minor:             25000,
      currency:                 'AOA',
      destination_bank_account: 'IBAN123',
      idempotency_key:          'idem_1',
    });

    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/payouts`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({ idempotency_key: 'idem_1' });
    expect(result).toEqual(payout);
  });
});

describe('listPayouts', () => {
  it('GETs /v1/payouts with merchant_id query param', async () => {
    mockFetch(200, { items: [], next_cursor: null });

    const client = makeClient();
    await client.listPayouts('m_1', 15);

    const [url] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/payouts');
    expect(url).toContain('merchant_id=m_1');
    expect(url).toContain('limit=15');
  });
});

describe('getPayout', () => {
  it('GETs /v1/payouts/{id}', async () => {
    const payout = { id: 'po_1', status: 'COMPLETED' };
    mockFetch(200, payout);

    const client = makeClient();
    const result = await client.getPayout('po_1');

    const [url] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/payouts/po_1`);
    expect(result).toEqual(payout);
  });
});

// ---------------------------------------------------------------------------
// Merchants
// ---------------------------------------------------------------------------

describe('getMerchant', () => {
  it('GETs /v1/merchants/{id}', async () => {
    const merchant = { id: 'm_1', name: 'Acme', email: 'acme@example.com', status: 'ACTIVE', created_at: '2026-01-01T00:00:00Z' };
    mockFetch(200, merchant);

    const client = makeClient();
    const result = await client.getMerchant('m_1');

    const [url] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/merchants/m_1`);
    expect(result).toEqual(merchant);
  });
});

// ---------------------------------------------------------------------------
// Public (unauthenticated)
// ---------------------------------------------------------------------------

describe('resolvePaymentLink', () => {
  it('GETs /v1/public/pay/{slug} without Authorization header', async () => {
    const link = { id: 'pl_1', slug: 'my-link', status: 'ACTIVE' };
    mockFetch(200, link);

    const client = makeClient();
    const result = await client.resolvePaymentLink('my-link');

    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/public/pay/my-link`);
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
    expect(result).toEqual(link);
  });
});

// ---------------------------------------------------------------------------
// BanzaClient.verifyWebhook
// ---------------------------------------------------------------------------

describe('BanzaClient.verifyWebhook', () => {
  const secret = 'test_webhook_secret';
  const body   = Buffer.from('{"type":"payment_link.used"}');

  it('returns true for a valid signature', () => {
    // Compute expected signature the same way the SDK does
    const { createHmac } = require('node:crypto');
    const sig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
    expect(BanzaClient.verifyWebhook(body, sig, secret)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(BanzaClient.verifyWebhook(body, 'sha256=badhash', secret)).toBe(false);
  });

  it('returns false for an empty signature', () => {
    expect(BanzaClient.verifyWebhook(body, '', secret)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BanzaClient.formatAmount
// ---------------------------------------------------------------------------

describe('BanzaClient.formatAmount', () => {
  it('formats AOA amounts with Kz suffix', () => {
    const result = BanzaClient.formatAmount(50000, 'AOA');
    expect(result).toContain('Kz');
    expect(result).toContain('50');
  });

  it('formats USD amounts using Intl currency format', () => {
    const result = BanzaClient.formatAmount(1000, 'USD');
    // 1000 minor units = $10.00
    expect(result).toContain('10');
    expect(result).not.toContain('Kz');
  });
});

// ---------------------------------------------------------------------------
// BanzaClient.toMinorUnits
// ---------------------------------------------------------------------------

describe('BanzaClient.toMinorUnits', () => {
  it('returns the integer for AOA (no cent subdivision)', () => {
    expect(BanzaClient.toMinorUnits(1500, 'AOA')).toBe(1500);
  });

  it('multiplies by 100 for USD', () => {
    expect(BanzaClient.toMinorUnits(9.99, 'USD')).toBe(999);
  });
});

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

describe('retry logic', () => {
  it('retries on 503 and succeeds on third attempt', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      callCount++;
      if (callCount <= 2) {
        return { ok: false, status: 503, json: async () => ({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Overload' } }) };
      }
      return { ok: true, status: 200, json: async () => ({ id: 'tx_1' }) };
    }));

    const client = makeRetryClient();
    const result = await client.createTransaction({ wallet_id: 'w_1', amount_minor: 100, currency: 'AOA' });

    expect(callCount).toBe(3);
    expect((result as any).id).toBe('tx_1');
  });

  it('does not retry on 422', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      callCount++;
      return { ok: false, status: 422, json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Bad input' } }) };
    }));

    const client = makeRetryClient();
    await expect(
      client.createTransaction({ wallet_id: 'w_1', amount_minor: 100, currency: 'AOA' }),
    ).rejects.toBeInstanceOf(BanzaError);

    expect(callCount).toBe(1);
  });

  it('uses same idempotency key on all retry attempts', async () => {
    const capturedKeys: string[] = [];
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      callCount++;
      const key = (init?.headers as Record<string, string>)?.['Idempotency-Key'];
      if (key) capturedKeys.push(key);
      if (callCount <= 2) {
        return { ok: false, status: 503, json: async () => ({ error: { code: 'E', message: 'M' } }) };
      }
      return { ok: true, status: 200, json: async () => ({ id: 'tx_1' }) };
    }));

    const client = makeRetryClient();
    await client.createTransaction({ wallet_id: 'w_1', amount_minor: 100, currency: 'AOA' });

    expect(capturedKeys).toHaveLength(3);
    // All retry attempts must carry the same idempotency key so the server
    // can safely deduplicate the operation.
    expect(capturedKeys[0]).toBe(capturedKeys[1]);
    expect(capturedKeys[0]).toBe(capturedKeys[2]);
    expect(capturedKeys[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('GET requests have no Idempotency-Key header', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const key = (init?.headers as Record<string, string>)?.['Idempotency-Key'];
      expect(key).toBeUndefined();
      return { ok: true, status: 200, json: async () => ({ wallet_id: 'wal_1', available_minor: 1000, reserved_minor: 0, total_minor: 1000, currency: 'AOA' }) };
    }));

    const client = makeClient();
    await client.getWalletBalance('wal_1');
  });
});
