import { describe, expect, it, vi } from 'vitest';
import { parseFrames, watchStatus, type RealtimeStatus } from './realtime-status';

const snap = (status: string, terminal = false): RealtimeStatus => ({
  session_id: 'ps1', status, amount_minor: 5000, currency: 'AOA', expires_at: null, terminal, observed_at: 'x',
});
const stream = (chunks: string[]) => new Response(new ReadableStream({
  start(c) { for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch)); c.close(); },
}), { status: 200 });

describe('Console realtime status', () => {
  it('parses frames split across chunks, skipping heartbeats', () => {
    const a = parseFrames('retry: 3000\n\n: heartbeat\n\nevent: snap');
    expect(a.frames.map((f) => f.retry ?? f.event)).toEqual([3000, 'message']);
    const b = parseFrames(`${a.rest}shot\ndata: {"status":"ACTIVE"}\n\n`);
    expect(b.frames[0]).toMatchObject({ event: 'snapshot', data: '{"status":"ACTIVE"}' });
  });

  it('sends the token only in the Authorization header and stops at a terminal status', async () => {
    const f = vi.fn().mockResolvedValue(stream([
      `event: snapshot\ndata: ${JSON.stringify(snap('ACTIVE'))}\n\n`,
      `event: status\ndata: ${JSON.stringify(snap('PAID', true))}\n\n`,
    ]));
    const seen: string[] = [];
    const reason = await new Promise<string>((resolve) => {
      watchStatus({ sessionId: 'ps1', token: 'bzst_a.b', fetchImpl: f, onStatus: (s) => seen.push(s.status), onEnd: resolve });
    });
    expect(reason).toBe('terminal');
    expect(seen).toEqual(['ACTIVE', 'PAID']);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('bzst_');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer bzst_a.b');
  });

  it('refuses anything that is not a status token', async () => {
    const f = vi.fn();
    const reason = await new Promise<string>((resolve) => {
      watchStatus({ sessionId: 'ps1', token: 'bz_test_sk_XXXX', fetchImpl: f, onStatus: () => {}, onEnd: resolve });
    });
    expect(reason).toBe('error');
    expect(f).not.toHaveBeenCalled();
  });
});
