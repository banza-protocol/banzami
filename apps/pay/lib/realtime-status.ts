// Watching a Payment Session's status from the hosted payment page (ADR-060 §9).
//
// The same protocol @banzami/sdk/realtime speaks, for pay.banzami.com: a payer on
// one device sees a QR paid from another. The session's short-lived status token
// goes in the Authorization header of a
// fetch stream — never in the URL, which the API refuses — and a dropped stream
// reconnects from a fresh snapshot. The token is not a key; it opens one
// session's public status for at most 30 minutes.

export type RealtimeStatus = {
  session_id: string;
  status: string;
  amount_minor: number | null;
  currency: string;
  expires_at: string | null;
  terminal: boolean;
  observed_at: string;
};

export type RealtimeEnd = 'terminal' | 'token_expired' | 'closed' | 'error';

export const SANDBOX_API = 'https://sandbox-api.banzami.com';

/** Parse complete SSE frames out of a buffer; returns the frames and what is left. */
export function parseFrames(buffer: string): { frames: { event: string; data: string; retry?: number }[]; rest: string } {
  const frames: { event: string; data: string; retry?: number }[] = [];
  let rest = buffer;
  let cut: number;
  while ((cut = rest.indexOf('\n\n')) >= 0) {
    const raw = rest.slice(0, cut);
    rest = rest.slice(cut + 2);
    let event = 'message';
    const data: string[] = [];
    let retry: number | undefined;
    for (const line of raw.split('\n')) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('retry:')) retry = Number(line.slice(6).trim()) || undefined;
      else if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    frames.push({ event, data: data.join('\n'), retry });
  }
  return { frames, rest };
}

export function watchStatus(opts: {
  sessionId: string;
  token: string;
  baseUrl?: string;
  onStatus: (s: RealtimeStatus, kind: 'snapshot' | 'status') => void;
  onEnd: (reason: RealtimeEnd, detail?: string) => void;
  fetchImpl?: typeof fetch;
}): () => void {
  if (!opts.token.startsWith('bzst_')) {
    opts.onEnd('error', 'not a status token');
    return () => {};
  }
  const controller = new AbortController();
  let ended = false;
  const end = (r: RealtimeEnd, d?: string) => { if (!ended) { ended = true; controller.abort(); opts.onEnd(r, d); } };
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${(opts.baseUrl ?? SANDBOX_API).replace(/\/$/, '')}/v1/realtime/payment-sessions/${encodeURIComponent(opts.sessionId)}`;

  void (async () => {
    let failures = 0;
    let retry = 3000;
    while (!ended) {
      try {
        const res = await doFetch(url, {
          headers: { Authorization: `Bearer ${opts.token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!res.ok || !res.body) {
          let code = '';
          try { code = ((await res.json()) as { code?: string }).code ?? ''; } catch { /* not JSON */ }
          if (code === 'REALTIME_TOKEN_EXPIRED') return end('token_expired');
          if (res.status < 500 && res.status !== 429) return end('error', code || String(res.status));
          throw new Error(code || String(res.status));
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const parsed = parseFrames(buffer + decoder.decode(value, { stream: true }));
          buffer = parsed.rest;
          for (const f of parsed.frames) {
            if (f.retry) retry = f.retry;
            if (f.event === 'expired') return end('token_expired');
            if ((f.event === 'snapshot' || f.event === 'status') && f.data) {
              const s = JSON.parse(f.data) as RealtimeStatus;
              failures = 0;
              opts.onStatus(s, f.event);
              if (s.terminal) return end('terminal');
            }
          }
        }
      } catch (e) {
        if (ended || controller.signal.aborted) return;
        failures += 1;
        if (failures > 5) return end('error', e instanceof Error ? e.message : 'stream failed');
      }
      if (ended) return;
      await new Promise((r) => setTimeout(r, retry * Math.max(1, failures)));
    }
  })();

  return () => end('closed');
}
