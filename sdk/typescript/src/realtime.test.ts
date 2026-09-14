import { describe, it, expect, vi } from 'vitest';
import { watchPaymentSessionStatus, type PaymentSessionStatus } from './realtime.js';
import { BanzamiConfigError } from './errors.js';

const snap = (status: string, terminal = false): PaymentSessionStatus => ({
  session_id: 'ps1', status, amount_minor: 5000, currency: 'AOA', expires_at: null, terminal, observed_at: '2026-09-14T00:00:00Z',
});
const sse = (frames: string[]) => new Response(new ReadableStream({
  start(c) { for (const f of frames) c.enqueue(new TextEncoder().encode(f)); c.close(); },
}), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const frame = (event: string, s: PaymentSessionStatus) => `event: ${event}\ndata: ${JSON.stringify(s)}\n\n`;

describe('watchPaymentSessionStatus', () => {
  it('refuses an API key: the page never holds one', () => {
    for (const token of ['bz_test_sk_XXXX', 'bz_live_sk_XXXX', 'eyJhbGciOi']) {
      expect(() => watchPaymentSessionStatus({ sessionId: 'ps1', token, onStatus: () => {} })).toThrow(BanzamiConfigError);
    }
  });

  it('sends the token in the Authorization header, never in the URL, and ends on a terminal status', async () => {
    const f = vi.fn().mockResolvedValue(sse(['retry: 3000\n\n', frame('snapshot', snap('ACTIVE')), ': heartbeat\n\n', frame('status', snap('PAID', true))]));
    const seen: string[] = [];
    const w = watchPaymentSessionStatus({ sessionId: 'ps1', token: 'bzst_abc.def', baseUrl: 'https://api.test.ao', fetch: f, onStatus: (s, k) => seen.push(`${k}:${s.status}`) });
    const end = await w.done;
    expect(end.reason).toBe('terminal');
    expect(seen).toEqual(['snapshot:ACTIVE', 'status:PAID']);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test.ao/v1/realtime/payment-sessions/ps1');
    expect(url).not.toContain('bzst_');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer bzst_abc.def');
  });

  it('reconnects after a dropped stream and starts again from a fresh snapshot', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(sse(['retry: 1\n\n', frame('snapshot', snap('ACTIVE'))]))
      .mockResolvedValueOnce(sse([frame('snapshot', snap('PAID', true))]));
    const seen: string[] = [];
    const end = await watchPaymentSessionStatus({ sessionId: 'ps1', token: 'bzst_x.y', fetch: f, onStatus: (s, k) => seen.push(`${k}:${s.status}`) }).done;
    expect(end.reason).toBe('terminal');
    expect(seen).toEqual(['snapshot:ACTIVE', 'snapshot:PAID']);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('stops on token expiry and on a refused token, without retrying', async () => {
    const expired = vi.fn().mockResolvedValue(sse([frame('snapshot', snap('ACTIVE')), 'event: expired\ndata: {"session_id":"ps1"}\n\n']));
    expect((await watchPaymentSessionStatus({ sessionId: 'ps1', token: 'bzst_x.y', fetch: expired, onStatus: () => {} }).done).reason).toBe('token_expired');
    const wrong = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'REALTIME_TOKEN_WRONG_RESOURCE', message: 'no' }), { status: 403 }));
    const end = await watchPaymentSessionStatus({ sessionId: 'ps1', token: 'bzst_x.y', fetch: wrong, onStatus: () => {} }).done;
    expect(end.reason).toBe('error');
    expect(wrong).toHaveBeenCalledTimes(1);
  });
});
