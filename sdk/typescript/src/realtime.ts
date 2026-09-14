/**
 * @banzami/sdk/realtime — watch a Payment Session's status from a browser
 * (ADR-060 §9).
 *
 * This entry point holds NO API key and accepts none. It takes the short-lived,
 * read-only status token (`bzst_…`) your backend received on the session
 * (`session.realtime.token`) and hands to the page. The token opens one
 * session's public status — status, amount, currency, expiry — for at most 30
 * minutes, and cannot create, change or read anything else.
 *
 * The token travels in the Authorization header over a fetch stream. It is
 * never put in the URL: a URL ends up in logs, history and Referer headers,
 * and the API refuses it there (400 REALTIME_TOKEN_IN_URL). That is why this
 * helper does not use EventSource, which cannot send headers.
 *
 * Realtime status is for the screen. It is not proof of payment: fulfil an
 * order on the signed `payment_session.paid` webhook, or on a GET made by your
 * backend with your key.
 */

import { BanzamiApiError, BanzamiConfigError } from './errors.js';

export interface PaymentSessionStatus {
  session_id: string;
  status: 'CREATED' | 'ACTIVE' | 'PAID' | 'PARTIALLY_PAID' | 'EXPIRED' | 'CANCELLED' | 'FAILED' | string;
  amount_minor: number | null;
  currency: string;
  expires_at: string | null;
  /** true for PAID, EXPIRED, CANCELLED and FAILED: the stream ends after it. */
  terminal: boolean;
  observed_at: string;
}

export type WatchEnd =
  | { reason: 'terminal'; status: PaymentSessionStatus }
  | { reason: 'token_expired' }
  | { reason: 'closed' }
  | { reason: 'error'; error: Error };

export interface WatchPaymentSessionStatusOptions {
  sessionId: string;
  /** The status token from `session.realtime.token` — never an API key. */
  token: string;
  /** API origin. Defaults to the Sandbox API. */
  baseUrl?: string;
  /** Called with the first snapshot of each connection, then with every change. */
  onStatus: (status: PaymentSessionStatus, kind: 'snapshot' | 'status') => void;
  /** Called once, when watching ends. */
  onEnd?: (end: WatchEnd) => void;
  /** Reconnect after a dropped connection (default true). Each reconnect starts with a fresh snapshot. */
  reconnect?: boolean;
  /** Give up after this many consecutive failed connections (default 5). */
  maxReconnects?: number;
  fetch?: typeof fetch;
}

export interface PaymentSessionWatch {
  /** Stop watching. */
  close(): void;
  /** Resolves when watching ends, for any reason. */
  done: Promise<WatchEnd>;
}

const SANDBOX_API = 'https://sandbox-api.banzami.com';

/** Watch one Payment Session's status until it is terminal, the token expires, or you close it. */
export function watchPaymentSessionStatus(opts: WatchPaymentSessionStatusOptions): PaymentSessionWatch {
  if (/^bz_(test|live)_(sk|pk)_/.test(opts.token) || !opts.token.startsWith('bzst_')) {
    throw new BanzamiConfigError(
      'watchPaymentSessionStatus takes the session\'s status token (bzst_…), never an API key. ' +
      'Read the session on your backend and pass session.realtime.token to the page.',
    );
  }
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const url = `${(opts.baseUrl ?? SANDBOX_API).replace(/\/$/, '')}/v1/realtime/payment-sessions/${encodeURIComponent(opts.sessionId)}`;
  const controller = new AbortController();
  const maxReconnects = opts.maxReconnects ?? 5;
  let finish!: (end: WatchEnd) => void;
  let ended = false;
  const done = new Promise<WatchEnd>((resolve) => {
    finish = (end) => {
      if (ended) return;
      ended = true;
      controller.abort();
      opts.onEnd?.(end);
      resolve(end);
    };
  });

  const run = async () => {
    let failures = 0;
    let retryMs = 3000;
    while (!ended) {
      let sawData = false;
      try {
        const res = await doFetch(url, {
          headers: { Authorization: `Bearer ${opts.token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!res.ok || !res.body) {
          let code = 'UNKNOWN';
          let message = res.statusText;
          try {
            const b = (await res.json()) as { code?: string; message?: string };
            code = b.code ?? code;
            message = b.message ?? message;
          } catch { /* not JSON */ }
          if (code === 'REALTIME_TOKEN_EXPIRED') return finish({ reason: 'token_expired' });
          const err = new BanzamiApiError(res.status, code, message);
          // A refusal about the token or the session will not change on retry.
          if (res.status !== 429 && res.status < 500) return finish({ reason: 'error', error: err });
          throw err;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });
          let cut: number;
          while ((cut = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            let event = 'message';
            const data: string[] = [];
            for (const line of frame.split('\n')) {
              if (line.startsWith(':')) continue; // heartbeat
              if (line.startsWith('retry:')) { const n = Number(line.slice(6).trim()); if (n > 0) retryMs = n; }
              else if (line.startsWith('event:')) event = line.slice(6).trim();
              else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
            }
            if (event === 'expired') return finish({ reason: 'token_expired' });
            if ((event === 'snapshot' || event === 'status') && data.length) {
              const status = JSON.parse(data.join('\n')) as PaymentSessionStatus;
              sawData = true;
              failures = 0;
              opts.onStatus(status, event);
              if (status.terminal) return finish({ reason: 'terminal', status });
            }
          }
        }
      } catch (err) {
        if (ended || controller.signal.aborted) return;
        if (!sawData) failures += 1;
        if (opts.reconnect === false || failures > maxReconnects) {
          return finish({ reason: 'error', error: err instanceof Error ? err : new Error(String(err)) });
        }
      }
      if (ended) return;
      if (opts.reconnect === false) return finish({ reason: 'closed' });
      await new Promise((r) => setTimeout(r, retryMs * Math.max(1, failures)));
    }
  };
  void run();

  return { close: () => finish({ reason: 'closed' }), done };
}
