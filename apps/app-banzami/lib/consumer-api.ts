import 'server-only';

// Server-side client for the canonical Consumer API (public-api), reused verbatim
// (WEB-APP-001 §30). The browser never calls this; the BFF routes do, attaching
// the session Bearer server-side. No Web-specific financial endpoints, no Project
// keys, no direct database access.

export const CONSUMER_API_BASE = (
  process.env.CONSUMER_API_BASE ?? 'https://sandbox-api.banzami.com/consumer'
).replace(/\/+$/, '');

export type Consumer = {
  id: string;
  handle: string;
  display_name?: string | null;
  status?: string;
  created_at?: string;
};

export type Money = { amount_minor: number; currency: string };

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string; message: string };

type FetchOpts = { bearer?: string; method?: string; body?: unknown; idempotencyKey?: string };

async function call<T>(path: string, opts: FetchOpts = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.bearer) headers['Authorization'] = `Bearer ${opts.bearer}`;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(`${CONSUMER_API_BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 502, code: 'UPSTREAM_UNREACHABLE', message: 'o serviço está indisponível; tente novamente' };
  }
  const text = await res.text();
  const json = text ? safeJson(text) : {};
  if (res.ok) return { ok: true, status: res.status, data: json as T };
  const code = (json as { code?: string }).code ?? 'ERROR';
  const message = (json as { message?: string }).message ?? 'ocorreu um erro';
  return { ok: false, status: res.status, code, message };
}

function safeJson(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
}

// ── Auth ────────────────────────────────────────────────────────────────────

export type AuthResult = {
  consumer: Consumer;
  token: string;
  expires_at: string;
  token_type: string;
};

export function register(handle: string, pin: string, displayName?: string) {
  return call<AuthResult>('/v1/auth/register', {
    method: 'POST',
    body: { handle, pin, display_name: displayName || undefined },
  });
}

export function login(handle: string, pin: string) {
  return call<AuthResult>('/v1/auth/token', { method: 'POST', body: { handle, pin } });
}

export function logout(bearer: string) {
  return call<unknown>('/v1/auth/logout', { method: 'POST', bearer });
}

// ── Consumer data ─────────────────────────────────────────────────────────────

export function getMe(bearer: string) {
  return call<Consumer>('/v1/me', { bearer });
}

export type Balance = {
  wallet_id: string;
  consumer_id: string;
  currency: string;
  available_minor: number;
  reserved_minor: number;
  total_minor: number;
  computed_at: string;
};

export function getBalance(bearer: string) {
  return call<Balance>('/v1/me/wallet/balance', { bearer });
}

export type ActivityItem = {
  activity_id: string;
  item_type: string; // WALLET_FUNDED | TRANSFER | ...
  direction: 'INCOMING' | 'OUTGOING';
  amount_minor: number;
  currency: string;
  status: string;
  created_at: string;
  completed_at?: string | null;
  counterparty_handle?: string | null;
  counterparty_display_name?: string | null;
  note?: string | null;
  transfer_id?: string | null;
  funding_id?: string | null;
};

export function getWallet(bearer: string) {
  return call<{ id: string; currency: string; balance?: Money }>('/v1/me/wallet', { bearer });
}

export function getActivity(bearer: string) {
  return call<{ items: ActivityItem[]; next_cursor?: string | null; has_more?: boolean }>('/v1/me/activity', { bearer });
}

export function resolveHandle(handle: string, bearer?: string) {
  return call<Consumer>(`/v1/consumers/${encodeURIComponent(handle)}`, { bearer });
}

export function searchConsumers(q: string, bearer: string) {
  return call<{ consumers?: Consumer[]; data?: Consumer[] }>(`/v1/consumers/search?q=${encodeURIComponent(q)}`, { bearer });
}

// ── Transfers (P2P) ───────────────────────────────────────────────────────────

export type Transfer = {
  transfer_id: string;
  status: string; // COMPLETED | ...
  amount_minor: number;
  currency: string;
  note?: string | null;
  recipient?: string; // "@handle"
  sender?: string; // "@handle"
  created_at?: string;
  completed_at?: string | null;
  trace_id?: string;
};

// The Consumer transfer contract: recipient may be "@handle", amount in minor
// units, an optional note, and an idempotency key (header, which the backend
// honours over any body field). The key makes a double-submit or a network
// retry converge on ONE transfer (WEB-APP-001 §64/§65/§127).
export function createTransfer(
  bearer: string,
  input: { recipient: string; amount_minor: number; currency?: string; note?: string },
  idempotencyKey: string,
) {
  return call<Transfer>('/v1/transfers', {
    method: 'POST',
    bearer,
    idempotencyKey,
    body: {
      recipient: input.recipient,
      amount_minor: input.amount_minor,
      currency: input.currency ?? 'AOA',
      note: input.note || undefined,
      idempotency_key: idempotencyKey,
    },
  });
}

export function listTransfers(bearer: string) {
  return call<{ transfers?: Transfer[]; data?: Transfer[] }>('/v1/transfers', { bearer });
}

export function getTransfer(bearer: string, id: string) {
  return call<Transfer>(`/v1/transfers/${encodeURIComponent(id)}`, { bearer });
}
