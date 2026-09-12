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
  /**
   * The machine-readable specifics a refusal turns on — the counts and names
   * that say WHAT is in the way, so a dialog can name the blocker instead of
   * repeating the message. Facts about the caller's own resources; the same
   * authority boundary as the rest of the reply.
   */
  details?: Record<string, unknown>;
  constructor(code: ApiErrorCode, status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
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
  INVALID_NAME: 'O nome não pode estar vazio e tem no máximo 80 caracteres.',
  // The lifecycle refusals. Each one names what is in the way and what to do
  // instead, because "conflito" tells a developer nothing they can act on. The
  // counts travel in ApiError.details, so a dialog can be specific.
  WORKSPACE_NOT_EMPTY: 'Este workspace ainda tem projetos ativos. Arquive-os primeiro.',
  PROJECT_NOT_EMPTY: 'Este projeto já tem histórico. Pode ser arquivado, não eliminado.',
  ENDPOINT_HAS_DELIVERIES: 'Este endpoint já recebeu entregas. Desative-o em vez de o eliminar.',
  // Reenviar é para uma entrega que falhou. Uma que já foi aceite não se repete:
  // o servidor do integrador recebeu esse evento e agiu sobre ele, e repeti-lo é
  // um segundo "pagamento recebido" para um pagamento.
  DELIVERY_ALREADY_SUCCEEDED:
    'Esta entrega já foi recebida com sucesso. O reenvio existe para uma entrega que falhou.',
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
    const err = (data as {
      error?: { code?: string; message?: string; details?: Record<string, unknown> };
    } | null)?.error;
    const code = codeFor(res.status, err?.code);
    throw new ApiError(code, res.status,
      MESSAGES[code] ?? err?.message ?? MESSAGES.UNAVAILABLE, err?.details);
  }
  return data as T;
}

// ── Types (safe metadata only — never a secret hash or raw key) ──────────────
export type User = { id: string; email: string; name: string; verified: boolean; status: string };
export type Workspace = { id: string; name: string; slug: string; status: string; created_at: string };
/**
 * One member of a workspace, as the people who share it may see each other.
 *
 * `name` is often empty — an account that never set one — and `email` always
 * exists, so the email is what a row falls back to. A member whose identity row
 * could not be read comes back with both empty; that is the server declining to
 * answer, not a member without an identity, and the UI says so rather than
 * assembling a person out of the id.
 */
export type Member = { user_id: string; role: string; status: string; name?: string; email?: string };

/**
 * An invite the workspace has out, to a person who has not accepted yet.
 *
 * Managers only (OWNER/ADMIN); the list is 403 for everyone else. It carries no
 * token and no token hash on purpose: an invite token is a bearer capability,
 * and a list that returned one would let any manager accept in someone else's
 * name.
 */
export type Invite = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
};
/**
 * What a project still holds, and therefore what stands between it and being
 * deleted. Counts are "ever", not "currently": a revoked key is still a
 * credential the project once issued, so it is history and history is archived.
 */
export type ProjectFootprint = {
  keys: number;
  request_logs: number;
  bindings: number;
  deletable: boolean;
  blockers: string[];
};
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
  /**
   * Whether the project can SETTLE, and what blocks it — the same contract a
   * Project key reads at GET /v1/financial-setup, from the same engine. Null
   * while unconfigured, or when it could not be read (readiness_unavailable).
   */
  readiness?: ProjectReadiness | null;
  readiness_unavailable?: boolean;
  /**
   * How this Project gets (or got) a Business to receive into: its application
   * for a new Business, or the existing Business it is connected to. Absent only
   * from a server that predates financial onboarding.
   */
  onboarding?: FinancialOnboarding | null;
};

/**
 * The Project's onboarding, one level above the tables (developer-api
 * financial_onboarding.go). About the Project, never about merchant rows.
 */
export type OnboardingState =
  | 'NOT_CONFIGURED'
  | 'IN_REVIEW'
  | 'INFORMATION_REQUIRED'
  | 'APPROVED_PROVISIONING'
  | 'REJECTED'
  | 'READY'
  | 'BLOCKED'
  /** Bound to a Business, but whether it can settle could not be read just now. Never READY. */
  | 'READINESS_UNKNOWN';

/** One issue from the Gateway's Business requirements policy. */
export type OnboardingRequirement = {
  code: string;
  kind: 'field' | 'document';
  label: string;
  /** MISSING · UPLOADED · ACCEPTED · REJECTED[: why] · the reviewer's words. */
  reason: string;
};

/** The Business a Project receives into: public identity only, no internal id. */
export type OnboardingBusiness = {
  name: string;
  /** "@handle", already prefixed. */
  handle: string;
  kyb_status: string;
  verified: boolean;
};

