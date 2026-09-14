import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BanzamiClient } from './client.js';

// Sandbox test data (ADR-060): the caller's Idempotency-Key identifies a top-up
// or a payment across separate calls, and the SDK sends it — never a fresh one.
const AUTH = '/v1/auth/token';
const isAuth = (u: unknown): boolean => String(u).includes(AUTH);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function stub(handler: (url: string, init: RequestInit) => Response): ReturnType<typeof vi.fn> {
  const f = vi.fn().mockImplementation((url: string, init: RequestInit = {}) =>
    Promise.resolve(isAuth(url) ? json(200, { token: 'jwt', expires_at: new Date(Date.now() + 3_600_000).toISOString() }) : handler(String(url), init)));
  vi.stubGlobal('fetch', f);
  return f;
}
const calls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter((c: unknown[]) => !isAuth(c[0])) as [string, RequestInit][];
const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

let client: BanzamiClient;
beforeEach(() => { client = new BanzamiClient({ baseUrl: 'https://api.test.ao', apiKey: 'bz_test_k', maxRetries: 2, retryDelay: 1 }); });

describe('Sandbox test payers', () => {
  it('funds with the caller\'s key', async () => {
    const f = stub(() => json(200, { id: 'tp1', balance_minor: 1500000 }));
    await client.fundTestPayer('tp1', { amountMinor: 500000, idempotencyKey: 'topup-1' });
    const [url, init] = calls(f)[0];
    expect(url).toBe('https://api.test.ao/v1/sandbox/test-payers/tp1/fund');
    expect(header(init, 'Idempotency-Key')).toBe('topup-1');
    expect(JSON.parse(init.body as string)).toEqual({ amount_minor: 500000 });
  });

  it('retries a simulated timeout with the SAME key and body, and returns the real result', async () => {
    let n = 0;
    const f = stub(() => (++n === 1
      ? json(504, { code: 'SANDBOX_SIMULATED_TIMEOUT', message: 'simulated', simulated: true })
      : json(200, { status: 'PAID', transfer_id: 'tr-1', via: 'LINK', simulated: false })));
    const r = await client.payAsTestPayer('tp1', { paymentSessionId: 'ps1', simulate: 'TIMEOUT', idempotencyKey: 'pay-1' });
    expect(r.transfer_id).toBe('tr-1');
    const sent = calls(f);
    expect(sent).toHaveLength(2);
    expect(sent.map(([, i]) => header(i, 'Idempotency-Key'))).toEqual(['pay-1', 'pay-1']);
    expect(sent[0][1].body).toBe(sent[1][1].body);
  });

  it('sends only the fields given', async () => {
    const f = stub(() => json(201, { id: 'tp1', pin: '123456' }));
    await client.createTestPayer({ label: 'Maria' });
    expect(JSON.parse(calls(f)[0][1].body as string)).toEqual({ label: 'Maria' });
    await client.listTestPayers({ includeRetired: true });
    expect(calls(f)[1][0]).toBe('https://api.test.ao/v1/sandbox/test-payers?include_retired=true');
  });

  it('sends a webhook test event to one endpoint', async () => {
    const f = stub(() => json(202, { event_id: 'e', delivery_id: 'd', type: 'webhook.test', synthetic: true, status: 'PENDING' }));
    const ev = await client.sendWebhookTestEvent('whep_1');
    expect(ev.synthetic).toBe(true);
    expect(calls(f)[0][0]).toBe('https://api.test.ao/v1/webhooks/endpoints/whep_1/test');
    expect(calls(f)[0][1].method).toBe('POST');
  });
});
