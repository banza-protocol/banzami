// Typed, credentialed client for the Developer Platform API
// (developer-api.banzami.com, ADR-033). The Account Identity session is a
// host-only __Host- HttpOnly cookie set by the API — this client NEVER reads it,
// never stores tokens/secrets/CSRF in localStorage/sessionStorage, and never
// logs response bodies. The CSRF token is held only in React memory by the
// auth provider and passed in per mutation.

export const DEV_API_BASE = (
  process.env.NEXT_PUBLIC_DEVELOPER_API_URL || 'https://developer-api.banzami.com'
).replace(/\/+$/, '');

export type ApiErrorCode =
  | 'UNAUTHENTICATED' // 401 — clear state, return to sign-in
  | 'FORBIDDEN' // 403 — Origin/CSRF/authorization failure
  | 'RATE_LIMITED' // 429
  | 'CONFLICT' // 409
  | 'LAST_OWNER' // 409 (last owner)
  | 'VALIDATION' // 400
  | 'INVITE_INVALID' // 410
  | 'NOT_FOUND' // 404
  | 'UNAVAILABLE' // 5xx / unknown
  | 'NETWORK'; // fetch threw

export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  constructor(code: ApiErrorCode, status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

// User-facing messages only — never leak internal detail, bodies, or tokens.
const MESSAGES: Record<ApiErrorCode, string> = {
  UNAUTHENTICATED: 'A sua sessão expirou. Inicie sessão novamente.',
  FORBIDDEN: 'Não tem permissão para esta ação.',
  RATE_LIMITED: 'Demasiados pedidos. Tente novamente daqui a pouco.',
  CONFLICT: 'Já existe.',
  LAST_OWNER: 'Não pode remover ou despromover o último proprietário.',
  VALIDATION: 'Dados inválidos.',
  INVITE_INVALID: 'O convite expirou, foi revogado ou já foi usado.',
  NOT_FOUND: 'Não encontrado.',
  UNAVAILABLE: 'Serviço indisponível. Tente novamente.',
  NETWORK: 'Sem ligação ao serviço.',
};

function codeFor(status: number, apiCode?: string): ApiErrorCode {
  if (apiCode === 'LAST_OWNER') return 'LAST_OWNER';
  switch (status) {
    case 400:
      return 'VALIDATION';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 410:
      return 'INVITE_INVALID';
    case 429:
      return 'RATE_LIMITED';
    default:
      return 'UNAVAILABLE';
  }
}

async function req<T>(
  path: string,
  opts: { method?: string; body?: unknown; csrf?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.csrf) headers['X-CSRF-Token'] = opts.csrf;

  let res: Response;
  try {
    res = await fetch(`${DEV_API_BASE}${path}`, {
      method: opts.method ?? 'GET',
      credentials: 'include', // host-only session cookie travels here
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError('NETWORK', 0, MESSAGES.NETWORK);
  }

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body — ignored; never surfaced */
  }

  if (!res.ok) {
    const apiCode = (data as { error?: { code?: string } } | null)?.error?.code;
    const code = codeFor(res.status, apiCode);
    throw new ApiError(code, res.status, MESSAGES[code]);
  }
  return data as T;
}

// ── Types (safe metadata only — never a secret hash or raw key) ──────────────
export type User = { id: string; email: string; name: string; verified: boolean; status: string };
export type Workspace = { id: string; name: string; slug: string; status: string; created_at: string };
export type Member = { user_id: string; role: string; status: string };
export type Project = {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
};
/**
 * One wallet account of the project's bound financial owner, with what it
 * holds. Balances are in minor units — there is no float anywhere near money.
 */
export type WalletAccount = {
  id: string;
  label: string;
  purpose: string;
  reference_type: string;
  reference_id: string;
  currency: string;
  balance_minor: number;
  status: string;
  created_at: string;
};

/** One financial operation under the project. Three released types, each kept
 *  distinct: a payment and a refund are not the same event. */
export type DeveloperTransaction = {
  id: string;
  type: 'payment' | 'refund' | 'transfer';
  status: string;
  /** Null when the session was opened without a fixed amount. */
  amount_minor: number | null;
  currency: string;
  wallet_account_id: string;
  reference_type: string;
  reference_id: string;
  created_at: string;
};

export type ApiKey = {
  id: string;
  project_id: string;
  environment: string;
  kind: 'PUBLISHABLE' | 'SECRET';
  name: string;
  prefix: string;
  public_value: string;
  scopes: string[] | null;
  status: string;
  created_at: string;
  last_used_at: string | null;
};
// NewKey adds the one-time secret (SECRET keys only). Never re-fetchable.
export type NewKey = ApiKey & { secret?: string };

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
}

export interface WebhookEvent {
  id: string;
  event_type: string;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  event_id: string;
  endpoint_id: string;
  status: string;
  status_code?: number | null;
  attempt_count: number;
  delivered_at?: string | null;
  created_at: string;
}

/** One Developer API request as the operator recorded it (migration 0104).
 *  There is no header, body or credential field here because there is none in
 *  the database either. */
export interface ApiRequestLog {
  id: string;
  method: string;
  path: string;
  route?: string;
  status: number;
  request_id: string;
  latency_ms?: number | null;
  environment: string;
  created_at: string;
}

/** Aggregated over the same window, in SQL — not over the returned page, which
 *  is capped. A "total" derived from a page would be a page size wearing the
 *  clothes of a metric. */
export interface ApiRequestSummary {
  requests: number;
  errors: number;
  median_latency_ms?: number | null;
  by_day: { day: string; count: number }[];
  window_start?: string | null;
}

export interface RequestLogQuery {
  limit?: number;
  request_id?: string;
  status?: number;
  path?: string;
  since?: string;
  until?: string;
}

export const developerApi = {
  // Account Identity
  requestOtp: (email: string) => req<{ ok: boolean }>('/auth/request-otp', { method: 'POST', body: { email } }),
  verify: (email: string, code: string) =>
    req<{ ok: boolean; csrf_token: string; user: User }>('/auth/verify', { method: 'POST', body: { email, code } }),
  me: () => req<{ user: User; csrf_token: string }>('/auth/me'),
  logout: (csrf: string) => req<{ ok: boolean }>('/auth/logout', { method: 'POST', csrf }),

  // Workspaces
  listWorkspaces: () => req<{ workspaces: Workspace[] }>('/workspaces'),
  createWorkspace: (name: string, csrf: string) =>
    req<Workspace>('/workspaces', { method: 'POST', body: { name }, csrf }),

  // Members + invites
  listMembers: (wsID: string) => req<{ members: Member[] }>(`/workspaces/${wsID}/members`),
  invite: (wsID: string, email: string, role: string, csrf: string) =>
    req<{ invite_id: string; email: string; role: string; token: string }>(
      `/workspaces/${wsID}/members`,
      { method: 'POST', body: { email, role }, csrf },
    ),
  acceptInvite: (token: string, csrf: string) =>
    req<{ workspace_id: string; role: string }>('/invites/accept', { method: 'POST', body: { token }, csrf }),
  setRole: (wsID: string, userID: string, role: string, csrf: string) =>
    req<{ ok: boolean }>(`/workspaces/${wsID}/members/${userID}`, { method: 'PATCH', body: { role }, csrf }),
  removeMember: (wsID: string, userID: string, csrf: string) =>
    req<{ ok: boolean }>(`/workspaces/${wsID}/members/${userID}`, { method: 'DELETE', csrf }),
  revokeInvite: (wsID: string, inviteID: string, csrf: string) =>
    req<{ ok: boolean }>(`/workspaces/${wsID}/invites/${inviteID}`, { method: 'DELETE', csrf }),

  // Projects
  listProjects: (wsID: string) => req<{ projects: Project[] }>(`/workspaces/${wsID}/projects`),
  createProject: (wsID: string, name: string, csrf: string) =>
    req<Project>(`/workspaces/${wsID}/projects`, { method: 'POST', body: { name }, csrf }),

  // Sandbox API keys
  listKeys: (projectID: string) => req<{ keys: ApiKey[] }>(`/projects/${projectID}/keys`),
  createKey: (projectID: string, kind: 'PUBLISHABLE' | 'SECRET', name: string, scopes: string[], csrf: string) =>
    req<NewKey>(`/projects/${projectID}/keys`, { method: 'POST', body: { kind, name, scopes }, csrf }),
  // ── Balances (real, project-scoped) ────────────────────────────────────────
  // The project id is what the caller supplies; the merchant behind it is
  // derived server-side from the project's sealed binding and never accepted
  // from here.
  listBalances: (projectID: string, opts: { limit?: number; cursor?: string } = {}) => {
    const p = new URLSearchParams();
    if (opts.limit) p.set('limit', String(opts.limit));
    if (opts.cursor) p.set('cursor', opts.cursor);
    const qs = p.toString();
    return req<{ accounts: WalletAccount[]; total: number; next_cursor: string }>(
      `/projects/${projectID}/balances${qs ? `?${qs}` : ''}`);
  },

  // Financial operations under the project. Not the API log: that says which
  // requests arrived, this says which money moved. Every filter is applied
  // server-side.
  listTransactions: (
    projectID: string,
    opts: { limit?: number; cursor?: string; type?: string; status?: string; since?: string; until?: string } = {},
  ) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(opts)) if (v) p.set(k, String(v));
    const qs = p.toString();
    return req<{ transactions: DeveloperTransaction[]; next_cursor: string }>(
      `/projects/${projectID}/transactions${qs ? `?${qs}` : ''}`);
  },

  // ── Webhooks (real, project-scoped) ────────────────────────────────────────
  // Served by developer-api from the gateway's own webhook tables, scoped by the
  // merchant the project's binding names. No secret is ever returned: the view
  // types have no field for one.
  listWebhookEndpoints: (projectID: string) =>
    req<{ endpoints: WebhookEndpoint[] }>(`/projects/${projectID}/webhooks/endpoints`),
  listWebhookEvents: (projectID: string, limit = 25) =>
    req<{ events: WebhookEvent[] }>(`/projects/${projectID}/webhooks/events?limit=${limit}`),
  listWebhookDeliveries: (projectID: string, eventID: string) =>
    req<{ deliveries: WebhookDelivery[] }>(`/projects/${projectID}/webhooks/events/${eventID}/deliveries`),

  listApiRequestLogs: (projectID: string, q: RequestLogQuery = {}) => {
    const p = new URLSearchParams();
    if (q.limit) p.set('limit', String(q.limit));
    if (q.request_id) p.set('request_id', q.request_id);
    if (q.status) p.set('status', String(q.status));
    if (q.path) p.set('path', q.path);
    if (q.since) p.set('since', q.since);
    if (q.until) p.set('until', q.until);
    const qs = p.toString();
    return req<{ logs: ApiRequestLog[]; summary: ApiRequestSummary; retention_days: number }>(
      `/projects/${projectID}/logs${qs ? `?${qs}` : ''}`);
  },

  rotateKey: (keyID: string, csrf: string) => req<NewKey>(`/keys/${keyID}/rotate`, { method: 'POST', csrf }),
  revokeKey: (keyID: string, csrf: string) => req<{ ok: boolean }>(`/keys/${keyID}`, { method: 'DELETE', csrf }),
};