/** The Project's latest application for a new Business, as the Gateway reports it. */
export type OnboardingApplication = {
  application_id: string;
  status: string;
  origin: string;
  requested_handle: string;
  information_request?: string;
  business_name: string;
  project_binding?: 'BOUND' | 'PENDING' | string;
  created_at: string;
  requirements: {
    policy_version: string;
    currently_due: OnboardingRequirement[];
    pending_verification: OnboardingRequirement[];
    errors: OnboardingRequirement[];
    accepted: OnboardingRequirement[];
  };
};

export type FinancialOnboarding = {
  state: OnboardingState;
  /** This member may start an application or connect a Business. Advice; the server re-authorises. */
  can_act: boolean;
  business?: OnboardingBusiness | null;
  application?: OnboardingApplication | null;
  /** Settlement readiness's own codes, for the Console to explain. */
  blockers: string[];
};

/**
 * A Project's application for a NEW Business — the same fields the public
 * Business application collects. The Project and the submitting member are
 * taken from the session by the server; there is no field for either here.
 */
export type FinancialApplicationInput = {
  desired_handle: string;
  business_name: string;
  category: string;
  subcategory?: string;
  email: string;
  phone: string;
  nif: string;
  province: string;
  municipality: string;
  city?: string;
  address: string;
  address_reference?: string;
  legal_representative: string;
  representative_role: string;
  representative_email?: string;
  representative_phone?: string;
  business_activity: string;
  estimated_volume?: string;
  terms_accepted: true;
};

