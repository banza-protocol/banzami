// Typed, credentialed client for the Developer Platform API
// (developer-api.banzami.com, ADR-033). The Account Identity session is a
// host-only __Host- HttpOnly cookie set by the API — this client NEVER reads it,
// never stores tokens/secrets/CSRF in localStorage/sessionStorage, and never
// logs response bodies. The CSRF token is held only in React memory by the
// auth provider and passed in per mutation.

export const DEV_API_BASE = (
  process.env.NEXT_PUBLIC_DEVELOPER_API_URL || 'https://developer-api.banzami.com'
).replace(/\/+$/, '');

/**
 * The codes a caller can branch on.
 *
 * The named ones below are this client's own vocabulary, derived from status
 * when the server says nothing more specific. But the server DOES say something
 * more specific, often, and this used to throw it away: every 409 became
 * CONFLICT, so PROJECT_FINANCIAL_SETUP_REQUIRED — a state with an action behind
 * it — arrived indistinguishable from "already exists", and Core's refund
 * refusals all collapsed into one word.
 *
 * So the type is open at the end. A server code is passed through as itself, and
 * the union documents the ones this client can produce on its own.
 */
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
  | 'NETWORK' // fetch threw
  | (string & {}); // whatever the server named it

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
// The words for the codes this client produces itself. A server code that is
// not listed falls through to the server's own message, which is the one written
// for that situation — a generic sentence here would be a worse answer than the
// one the server already gave.
export const MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: 'A sua sessão expirou. Inicie sessão novamente.',
  FORBIDDEN: 'Não tem permissão para esta ação.',
  RATE_LIMITED: 'Demasiados pedidos. Tente novamente daqui a pouco.',
  CONFLICT: 'Já existe.',
  LAST_OWNER: 'Não pode remover ou despromover o último proprietário.',
  VALIDATION: 'Dados inválidos.',
  // The API distinguishes a malformed address from generic bad input, and that
  // distinction is worth keeping: it is the difference between "fix the email"
  // and "something went wrong". Without an entry here the client fell through to
  // the server's own English sentence, and callers that branch on the code alone
  // showed a generic failure instead — which sends the developer to retry, and
  // straight into the rate limiter.
  INVALID_EMAIL: 'Introduza um email válido.',
  INVITE_INVALID: 'O convite expirou, foi revogado ou já foi usado.',
  NOT_FOUND: 'Não encontrado.',
  UNAVAILABLE: 'Serviço indisponível. Tente novamente.',
  NETWORK: 'Sem ligação ao serviço.',
};

/**
 * The server's own code wins when it has one.
 *
 * It names a situation; the status names a category. PROJECT_FINANCIAL_SETUP_REQUIRED
 * and CONFLICT are both 409 and lead completely different places — one to a
 * button in this Console, the other to "it already exists" — and the status
 * cannot tell them apart.
 *
 * The status mapping stays as the fallback, for responses that carry no code and
 * for transport-level failures that never reached a handler.
 */
function codeFor(status: number, apiCode?: string): ApiErrorCode {
  if (apiCode) return apiCode;
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
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    const code = codeFor(res.status, err?.code);
    throw new ApiError(code, res.status,
      MESSAGES[code] ?? err?.message ?? MESSAGES.UNAVAILABLE);
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
  /**
   * What the OPERATOR knows about this payment's execution — never a protocol
   * state, and never a replacement for `status` above.
   *
   * The two genuinely differ. A Payment Session paid by an externally acquired
   * payment credits its Wallet Account correctly and still reads ACTIVE, because
   * BANZA's payment_session.paid requires a transfer_id and a Transfer must come
   * from a consumer wallet — which an external payer is not (BANZA RFC-0007).
   * Showing only `status` left a developer with sessions marked ACTIVE beside a
   * balance that had moved, and no way to reconcile the two.
   */
  acquiring?: {
    state: 'PAID' | 'UNPAID';
    /** What was received. Null while UNPAID — not zero, which would be a figure. */
    amount_minor: number | null;
    paid_at: string | null;
    credited_wallet_account_id: string;
    interface: string;
    /** Present only where the acquiring state and the protocol status disagree. */
    protocol_note?: string;
  };
};