/** The public readiness projection (GET /v1/financial-setup, minus project/env). */
export type ProjectReadiness = {
  financial_identity: { handle: string | null };
  kyb: { status: string | null };
  wallet: { status: string | null; ready: boolean; currency: string };
  pricing: { profile: string | null; settlement_bps: number | null; payout_bps: number | null };
  fee_destination: {
    handle: string | null;
    required: boolean;
    resolved: boolean;
    owned_by_project: boolean;
    kyb_approved: boolean;
    wallet_active: boolean;
    type_allowed: boolean;
    application_account_ready: boolean;
    eligible: boolean;
    blocker: string | null;
  };
  settlement: { ready: boolean; blockers: string[]; warnings: string[] };
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

/** One attempt to deliver a webhook, as it happened (migration 0119). */
export interface WebhookDeliveryAttempt {
  attempt_number: number;
  outcome: 'SUCCESS' | 'FAILED';
  /** null when no HTTP response arrived at all */
  status_code: number | null;
  /** why a failed attempt failed: http_status | timeout | connection | tls | dns | other */
  error_class: string | null;
  duration_ms?: number;
  attempted_at: string;
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
  /** Every attempt, oldest first. Attempts made before the history existed are
   *  counted in attempt_count but not listed. */
  attempts?: WebhookDeliveryAttempt[];
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
  // The one thing an account holder can change about themselves. Until this
  // existed no name was ever recorded, so the header avatar showed two letters
  // of the email and two colleagues at a domain looked identical.
  setName: (name: string, csrf: string) =>
    req<{ user: User; csrf_token: string }>('/auth/me', { method: 'POST', body: { name }, csrf }),
  logout: (csrf: string) => req<{ ok: boolean }>('/auth/logout', { method: 'POST', csrf }),

  // Workspaces
  listWorkspaces: () => req<{ workspaces: Workspace[] }>('/workspaces'),
  createWorkspace: (name: string, csrf: string) =>
    req<Workspace>('/workspaces', { method: 'POST', body: { name }, csrf }),
  renameWorkspace: (wsID: string, name: string, csrf: string) =>
    req<Workspace>(`/workspaces/${wsID}`, { method: 'PATCH', body: { name }, csrf }),
  // Archive, not delete: audit events are append-only and a workspace's projects
  // may hold financial history. The body repeats the workspace's own name, so
  // the call cannot happen by a mis-click or a replayed request.
  archiveWorkspace: (wsID: string, name: string, csrf: string) =>
    req<{ status: string }>(`/workspaces/${wsID}`, { method: 'DELETE', body: { name }, csrf }),
  leaveWorkspace: (wsID: string, csrf: string) =>
    req<void>(`/workspaces/${wsID}/leave`, { method: 'POST', csrf }),

  // Members + invites
  listMembers: (wsID: string) => req<{ members: Member[] }>(`/workspaces/${wsID}/members`),
  invite: (wsID: string, email: string, role: string, csrf: string) =>
    req<{ invite_id: string; email: string; role: string; token: string }>(
      `/workspaces/${wsID}/members`,
      { method: 'POST', body: { email, role }, csrf },
    ),
  // The invites still out. Without it a mis-typed address stayed a live way into
  // the workspace until it expired, because revokeInvite could only be aimed at
  // an invite created in front of the reader.
  listInvites: (wsID: string) => req<{ invites: Invite[] }>(`/workspaces/${wsID}/invites`),
  acceptInvite: (token: string, csrf: string) =>
    req<{ workspace_id: string; role: string }>('/invites/accept', { method: 'POST', body: { token }, csrf }),
  setRole: (wsID: string, userID: string, role: string, csrf: string) =>
    req<{ ok: boolean }>(`/workspaces/${wsID}/members/${userID}`, { method: 'PATCH', body: { role }, csrf }),
  removeMember: (wsID: string, userID: string, csrf: string) =>
    req<{ ok: boolean }>(`/workspaces/${wsID}/members/${userID}`, { method: 'DELETE', csrf }),
  revokeInvite: (wsID: string, inviteID: string, csrf: string) =>
    req<{ ok: boolean }>(`/workspaces/${wsID}/invites/${inviteID}`, { method: 'DELETE', csrf }),

  // Projects
  //
  // Archived projects are left out unless asked for: the selector is for work in
  // progress, and an archived project in it invites building against something
  // that has no keys and no financial authority left.
  listProjects: (wsID: string, includeArchived = false) =>
    req<{ projects: Project[] }>(
      `/workspaces/${wsID}/projects${includeArchived ? '?include_archived=true' : ''}`),
  createProject: (wsID: string, name: string, csrf: string) =>
    req<Project>(`/workspaces/${wsID}/projects`, { method: 'POST', body: { name }, csrf }),
  // A rename moves the display name only. The Project ID stays put — a developer
  // has it in a config file and a deployed container.
  renameProject: (projectID: string, name: string, csrf: string) =>
    req<Project>(`/projects/${projectID}`, { method: 'PATCH', body: { name }, csrf }),
  // What the project holds, and therefore whether it can be deleted or only
  // archived. Asked before either is offered, so the dialog states the
  // consequence instead of discovering it.
  projectFootprint: (projectID: string) =>
    req<ProjectFootprint>(`/projects/${projectID}/footprint`),
  deleteProject: (projectID: string, name: string, csrf: string) =>
    req<void>(`/projects/${projectID}`, { method: 'DELETE', body: { name }, csrf }),
  archiveProject: (projectID: string, name: string, csrf: string) =>
    req<{ status: string; keys_revoked: number }>(
      `/projects/${projectID}/archive`, { method: 'POST', body: { name }, csrf }),

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

  // ── Financial setup ────────────────────────────────────────────────────────
  // Where the project stands: whether it receives into a Business, and how it
  // is getting one.
  //
  // There is deliberately no client for POST /financial-setup. That was the
  // one-click setup, which created a synthetic Business and wrote its KYB as
  // approved with nobody reviewing anything; the server now answers it 410
  // FINANCIAL_SETUP_BY_REVIEW. A Project gets a Business in exactly two ways,
  // both below.
  financialSetup: (projectID: string) =>
    req<FinancialSetupState>(`/projects/${projectID}/financial-setup`),

  // A. Apply for a NEW Business — the same application the public form sends,
  // reviewed by an operator in BANZADMIN. One idempotency key per form session:
  // a double click or a retried request returns the application the first
  // submission created instead of a second one.
  submitFinancialApplication: (
    projectID: string,
    body: FinancialApplicationInput,
    idempotencyKey: string,
    csrf: string,
  ) =>
    req<{ application_id: string; status: string }>(
      `/projects/${projectID}/financial-onboarding/applications`,
      { method: 'POST', body: { ...body, idempotency_key: idempotencyKey }, csrf },
    ),

  // B. Connect an EXISTING Business, with the single-use consent code it issued
  // from its own app. Nothing is re-verified or re-created.
  linkExistingBusiness: (projectID: string, code: string, csrf: string) =>
    req<{ business: OnboardingBusiness }>(
      `/projects/${projectID}/financial-onboarding/link`,
      { method: 'POST', body: { code }, csrf },
    ),

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
  // Re-queue a delivery the receiver never accepted. It resets the EXISTING
  // delivery to PENDING — one delivery row per event per endpoint is the design,
  // and the attempt counter continues on that row — so this never produces a
  // second delivery. A delivery that already succeeded is refused
  // (DELIVERY_ALREADY_SUCCEEDED): the integrator acted on that event once.
  replayWebhookDelivery: (projectID: string, deliveryID: string, csrf: string) =>
    req<{ status: string }>(`/projects/${projectID}/webhooks/deliveries/${deliveryID}/replay`, {
      method: 'POST', csrf,
    }),

  // Deleting and disabling answer different questions. Disabling stops
  // deliveries to an endpoint that is real; deleting is for one that should not
  // be in the list at all — a URL typed wrong, a service that no longer exists.
  // An endpoint that has delivered is refused (ENDPOINT_HAS_DELIVERIES): its
  // delivery history is not the endpoint's to take with it.
  deleteWebhookEndpoint: (projectID: string, endpointID: string, csrf: string) =>
    req<void>(`/projects/${projectID}/webhooks/endpoints/${endpointID}`, { method: 'DELETE', csrf }),

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