/** Where a project stands financially, in the developer's own terms. */
export type FinancialSetupState = {
  /** UNCONFIGURED · READY · SEALED · UNAVAILABLE. */
  state: 'UNCONFIGURED' | 'READY' | 'SEALED' | 'UNAVAILABLE';
  environment: string;
  /** Whether THIS member may perform the setup. Advice; the server re-authorises. */
  can_configure: boolean;
  role: string;
  /** The destination is fixed: a payer-facing artifact has been issued (ADR-055). */
  sealed: boolean;
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

// NewWebhookEndpoint adds the one-time signing secret. Present only in the
// response to creation or rotation — the same reveal-once rule as a secret key,
// for the same reason: the row holds it encrypted and nothing can show it again.
export type NewWebhookEndpoint = WebhookEndpoint & { secret: string };

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

  // ── Sandbox financial setup ────────────────────────────────────────────────
  // The step that used to be an operator's. A project has no financial
  // environment until someone asks for one, and this is how a developer asks.
  // The POST carries no body: there is no merchant, wallet or owner to name,
  // because naming one is what this exists to make unnecessary.
  financialSetup: (projectID: string) =>
    req<FinancialSetupState>(`/projects/${projectID}/financial-setup`),
  configureFinancialSetup: (projectID: string, csrf: string) =>
    req<FinancialSetupState>(`/projects/${projectID}/financial-setup`, { method: 'POST', csrf }),

  // The purposes the server offers, from the server. A local copy of this list
  // drifted the moment it existed: it offered one value Core rejects and withheld
  // several Core accepts.
  walletAccountPurposes: () => req<{ purposes: string[] }>('/wallet-account-purposes'),

  // Open a segregated destination — the same primitive DOA uses per campaign,
  // and the same field names the published SDK sends, so one resource has one
  // contract. No merchant, wallet or owner: those come from the project.
  createWalletAccount: (
    projectID: string,
    body: { label: string; purpose: string; reference_type?: string; reference_id?: string },
    csrf: string,
  ) => req<WalletAccount>(`/projects/${projectID}/wallet-accounts`, { method: 'POST', body, csrf }),

  // ── Refunds (real, project-scoped, OWNER/ADMIN) ────────────────────────────
  // What the Console may show. `allowed` is this member's role; `configured` is
  // whether the deployment has a refund path at all. They are separate because
  // they lead somewhere different — one is a permission to ask a colleague for,
  // the other is nobody's to grant — and a UI that showed one for the other
  // would send someone to ask for something that would not help.
  //
  // Advice to the UI and nothing more: every refund is authorised again on the
  // server at the moment it is attempted.
  // Three separate facts, because they lead three different places: `allowed`
  // is this member's role, `configured` is whether the deployment has a refund
  // path, and `bound` is whether the project has a financial owner at all. A
  // fresh project is allowed and configured and has nothing to refund.
  refundCapability: (projectID: string) =>
    req<{ allowed: boolean; configured: boolean; bound: boolean; role: string }>(
      `/projects/${projectID}/refund-capability`),

  // The idempotency key is the CALLER's and is minted by the page, once, when
  // the dialog opens — not here and not per attempt. A retry of the same
  // confirmed refund carries the same key and cannot become a second refund;
  // a deliberate second partial refund is a new dialog and a new key.
  refundPayment: (
    projectID: string,
    paymentID: string,
    body: { amount_minor: number; reason: string; idempotency_key: string },
    csrf: string,
  ) =>
    req<{ id: string; status: string; amount_minor: number; currency: string }>(
      `/projects/${projectID}/payments/${paymentID}/refund`,
      { method: 'POST', body, csrf }),

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

  // Webhook endpoint management. Creating one used to require a project key and
  // code; the Console's own empty state said so. The signing secret is returned
  // exactly once here and never again.
  createWebhookEndpoint: (projectID: string, url: string, events: string[], csrf: string) =>
    req<NewWebhookEndpoint>(`/projects/${projectID}/webhooks/endpoints`, {
      method: 'POST', body: { url, events }, csrf,
    }),
  rotateWebhookSecret: (projectID: string, endpointID: string, csrf: string) =>
    req<NewWebhookEndpoint>(`/projects/${projectID}/webhooks/endpoints/${endpointID}/rotate-secret`, {
      method: 'POST', csrf,
    }),
  setWebhookEndpointActive: (projectID: string, endpointID: string, active: boolean, csrf: string) =>
    req<WebhookEndpoint>(`/projects/${projectID}/webhooks/endpoints/${endpointID}`, {
      method: 'PATCH', body: { active }, csrf,
    }),

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
