export class AdminApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'AdminApiError';
  }
  get isNotFound()     { return this.status === 404; }
  get isUnauthorized() { return this.status === 401; }
}

// ---------------------------------------------------------------------------
// Domain types — admin responses are pass-through from the Rust core.
// ---------------------------------------------------------------------------

export interface Settlement {
  id:                string;
  merchant_id:       string;
  wallet_id:         string;
  currency:          string;
  status:            'PENDING' | 'SUBMITTED' | 'SETTLED' | 'FAILED';
  gross_amount:      { amount_minor: number; currency: string };
  fee_amount:        { amount_minor: number; currency: string };
  net_amount:        { amount_minor: number; currency: string };
  transaction_count: number;
  period_start:      string;
  period_end:        string;
  created_at:        string;
  updated_at:        string;
}

export interface SettlementList {
  data: Settlement[];
}

/** Operator pricing rule (Banzami ADR-021). The only place a fee percentage
 *  lives. `rate_bps` is basis points (200 = 2.00%); operator policy only. */
export interface PricingRule {
  id:                 string;
  rule_key:           string;
  version:            number;
  environment:        'LIVE' | 'SANDBOX';
  enabled:            boolean;
  business_category:  string | null;
  pricing_profile:    string | null;
  fee_policy_ref:     string | null;
  currency:           string | null;
  country:            string | null;
  rate_bps:           number;
  flat_minor:         number;
  min_fee_minor:      number | null;
  max_fee_minor:      number | null;
  rounding:           'HALF_UP' | 'HALF_EVEN' | 'FLOOR' | 'CEIL';
  priority:           number;
  effective_from:     string;
  effective_to:       string | null;
  description:        string | null;
  /** True once the rule has priced real money — it becomes immutable (edits
   *  create a new version instead). */
  used:               boolean;
  created_at:         string;
  updated_at:         string;
}

/** Editable fields for create/update. Never includes a computed fee. */
export interface PricingRuleInput {
  rule_key:           string;
  environment:        'LIVE' | 'SANDBOX';
  business_category?: string | null;
  pricing_profile?:   string | null;
  fee_policy_ref?:    string | null;
  currency?:          string | null;
  country?:           string | null;
  rate_bps:           number;
  flat_minor:         number;
  min_fee_minor?:     number | null;
  max_fee_minor?:     number | null;
  rounding:           'HALF_UP' | 'HALF_EVEN' | 'FLOOR' | 'CEIL';
  priority?:          number;
  effective_from?:    string | null;
  effective_to?:      string | null;
  description?:       string | null;
}

export interface PricingRuleFilters {
  environment?:       string;
  business_category?: string;
  pricing_profile?:   string;
  currency?:          string;
  rule_key?:          string;
  status?:            'enabled' | 'disabled';
}

/** An applied operator fee (read-only audit; ADR-021). Immutable. */
export interface OperatorFee {
  id:                   string;
  transaction_id:       string;
  merchant_id:          string;
  payment_intent_id:    string | null;
  source_transfer_id:   string | null;
  posting_id:           string;
  gross_minor:          number;
  fee_minor:            number;
  net_minor:            number;
  currency:             string;
  business_category:    string | null;
  pricing_profile:      string | null;
  fee_policy_ref:       string | null;
  pricing_rule_id:      string | null;
  pricing_rule_version: number | null;
  engine_version:       number;
  snapshot_json:        Record<string, unknown>;
  status:               string;
  environment:          string;
  created_at:           string;
  settled_at:           string | null;
}

export interface OperatorFeeFilters {
  environment?:       string;
  currency?:          string;
  business_category?: string;
  pricing_profile?:   string;
  pricing_rule_id?:   string;
  transaction_id?:    string;
  status?:            string;
  from?:              string;
  to?:                string;
}

interface Amount { amount_minor: number; currency: string }

/** A deferred application settlement (ADR-021). */
export interface ApplicationSettlement {
  id:                          string;
  owner_ref:                   string;
  application_id:              string | null;
  source_account_id:           string;
  beneficiary_account_id:      string;
  application_fee_account_id:  string | null;
  gross_amount:                Amount;
  application_fee:             Amount;
  net_amount:                  Amount;
  currency:                    string;
  business_category:           string | null;
  pricing_profile:             string | null;
  fee_policy_ref:              string | null;
  pricing_rule_id:             string | null;
  pricing_rule_version:        number | null;
  engine_version:              number;
  pricing_snapshot_json:       Record<string, unknown>;
  status:                      'CREATED' | 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  settlement_posting_id:       string | null;
  fee_posting_id:              string | null;
  environment:                 string;
  created_at:                  string;
  completed_at:                string | null;
  cancelled_at:                string | null;
  failed_at:                   string | null;
  failure_reason:              string | null;
}

export interface AppSettlementFilters {
  owner_ref?:         string;
  status?:            string;
  currency?:          string;
  business_category?: string;
  pricing_profile?:   string;
  environment?:       string;
  from?:              string;
  to?:                string;
}

/** One aggregation bucket: `{ key, count, total_minor }`. */
export interface FeeBucket {
  key:         string | null;
  count:       number;
  total_minor: number;
}

/** Read-only finance dashboard aggregations (ADR-021). */
export interface FinanceDashboard {
  window:      { from: string; to: string };
  environment: string | null;
  currency:    string | null;
  operator_fees: {
    today:                FeeBucket[];
    month:                FeeBucket[];
    by_currency:          FeeBucket[];
    by_business_category: FeeBucket[];
    by_pricing_profile:   FeeBucket[];
    by_day:               FeeBucket[];
  };
  application_settlements: {
    today_count:   number;
    pending_count: number;
    failed_count:  number;
    by_status:     FeeBucket[];
  };
}

export interface FinanceDashboardFilters {
  environment?: string;
  currency?:    string;
  from?:        string;
  to?:          string;
}

/** A pricing-catalog entry (pricing profile OR fee policy; ADR-021). Reference
 *  only — carries NO percentages. */
export interface CatalogEntry {
  id:          string;
  code:        string;
  name:        string;
  description: string | null;
  enabled:     boolean;
  environment: 'LIVE' | 'SANDBOX';
  metadata:    Record<string, unknown>;
  created_at:  string;
  updated_at:  string;
}

export interface CatalogInput {
  code:         string;
  name:         string;
  description?: string | null;
  environment:  'LIVE' | 'SANDBOX';
  metadata?:    Record<string, unknown>;
}

export interface CatalogFilters {
  environment?: string;
  status?:      'enabled' | 'disabled';
  code?:        string;
}

export interface Payout {
  id:          string;
  merchant_id: string;
  wallet_id:   string;
  amount:      { amount_minor: number; currency: string };
  status:      'PENDING' | 'PROCESSING' | 'SENT' | 'CONFIRMED' | 'FAILED' | 'RETURNED';
  destination: { account_number: string; bank_code: string; account_holder_name: string };
  created_at:  string;
}

export interface PayoutList {
  data: Payout[];
}

export interface MerchantCompliance {
  merchant_id:  string;
  kyb_status:   'PENDING' | 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW' | 'SUSPENDED';
  aml_status:   'PENDING' | 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW' | 'SUSPENDED';
  notes?:       string;
  reviewed_at?: string;
  created_at:   string;
  updated_at:   string;
}

export interface Merchant {
  id:         string;
  name:       string;
  email:      string;
  status:     string;
  verified:   boolean;
  created_at: string;
}

export interface Wallet {
  id:                   string;
  merchant_id:          string;
  currency:             string;
  status:               'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  available_account_id: string;
  reserved_account_id:  string;
  created_at:           string;
}

export interface AdminCreditResult {
  wallet_id:    string;
  currency:     string;
  amount_minor: number;
  new_balance:  number;
}

export type VerificationBadge = 'CONSUMER' | 'MERCHANT';

export interface Consumer {
  id:                  string;
  handle:              string;
  display_name:        string | null;
  status:              string;
  verification_badge:  VerificationBadge | null;
  created_at:          string;
}

export interface RiskFlag {
  id:          string;
  entity_type: 'MERCHANT' | 'CONSUMER';
  entity_id:   string;
  flag_type:   string;
  severity:    'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  resolved:    boolean;
  created_at:  string;
  resolved_at?:        string | null;
  resolved_by?:        string | null;
  resolution?:         'APPROVED' | 'REJECTED' | null;
  resolution_seconds?: number | null;
}

export interface AuditEntry {
  id:         string;
  actor:      string;
  action:     string;
  subject:    string;
  metadata:   Record<string, unknown>;
  request_id: string | null;
  created_at: string;
}

export interface AcquiringReconRun {
  id:                       string;
  reconciliation_date:      string;
  status:                   'RUNNING' | 'COMPLETED' | 'FAILED';
  total_callbacks:          number;
  matched:                  number;
  missing_posting:          number;
  amount_mismatch:          number;
  total_discrepancy_minor:  number;
  started_at:               string;
  completed_at?:            string;
  items?:                   AcquiringReconItem[];
}

export interface AcquiringReconItem {
  id:                     string;
  callback_id:            string;
  acquiring_payment_id:   string | null;
  status:                 'MATCHED' | 'MISSING_POSTING' | 'AMOUNT_MISMATCH' | 'DUPLICATE';
  callback_amount_minor:  number | null;
  ledger_amount_minor:    number | null;
  external_ref:           string;
  discrepancy_minor:      number;
  reconciled_at:          string;
}

export interface AdminDispute {
  id:                string;
  transaction_id:    string;
  merchant_id:       string;
  consumer_id:       string;
  amount_minor:      number;
  currency:          string;
  reason:            string;
  status:            string;
  evidence_deadline: string | null;
  resolution_notes:  string | null;
  created_at:        string;
  updated_at:        string;
  resolved_at:       string | null;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

// Fixed Admin API base — never user input. Default = production admin host.
export const ADMIN_API_BASE = (
  process.env.NEXT_PUBLIC_ADMIN_API_URL ?? 'https://admin.banzami.com/api'
).replace(/\/+$/, '');

export interface AuthedUser {
  id:        string;
  email:     string;
  full_name: string;
  role:      string;
}

/** Operator login (unauthenticated). Throws AdminApiError on bad credentials. */
/**
 * What login returns now.
 *
 * A correct password no longer produces a session. It produces a CHALLENGE —
 * either "prove your second factor" or, for an operator who has none yet,
 * "enrol one". The session comes from the second step and nowhere else, so this
 * type has no `token` on the challenge branch: there is nothing to save.
 */
export type LoginResult =
  | { kind: 'session'; token: string; expires_at: string; user: AuthedUser }
  | { kind: 'mfa'; enrolled: boolean; challenge_token: string; expires_at: string };

export async function adminLoginStep1(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${ADMIN_API_BASE}/admin/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    throw new AdminApiError(res.status, b.error?.code ?? 'UNAUTHORIZED', b.error?.message ?? 'invalid credentials');
  }
  const j = (await res.json()) as Record<string, unknown>;
  if (j.mfa_required) {
    return {
      kind: 'mfa',
      enrolled: !!j.mfa_enrolled,
      challenge_token: String(j.challenge_token),
      expires_at: String(j.expires_at),
    };
  }
  return { kind: 'session', token: String(j.token), expires_at: String(j.expires_at), user: j.user as AuthedUser };
}

/** Begin TOTP enrolment. The secret and its URI are returned once. */
export async function adminMfaEnrol(challengeToken: string): Promise<{ secret: string; otpauth_uri: string }> {
  return mfaCall('/admin/v1/auth/mfa/enrol', challengeToken, undefined);
}

/** Confirm enrolment with the first code. Completes the login and returns the recovery codes once. */
export async function adminMfaConfirm(
  challengeToken: string,
  code: string,
): Promise<{ token: string; expires_at: string; user: AuthedUser; recovery_codes: string[] }> {
  return mfaCall('/admin/v1/auth/mfa/enrol/confirm', challengeToken, { code });
}

/** Complete a challenge with a TOTP or a recovery code. */
export async function adminMfaVerify(
  challengeToken: string,
  code: string,
): Promise<{ token: string; expires_at: string; user: AuthedUser }> {
  return mfaCall('/admin/v1/auth/mfa/verify', challengeToken, { code });
}

async function mfaCall<T>(path: string, challengeToken: string, body: unknown): Promise<T> {
  const res = await fetch(`${ADMIN_API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${challengeToken}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { code?: string; message?: string } };
  if (!res.ok) {
    throw new AdminApiError(res.status, j.error?.code ?? 'MFA_FAILED', j.error?.message ?? 'the code did not verify');
  }
  return j as T;
}

export async function adminLogin(
  email: string,
  password: string,
): Promise<{ token: string; expires_at: string; user: AuthedUser }> {
  const res = await fetch(`${ADMIN_API_BASE}/admin/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    throw new AdminApiError(res.status, b.error?.code ?? 'UNAUTHORIZED', b.error?.message ?? 'invalid credentials');
  }
  return res.json();
}

/** Validate a password-reset token (public — the operator has no session). */
export async function adminValidateResetToken(
  token: string,
): Promise<{ reason: string; valid: boolean; full_name?: string }> {
  const res = await fetch(`${ADMIN_API_BASE}/admin/v1/auth/password-reset/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return res.json();
}

/** Set a new password from a reset token (public). Throws AdminApiError. */
export async function adminCompleteReset(token: string, newPassword: string): Promise<void> {
  const res = await fetch(`${ADMIN_API_BASE}/admin/v1/auth/password-reset/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    throw new AdminApiError(res.status, b.error?.code ?? 'ERROR', b.error?.message ?? 'failed');
  }
}

export class AdminApi {
  private readonly base: string;
  private readonly token: string;

  constructor(token: string) {
    this.base = ADMIN_API_BASE;
    this.token = token;
  }

  // Operator session
  me(): Promise<{ user: AuthedUser }> {
    return this.req('/admin/v1/auth/me');
  }
  logout(): Promise<void> {
    return this.req('/admin/v1/auth/logout', { method: 'POST' });
  }
  // Operator changes their own password. A wrong current password is a 400
  // (code INVALID_CURRENT_PASSWORD), so it does NOT trip the 401 auto-logout.
  changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
    return this.req('/admin/v1/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      // A 401 must only end the session when the session is ACTUALLY dead — not
      // because one (possibly misconfigured/degraded) endpoint returned 401. A
      // single failing badge endpoint (e.g. notifications/summary proxying to a
      // gateway) previously logged the operator straight back out. So: for the
      // session-check endpoint itself, trust the 401 and log out; for any other
      // endpoint, re-validate the token via /auth/me first and only log out if
      // THAT also returns 401. Network errors never force a logout.
      if (res.status === 401 && typeof window !== 'undefined') {
        const logout = () => {
          try { localStorage.removeItem('banzami_admin_session'); } catch { /* ignore */ }
          if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
        };
        if (path.startsWith('/admin/v1/auth/me')) {
          logout();
        } else {
          try {
            const check = await fetch(`${this.base}/admin/v1/auth/me`, {
              headers: { 'Authorization': `Bearer ${this.token}` },
            });
            if (check.status === 401) logout();
          } catch { /* network hiccup — keep the session */ }
        }
      }
      let code = 'UNKNOWN', message = res.statusText;
      try {
        const b = await res.json() as { error?: { code?: string; message?: string } };
        code    = b.error?.code    ?? code;
        message = b.error?.message ?? message;
      } catch { /* ignore */ }
      throw new AdminApiError(res.status, code, message);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  // Merchants
  listMerchants(search?: string): Promise<{ data: Merchant[] }> {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.req(`/admin/v1/merchants${q}`);
  }
  getMerchant(id: string): Promise<Merchant> { return this.req(`/admin/v1/merchants/${id}`); }
  /**
   * Put a Business Account on a pricing profile — what that customer is charged.
   *
   * Not a plain setter: the model resolves exactly one rule from (assigned
   * profile, operation), so this single value is the whole answer, and a rate
   * changed by accident is invisible until an invoice is wrong. The server
   * requires a reason and the profile code typed back, and records before/after
   * in the audit trail.
   */
  assignMerchantPricingProfile(
    id: string,
    profileCode: string,
    reason: string,
  ): Promise<{ merchant_id: string; profile_code: string; environment: string }> {
    return this.req(`/admin/v1/merchants/${id}/pricing-profile`, {
      method: 'PUT',
      body: JSON.stringify({ profile_code: profileCode, confirmation_text: profileCode, reason }),
    });
  }
  deleteMerchant(id: string): Promise<void>   { return this.req(`/admin/v1/merchants/${id}`, { method: 'DELETE' }); }
  setMerchantVerified(id: string, verified: boolean): Promise<Merchant> {
    return this.req(`/admin/v1/merchants/${id}/verified`, { method: 'PATCH', body: JSON.stringify({ verified }) });
  }

  createMerchant(name: string, email: string, currency = 'AOA', sandbox = false): Promise<{
    merchant: Merchant;
    api_key:  { secret: string; key: { id: string; key_prefix: string } };
    wallet:   { id: string; currency: string };
  }> {
    return this.req('/admin/v1/merchants', { method: 'POST', body: JSON.stringify({ name, email, currency, sandbox }) });
  }

  createApiKey(merchantId: string, keyName: string): Promise<{ secret: string; key: { id: string } }> {
    return this.req(`/admin/v1/merchants/${merchantId}/api-keys`, { method: 'POST', body: JSON.stringify({ name: keyName }) });
  }

  resendCredentials(merchantId: string): Promise<{
    merchant: Merchant;
    api_key:  { secret: string; key: { id: string; key_prefix: string } };
    wallet:   { id: string; currency: string };
  }> {
    return this.req(`/admin/v1/merchants/${merchantId}/resend-credentials`, { method: 'POST' });
  }

  // Compliance
  getMerchantCompliance(id: string):  Promise<MerchantCompliance> { return this.req(`/admin/v1/compliance/merchants/${id}`); }

  approveMerchant(id: string):        Promise<MerchantCompliance> {
    return this.req(`/admin/v1/compliance/merchants/${id}/approve`, { method: 'POST' });
  }
  rejectMerchant(id: string, notes: string): Promise<MerchantCompliance> {
    return this.req(`/admin/v1/compliance/merchants/${id}/reject`, {
      method: 'POST', body: JSON.stringify({ notes }),
    });
  }
  suspendMerchant(id: string, notes: string): Promise<MerchantCompliance> {
    return this.req(`/admin/v1/compliance/merchants/${id}/suspend`, {
      method: 'POST', body: JSON.stringify({ notes }),
    });
  }
  flagAML(id: string, notes: string): Promise<MerchantCompliance> {
    return this.req(`/admin/v1/compliance/merchants/${id}/flag-aml`, {
      method: 'POST', body: JSON.stringify({ notes }),
    });
  }

  // Settlements
  listAllSettlements(status?: string):            Promise<SettlementList> {
    const qs = status ? `?status=${status}` : '';
    return this.req(`/admin/v1/settlements/all${qs}`);
  }
  listSettlements(merchantId: string):            Promise<SettlementList> {
    return this.req(`/admin/v1/settlements?merchant_id=${merchantId}`);
  }
  getSettlement(id: string):                      Promise<Settlement>     { return this.req(`/admin/v1/settlements/${id}`); }
  createSettlement(body: Record<string, unknown>):Promise<Settlement>     {
    return this.req('/admin/v1/settlements', { method: 'POST', body: JSON.stringify(body) });
  }
  submitSettlement(id: string):                   Promise<Settlement>     {
    return this.req(`/admin/v1/settlements/${id}/submit`, { method: 'POST' });
  }
  confirmSettlement(id: string):                  Promise<Settlement>     {
    return this.req(`/admin/v1/settlements/${id}/confirm`, { method: 'POST' });
  }
  failSettlement(id: string, reason: string):     Promise<Settlement>     {
    return this.req(`/admin/v1/settlements/${id}/fail`, { method: 'POST', body: JSON.stringify({ reason }) });
  }

  // Finance — Pricing Rules (Banzami ADR-021). View is broad; mutations are
  // SUPER_ADMIN-only and fully audited server-side.
  listPricingRules(filters: PricingRuleFilters = {}): Promise<{ data: PricingRule[] }> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) q.set(k, String(v));
    const qs = q.toString();
    return this.req(`/admin/v1/finance/pricing-rules${qs ? `?${qs}` : ''}`);
  }
  getPricingRule(id: string): Promise<PricingRule> {
    return this.req(`/admin/v1/finance/pricing-rules/${id}`);
  }
  getPricingRuleVersions(id: string): Promise<{ data: PricingRule[] }> {
    return this.req(`/admin/v1/finance/pricing-rules/${id}/versions`);
  }
  createPricingRule(body: PricingRuleInput): Promise<PricingRule> {
    return this.req('/admin/v1/finance/pricing-rules', { method: 'POST', body: JSON.stringify(body) });
  }
  updatePricingRule(id: string, body: PricingRuleInput): Promise<PricingRule> {
    return this.req(`/admin/v1/finance/pricing-rules/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  disablePricingRule(id: string): Promise<PricingRule> {
    return this.req(`/admin/v1/finance/pricing-rules/${id}/disable`, { method: 'POST' });
  }
  enablePricingRule(id: string): Promise<PricingRule> {
    return this.req(`/admin/v1/finance/pricing-rules/${id}/enable`, { method: 'POST' });
  }
  duplicatePricingRule(id: string, ruleKey: string): Promise<PricingRule> {
    return this.req(`/admin/v1/finance/pricing-rules/${id}/duplicate`, {
      method: 'POST', body: JSON.stringify({ rule_key: ruleKey }),
    });
  }

  // Finance — Pricing catalogs (profiles + fee policies). Read = pricing.view;
  // mutations = pricing.manage. Reference catalogs only (no percentages).
  private catalogList(resource: string, f: CatalogFilters): Promise<{ data: CatalogEntry[] }> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) q.set(k, String(v));
    const qs = q.toString();
    return this.req(`/admin/v1/finance/${resource}${qs ? `?${qs}` : ''}`);
  }
  private catalogCreate(resource: string, body: CatalogInput): Promise<CatalogEntry> {
    return this.req(`/admin/v1/finance/${resource}`, { method: 'POST', body: JSON.stringify(body) });
  }
  private catalogUpdate(resource: string, id: string, body: CatalogInput): Promise<CatalogEntry> {
    return this.req(`/admin/v1/finance/${resource}/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  private catalogEnabled(resource: string, id: string, enabled: boolean): Promise<CatalogEntry> {
    return this.req(`/admin/v1/finance/${resource}/${id}/${enabled ? 'enable' : 'disable'}`, { method: 'POST' });
  }

  listPricingProfiles(f: CatalogFilters = {}): Promise<{ data: CatalogEntry[] }> { return this.catalogList('pricing-profiles', f); }
  createPricingProfile(b: CatalogInput): Promise<CatalogEntry> { return this.catalogCreate('pricing-profiles', b); }
  updatePricingProfile(id: string, b: CatalogInput): Promise<CatalogEntry> { return this.catalogUpdate('pricing-profiles', id, b); }
  setPricingProfileEnabled(id: string, e: boolean): Promise<CatalogEntry> { return this.catalogEnabled('pricing-profiles', id, e); }

  listFeePolicies(f: CatalogFilters = {}): Promise<{ data: CatalogEntry[] }> { return this.catalogList('fee-policies', f); }
  createFeePolicy(b: CatalogInput): Promise<CatalogEntry> { return this.catalogCreate('fee-policies', b); }
  updateFeePolicy(id: string, b: CatalogInput): Promise<CatalogEntry> { return this.catalogUpdate('fee-policies', id, b); }
  setFeePolicyEnabled(id: string, e: boolean): Promise<CatalogEntry> { return this.catalogEnabled('fee-policies', id, e); }

  // Finance — Dashboard (read-only aggregates).
  getFinanceDashboard(filters: FinanceDashboardFilters = {}): Promise<FinanceDashboard> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) q.set(k, String(v));
    const qs = q.toString();
    return this.req(`/admin/v1/finance/dashboard${qs ? `?${qs}` : ''}`);
  }

  // Finance — Operator Fees (read-only audit).
  listOperatorFees(filters: OperatorFeeFilters = {}): Promise<{ data: OperatorFee[] }> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) q.set(k, String(v));
    const qs = q.toString();
    return this.req(`/admin/v1/finance/operator-fees${qs ? `?${qs}` : ''}`);
  }
  getOperatorFee(id: string): Promise<OperatorFee> {
    return this.req(`/admin/v1/finance/operator-fees/${id}`);
  }

  // Finance — Application Settlements (read + cancel/fail when state permits).
  listAppSettlements(filters: AppSettlementFilters = {}): Promise<{ data: ApplicationSettlement[] }> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) q.set(k, String(v));
    const qs = q.toString();
    return this.req(`/admin/v1/finance/application-settlements${qs ? `?${qs}` : ''}`);
  }
  getAppSettlement(id: string): Promise<ApplicationSettlement> {
    return this.req(`/admin/v1/finance/application-settlements/${id}`);
  }
  cancelAppSettlement(id: string): Promise<ApplicationSettlement> {
    return this.req(`/admin/v1/finance/application-settlements/${id}/cancel`, { method: 'POST' });
  }
  failAppSettlement(id: string, reason: string): Promise<ApplicationSettlement> {
    return this.req(`/admin/v1/finance/application-settlements/${id}/fail`, {
      method: 'POST', body: JSON.stringify({ reason }),
    });
  }

  // Payouts
  listAllPayouts(status?: string):              Promise<PayoutList> {
    const qs = status ? `?status=${status}` : '';
    return this.req(`/admin/v1/payouts/all${qs}`);
  }
  listPayouts(merchantId: string):              Promise<PayoutList> {
    return this.req(`/admin/v1/payouts?merchant_id=${merchantId}`);
  }
  getPayout(id: string):                        Promise<Payout> { return this.req(`/admin/v1/payouts/${id}`); }
  processPayout(id: string):                    Promise<Payout> {
    return this.req(`/admin/v1/payouts/${id}/process`, { method: 'POST' });
  }
  markPayoutSent(id: string):                   Promise<Payout> {
    return this.req(`/admin/v1/payouts/${id}/sent`, { method: 'POST' });
  }
  confirmPayout(id: string):                    Promise<Payout> {
    return this.req(`/admin/v1/payouts/${id}/confirm`, { method: 'POST' });
  }
  failPayout(id: string, reason: string):       Promise<Payout> {
    return this.req(`/admin/v1/payouts/${id}/fail`, { method: 'POST', body: JSON.stringify({ reason }) });
  }
  markPayoutReturned(id: string, reason: string): Promise<Payout> {
    return this.req(`/admin/v1/payouts/${id}/returned`, { method: 'POST', body: JSON.stringify({ reason }) });
  }

  // Wallets
  getWallet(merchantId: string, currency = 'AOA'): Promise<Wallet> {
    return this.req(`/admin/v1/wallets?merchant_id=${encodeURIComponent(merchantId)}&currency=${encodeURIComponent(currency)}`);
  }
  adminCreditWallet(walletId: string, amountMinor: number, reason: string, currency = 'AOA'): Promise<AdminCreditResult> {
    return this.req(`/admin/v1/wallets/${walletId}/credit`, {
      method: 'POST',
      body:   JSON.stringify({ amount_minor: amountMinor, currency, reason }),
    });
  }

  // Consumers
  listConsumers(handle?: string): Promise<{ data: Consumer[] }> {
    const q = handle ? `?handle=${encodeURIComponent(handle)}` : '';
    return this.req(`/admin/v1/consumers${q}`);
  }
  getConsumer(id: string): Promise<Consumer> { return this.req(`/admin/v1/consumers/${id}`); }
  suspendConsumer(id: string, notes: string): Promise<Consumer> {
    return this.req(`/admin/v1/consumers/${id}/suspend`, {
      method: 'POST',
      body:   JSON.stringify({ notes: notes || null }),
    });
  }
  setConsumerBadge(id: string, badge: VerificationBadge | null): Promise<Consumer> {
    return this.req(`/admin/v1/consumers/${id}/badge`, {
      method: 'PATCH',
      body:   JSON.stringify({ badge }),
    });
  }

  // Reconciliation (settlement-level)
  runReconciliation(): Promise<Record<string, unknown>> {
    return this.req('/admin/v1/reconciliation/run', { method: 'POST', body: JSON.stringify({}) });
  }

  // Risk — freeze/unfreeze
  freezeAccount(entityType: 'MERCHANT' | 'CONSUMER', entityId: string, reason: string): Promise<Record<string, unknown>> {
    return this.req('/admin/v1/risk/freeze', {
      method: 'POST',
      body:   JSON.stringify({ entity_type: entityType, entity_id: entityId, reason }),
    });
  }
  unfreezeAccount(entityType: 'MERCHANT' | 'CONSUMER', entityId: string, reason: string): Promise<Record<string, unknown>> {
    return this.req(`/admin/v1/risk/freeze/${entityType}/${entityId}`, {
      method: 'DELETE',
      body:   JSON.stringify({ reason }),
    });
  }
  listRiskFlags(resolved = false): Promise<{ data: RiskFlag[] }> {
    return this.req(`/admin/v1/risk/flags?resolved=${resolved}`);
  }

  // resolved_by is set server-side from the operator JWT.
  resolveRiskFlag(id: string, resolution: 'APPROVED' | 'REJECTED'): Promise<Record<string, unknown>> {
    return this.req(`/admin/v1/risk/flags/${id}/resolve`, {
      method: 'POST',
      body:   JSON.stringify({ resolution }),
    });
  }
  queryAuditLog(params?: { subject?: string; actor?: string; action?: string; limit?: number }): Promise<{ data: AuditEntry[] }> {
    const q = new URLSearchParams();
    if (params?.subject) q.set('subject', params.subject);
    if (params?.actor)   q.set('actor',   params.actor);
    if (params?.action)  q.set('action',  params.action);
    if (params?.limit)   q.set('limit',   String(params.limit));
    return this.req(`/admin/v1/risk/audit-log?${q.toString()}`);
  }

  // Disputes
  listDisputes(params?: { merchant_id?: string; consumer_id?: string; status?: string; limit?: number }): Promise<{ data: AdminDispute[] }> {
    const q = new URLSearchParams();
    if (params?.merchant_id)  q.set('merchant_id',  params.merchant_id);
    if (params?.consumer_id)  q.set('consumer_id',  params.consumer_id);
    if (params?.status)       q.set('status',       params.status);
    if (params?.limit)        q.set('limit',        String(params.limit));
    return this.req(`/admin/v1/disputes?${q.toString()}`);
  }
  getDispute(id: string): Promise<AdminDispute> { return this.req(`/admin/v1/disputes/${id}`); }
  resolveDispute(id: string, outcome: string, notes: string): Promise<AdminDispute> {
    return this.req(`/admin/v1/disputes/${id}/resolve`, {
      method: 'POST',
      body:   JSON.stringify({ outcome, resolution_notes: notes }),
    });
  }

  // Received wallet-native payments (canonical: wallet_payments) + receipts
  listWalletPayments(params?: {
    merchant_id?: string; status?: string; environment?: string;
    date_from?: string; date_to?: string; limit?: number; cursor?: string;
  }): Promise<WalletPaymentList> {
    const q = new URLSearchParams();
    if (params?.merchant_id) q.set('merchant_id', params.merchant_id);
    if (params?.status)      q.set('status',      params.status);
    if (params?.environment) q.set('environment', params.environment);
    if (params?.date_from)   q.set('date_from',   params.date_from);
    if (params?.date_to)     q.set('date_to',     params.date_to);
    if (params?.limit)       q.set('limit',       String(params.limit));
    if (params?.cursor)      q.set('cursor',      params.cursor);
    return this.req(`/admin/v1/wallet-payments?${q.toString()}`);
  }

  /** Fetches the official transaction receipt PDF (auth Bearer) as a Blob. */
  async fetchReceiptPdf(id: string): Promise<Blob> {
    const res = await fetch(`${this.base}/admin/v1/transactions/${id}/receipt.pdf`, {
      headers: { 'Authorization': `Bearer ${this.token}` },
    });
    if (!res.ok) {
      throw new AdminApiError(res.status, 'RECEIPT_ERROR', 'Não foi possível obter o comprovativo.');
    }
    return res.blob();
  }

  // Acquiring reconciliation
  runAcquiringReconciliation(date?: string): Promise<AcquiringReconRun> {
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.req(`/admin/v1/risk/acquiring-recon${q}`, { method: 'POST' });
  }
  listAcquiringReconciliationRuns(): Promise<{ data: AcquiringReconRun[] }> {
    return this.req('/admin/v1/risk/acquiring-recon');
  }
  getAcquiringReconciliationRun(runId: string): Promise<AcquiringReconRun> {
    return this.req(`/admin/v1/risk/acquiring-recon/${runId}`);
  }

  // Operators (BANZADMIN access management). Mutations require SUPER_ADMIN
  // (enforced server-side). No password material is ever returned.
  listOperators(): Promise<{ operators: Operator[] }> {
    return this.req('/admin/v1/operators');
  }
  // Creating an operator also issues an INVITE link. invite_url is present only
  // in dry-run / SMTP-off (so the SUPER_ADMIN can deliver it).
  createOperator(email: string, fullName: string, role: OperatorRole): Promise<{ operator: Operator; email_sent_to: string; expires_at: string; invite_url?: string }> {
    return this.req('/admin/v1/operators', { method: 'POST', body: JSON.stringify({ email, full_name: fullName, role }) });
  }
  resendOperatorInvite(id: string): Promise<{ ok: boolean; expires_at: string; email_sent_to: string; invite_url?: string }> {
    return this.req(`/admin/v1/operators/${id}/resend-invite`, { method: 'POST' });
  }
  updateOperatorName(id: string, fullName: string): Promise<Operator> {
    return this.req(`/admin/v1/operators/${id}`, { method: 'PATCH', body: JSON.stringify({ full_name: fullName }) });
  }
  setOperatorRole(id: string, role: OperatorRole): Promise<Operator> {
    return this.req(`/admin/v1/operators/${id}/role`, { method: 'POST', body: JSON.stringify({ role }) });
  }
  suspendOperator(id: string): Promise<Operator> {
    return this.req(`/admin/v1/operators/${id}/suspend`, { method: 'POST' });
  }
  activateOperator(id: string): Promise<Operator> {
    return this.req(`/admin/v1/operators/${id}/activate`, { method: 'POST' });
  }
  // SUPER_ADMIN issues a set/reset-password link. reset_url is present only when
  // email is dry-run/off, so the operator can deliver it manually.
  requestOperatorPasswordReset(id: string): Promise<{ ok: boolean; expires_at: string; email_sent_to: string; reset_url?: string }> {
    return this.req(`/admin/v1/operators/${id}/password-reset`, { method: 'POST' });
  }
  // Revoke every session of another operator (increments their token_version).
  terminateOperatorSessions(id: string): Promise<{ ok: boolean }> {
    return this.req(`/admin/v1/operators/${id}/terminate-sessions`, { method: 'POST' });
  }
  // Revoke all of MY own sessions (including the current one). The next request
  // with the old token is rejected, so callers should clear the local session.
  terminateMySessions(): Promise<{ ok: boolean }> {
    return this.req('/admin/v1/auth/terminate-sessions', { method: 'POST' });
  }

  // Merchant applications (Business onboarding / Track 1). approve/reject never
  // return the activation token, API key or PIN — the admin-api strips them.
  listApplications(status?: string, environment?: string): Promise<{ applications: MerchantApplication[] }> {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (environment) q.set('environment', environment);
    const qs = q.toString();
    return this.req(`/admin/v1/merchant-applications${qs ? `?${qs}` : ''}`);
  }
  getApplication(id: string): Promise<MerchantApplication> {
    return this.req(`/admin/v1/merchant-applications/${id}`);
  }
  // Attribution (reviewed_by) is set server-side from the operator JWT.
  approveApplication(id: string): Promise<{ status: string; handle: string; email_sent_to: string }> {
    return this.req(`/admin/v1/merchant-applications/${id}/approve`, { method: 'POST' });
  }
  rejectApplication(id: string, adminNotes: string, merchantMessage: string): Promise<{ status: string; email_sent_to: string }> {
    return this.req(`/admin/v1/merchant-applications/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ admin_notes: adminNotes, merchant_message: merchantMessage }),
    });
  }

  // KYB documents (Track 3). On 503 STORAGE_NOT_CONFIGURED the caller should
  // show the "storage not configured" notice (see isStorageNotConfigured).
  listApplicationDocuments(id: string): Promise<{ data: KybDocument[] }> {
    return this.req(`/admin/v1/merchant-applications/${id}/documents`);
  }
  createDocumentReadURL(id: string, documentId: string): Promise<{ read_url: string; expires_at: string }> {
    return this.req(`/admin/v1/merchant-applications/${id}/documents/${documentId}/read-url`, { method: 'POST' });
  }
  acceptDocument(id: string, documentId: string): Promise<KybDocument> {
    return this.req(`/admin/v1/merchant-applications/${id}/documents/${documentId}/accept`, { method: 'POST' });
  }
  rejectDocument(id: string, documentId: string, reason: string): Promise<KybDocument> {
    return this.req(`/admin/v1/merchant-applications/${id}/documents/${documentId}/reject`, {
      method: 'POST', body: JSON.stringify({ reason }),
    });
  }

  // Merchant KYB documents (post-approval, maintained inside the Business app —
  // distinct from the application docs above). The list carries short-TTL signed
  // download URLs; storage_key is never exposed.
  // Merchant-centric KYB queue: one row per merchant with document aggregates.
  listMerchantKybMerchants(environment?: string, limit?: number): Promise<{ merchants: MerchantKybSummary[] }> {
    const qs = new URLSearchParams();
    if (limit) qs.set('limit', String(limit));
    if (environment) qs.set('environment', environment);
    const q = qs.toString();
    return this.req(`/admin/v1/merchant-kyb/merchants${q ? `?${q}` : ''}`);
  }
  // All current KYB documents for one merchant (for the merchant review drawer).
  getMerchantKybDocuments(merchantId: string, environment?: string): Promise<{ documents: MerchantKybDoc[] }> {
    const q = environment === 'SANDBOX' ? '?environment=SANDBOX' : '';
    return this.req(`/admin/v1/merchant-kyb/merchants/${merchantId}/documents${q}`);
  }
  listMerchantKybDocuments(status?: string, limit?: number, environment?: string): Promise<{ documents: MerchantKybDoc[] }> {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (limit) qs.set('limit', String(limit));
    if (environment) qs.set('environment', environment);
    const q = qs.toString();
    return this.req(`/admin/v1/merchant-kyb/documents${q ? `?${q}` : ''}`);
  }
  approveMerchantKybDocument(id: string, opts?: { validUntil?: string; notes?: string }, environment?: string): Promise<{ status: string }> {
    const q = environment ? `?environment=${environment}` : '';
    const body: Record<string, string> = {};
    if (opts?.validUntil) body.valid_until = opts.validUntil;
    if (opts?.notes) body.notes = opts.notes;
    return this.req(`/admin/v1/merchant-kyb/documents/${id}/approve${q}`, {
      method: 'POST', body: JSON.stringify(body),
    });
  }
  rejectMerchantKybDocument(id: string, reason: string, opts?: { notes?: string }, environment?: string): Promise<{ status: string }> {
    const q = environment ? `?environment=${environment}` : '';
    const body: Record<string, string> = { rejection_reason: reason };
    if (opts?.notes) body.notes = opts.notes;
    return this.req(`/admin/v1/merchant-kyb/documents/${id}/reject${q}`, {
      method: 'POST', body: JSON.stringify(body),
    });
  }

  // Full operator context for the review drawer (merchant + representative +
  // company). Backed by merchants + merchant_compliance + merchant_profiles +
  // merchant_applications. storage_key is never part of this payload.
  getMerchantKybContext(merchantId: string, environment?: string): Promise<MerchantKybContext> {
    const q = environment === 'SANDBOX' ? '?environment=SANDBOX' : '';
    return this.req(`/admin/v1/merchant-kyb/merchants/${merchantId}/context${q}`);
  }
  // Immutable KYB event timeline (newest-first) from merchant_kyb_events.
  getMerchantKybTimeline(merchantId: string, environment?: string): Promise<{ events: KybTimelineEvent[] }> {
    const q = environment === 'SANDBOX' ? '?environment=SANDBOX' : '';
    return this.req(`/admin/v1/merchant-kyb/merchants/${merchantId}/timeline${q}`);
  }
  // Mints a short-TTL signed GET on demand. The URL is never persisted; the access
  // (view/download/copy) is audited server-side. storage_key is never returned.
  mintMerchantKybReadUrl(id: string, intent: 'view' | 'download' | 'copy', environment?: string): Promise<{ download_url: string }> {
    const q = environment ? `?environment=${environment}` : '';
    return this.req(`/admin/v1/merchant-kyb/documents/${id}/read-url${q}`, {
      method: 'POST', body: JSON.stringify({ intent }),
    });
  }

  // Operator review-queue summary for the sidebar badges + bell unread count.
  getNotificationSummary(environment?: string): Promise<NotificationSummary> {
    const q = environment === 'SANDBOX' ? '?environment=SANDBOX' : '';
    return this.req(`/admin/v1/notifications/summary${q}`);
  }
  // ── Transaction proofs — read-only (ADR-040) ───────────────────────────────
  listProofs(q?: string, environment?: string): Promise<{ proofs: AdminProof[] }> {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (environment) qs.set('environment', environment);
    const s = qs.toString();
    return this.req(`/admin/v1/proofs${s ? `?${s}` : ''}`);
  }
  getProof(ref: string, environment?: string): Promise<{ proof: AdminProof; verifications: ProofVerification[] }> {
    const q = environment === 'SANDBOX' ? '?environment=SANDBOX' : '';
    return this.req(`/admin/v1/proofs/${ref}${q}`);
  }

  // ── Platform mode (SANDBOX/LIVE) ───────────────────────────────────────────
  getPlatformMode(): Promise<PlatformMode> {
    return this.req('/admin/v1/platform/mode');
  }
  setPlatformMode(mode: 'SANDBOX' | 'LIVE', confirmationText: string, reason: string): Promise<PlatformMode> {
    return this.req('/admin/v1/platform/mode', {
      method: 'POST',
      body: JSON.stringify({ mode, confirmation_text: confirmationText, reason }),
    });
  }

  // ── Compliance Operations Console — unified case inbox (ADR-023) ───────────
  listComplianceCases(opts?: { caseType?: string; status?: string; priority?: string; risk?: string; operator?: string; q?: string; page?: number; pageSize?: number; environment?: string }): Promise<{ cases: ComplianceCase[]; total: number; page: number }> {
    const qs = new URLSearchParams();
    if (opts?.caseType) qs.set('case_type', opts.caseType);
    if (opts?.status) qs.set('status', opts.status);
    if (opts?.priority) qs.set('priority', opts.priority);
    if (opts?.risk) qs.set('risk', opts.risk);
    if (opts?.operator) qs.set('operator', opts.operator);
    if (opts?.q) qs.set('q', opts.q);
    if (opts?.page) qs.set('page', String(opts.page));
    if (opts?.pageSize) qs.set('page_size', String(opts.pageSize));
    if (opts?.environment) qs.set('environment', opts.environment);
    const q = qs.toString();
    return this.req(`/admin/v1/compliance/cases${q ? `?${q}` : ''}`);
  }
  getComplianceCase(id: string, environment?: string): Promise<ComplianceCase> {
    const q = environment === 'SANDBOX' ? '?environment=SANDBOX' : '';
    return this.req(`/admin/v1/compliance/cases/${id}${q}`);
  }
  listCaseNotes(id: string, environment?: string): Promise<{ notes: ComplianceNote[] }> {
    const q = environment === 'SANDBOX' ? '?environment=SANDBOX' : '';
    return this.req(`/admin/v1/compliance/cases/${id}/notes${q}`);
  }
  addCaseNote(id: string, body: string, environment?: string): Promise<ComplianceNote> {
    const q = environment === 'SANDBOX' ? '?environment=SANDBOX' : '';
    return this.req(`/admin/v1/compliance/cases/${id}/notes${q}`, { method: 'POST', body: JSON.stringify({ body }) });
  }
  private caseAction(id: string, action: string, environment?: string, payload?: Record<string, string>): Promise<void> {
    const q = environment === 'SANDBOX' ? '?environment=SANDBOX' : '';
    return this.req(`/admin/v1/compliance/cases/${id}/${action}${q}`, { method: 'POST', body: payload ? JSON.stringify(payload) : undefined });
  }
  assignCase(id: string, environment?: string) { return this.caseAction(id, 'assign', environment); }
  releaseCase(id: string, environment?: string) { return this.caseAction(id, 'release', environment); }
  escalateCase(id: string, environment?: string) { return this.caseAction(id, 'escalate', environment); }
  resolveCase(id: string, environment?: string) { return this.caseAction(id, 'resolve', environment); }
  transferCase(id: string, operatorId: string, operatorName: string, environment?: string) { return this.caseAction(id, 'transfer', environment, { operator_id: operatorId, operator_name: operatorName }); }
  setCasePriority(id: string, priority: string, environment?: string) { return this.caseAction(id, 'priority', environment, { priority }); }
  setCaseRisk(id: string, risk: string, environment?: string) { return this.caseAction(id, 'risk', environment, { risk }); }

  // Persistent operator notifications (bell dropdown + dashboard activity feed).
  listNotifications(opts?: { status?: string; limit?: number; environment?: string }): Promise<{ notifications: AdminNotification[] }> {
    const qs = new URLSearchParams();
    if (opts?.status) qs.set('status', opts.status);
    if (opts?.limit) qs.set('limit', String(opts.limit));
    if (opts?.environment) qs.set('environment', opts.environment);
    const q = qs.toString();
    return this.req(`/admin/v1/notifications${q ? `?${q}` : ''}`);
  }
  markNotificationRead(id: string, environment?: string): Promise<void> {
    const q = environment === 'SANDBOX' ? '?environment=SANDBOX' : '';
    return this.req(`/admin/v1/notifications/${id}/read${q}`, { method: 'POST' });
  }
  dismissNotification(id: string, environment?: string): Promise<void> {
    const q = environment === 'SANDBOX' ? '?environment=SANDBOX' : '';
    return this.req(`/admin/v1/notifications/${id}/dismiss${q}`, { method: 'POST' });
  }

  // ── Consumer KYC review (ADR-020; admin-api-owned, no gateway hop) ──────────
  listKycCases(status?: string, environment?: string, limit?: number): Promise<{ cases: KycCaseSummary[] }> {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (environment) qs.set('environment', environment);
    if (limit) qs.set('limit', String(limit));
    const q = qs.toString();
    return this.req(`/admin/v1/kyc/cases${q ? `?${q}` : ''}`);
  }
  getKycCase(id: string, environment?: string): Promise<KycCaseDetail> {
    const q = environment === 'SANDBOX' ? '?environment=SANDBOX' : '';
    return this.req(`/admin/v1/kyc/cases/${id}${q}`);
  }
  getKycTimeline(id: string, environment?: string): Promise<{ events: KycTimelineEvent[] }> {
    const q = environment === 'SANDBOX' ? '?environment=SANDBOX' : '';
    return this.req(`/admin/v1/kyc/cases/${id}/timeline${q}`);
  }
  // Mints a short-TTL signed GET for one evidence object on demand. Never persisted;
  // the access (view/download/copy) is audited server-side. storage_key never returned.
  mintKycEvidenceReadUrl(evidenceId: string, intent: 'view' | 'download' | 'copy', environment?: string): Promise<{ download_url: string }> {
    const q = environment ? `?environment=${environment}` : '';
    return this.req(`/admin/v1/kyc/evidence/${evidenceId}/read-url${q}`, {
      method: 'POST', body: JSON.stringify({ intent }),
    });
  }
  // The operator decides the granted level (BASIC|ENHANCED|FULL) — never the consumer.
  approveKycCase(id: string, grantedLevel: string, notes?: string, environment?: string): Promise<KycCaseDetail> {
    const q = environment ? `?environment=${environment}` : '';
    return this.req(`/admin/v1/kyc/cases/${id}/approve${q}`, {
      method: 'POST', body: JSON.stringify({ granted_level: grantedLevel, notes: notes || undefined }),
    });
  }
  rejectKycCase(id: string, reasonCode: string, notes?: string, environment?: string): Promise<KycCaseDetail> {
    const q = environment ? `?environment=${environment}` : '';
    return this.req(`/admin/v1/kyc/cases/${id}/reject${q}`, {
      method: 'POST', body: JSON.stringify({ reason_code: reasonCode, notes: notes || undefined }),
    });
  }
  requestKycMoreInfo(id: string, reasonCode: string, notes?: string, environment?: string): Promise<KycCaseDetail> {
    const q = environment ? `?environment=${environment}` : '';
    return this.req(`/admin/v1/kyc/cases/${id}/request-more-info${q}`, {
      method: 'POST', body: JSON.stringify({ reason_code: reasonCode, notes: notes || undefined }),
    });
  }
}

export type OperatorRole = 'SUPER_ADMIN' | 'OPERATIONS' | 'COMPLIANCE' | 'SUPPORT' | 'READ_ONLY';

export interface Operator {
  id:            string;
  email:         string;
  full_name:     string;
  role:          OperatorRole;
  status:        'INVITED' | 'ACTIVE' | 'SUSPENDED';
  last_login_at: string | null;
  locked_until:  string | null;
  password_set:  boolean;
  invited_at:    string | null;
  activated_at:  string | null;
  created_at:    string;
}

export interface MerchantApplication {
  id:                   string;
  status:               'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  environment:          'LIVE' | 'SANDBOX';
  desired_handle:       string;
  business_name:        string;
  category:             string;
  subcategory:          string;
  email:                string;
  phone:                string;
  nif:                  string;
  country:              string;
  province:             string;
  municipality:         string;
  city:                 string;
  address:              string;
  address_reference:    string;
  legal_representative: string;
  representative_role:  string;
  representative_email: string;
  representative_phone: string;
  business_activity:    string;
  estimated_volume:     string;
  business_account_type: string;
  admin_notes:          string;
  merchant_message:     string;
  created_merchant_id:  string;
  created_at:           string;
  reviewed_at:          string | null;
}

export interface KybDocument {
  document_id:      string;
  document_type:    string;
  original_filename: string;
  mime_type:        string;
  status:           'PENDING_UPLOAD' | 'UPLOADED' | 'ACCEPTED' | 'REJECTED' | 'DELETED';
  size_bytes:       number;
  uploaded_at:      string | null;
  reviewed_by:      string | null;
  reviewed_at:      string | null;
  rejection_reason: string | null;
}

// Post-approval merchant KYB document (merchant_kyb_documents). Never carries a
// storage_key; download_url is a short-TTL signed GET.
export interface MerchantKybDoc {
  id:                string;
  merchant_id:       string;
  /** Owning merchant identity (enriched server-side). Empty for an orphan. */
  merchant_name?:    string;
  merchant_status?:  string;
  kyb_status?:       string;
  environment?:      string;
  /** false when the merchant no longer exists (orphan) — review is blocked. */
  merchant_exists:   boolean;
  document_type:     string;
  status:            string;
  mime_type?:        string;
  size_bytes?:       number;
  submitted_at?:     string | null;
  reviewed_at?:      string | null;
  valid_until?:      string | null;
  rejection_reason?: string | null;
  reviewed_by?:      string;
  download_url?:     string;
}

// Merchant-centric KYB queue row: a whole merchant with document aggregates.
export interface MerchantKybSummary {
  merchant_id:     string;
  merchant_exists: boolean;
  name?:           string;
  handle?:         string;
  status?:         string;
  kyb_status?:     string;
  environment?:    string;
  country?:        string;
  contact?:        string;
  total:           number;
  pending:         number;
  approved:        number;
  rejected:        number;
  expired:         number;
  last_submission?: string | null;
}

// Full operator context for the KYB review drawer. Fields are omitempty server-side
// (sourced from merchant_applications, which may be absent for older merchants).
export interface MerchantKybContext {
  merchant_id:           string;
  merchant_exists:       boolean;
  name?:                 string;
  email?:                string;
  status?:               string;
  kyb_status?:           string;
  handle?:               string;
  category?:             string;
  created_at?:           string | null;
  representative_name?:  string;
  representative_email?: string;
  representative_phone?: string;
  legal_name?:           string;
  nif?:                  string;
  country?:              string;
  city?:                 string;
  address?:              string;
  business_activity?:    string;
}

// One immutable entry from merchant_kyb_events. payload shape varies by event_type.
export interface KybTimelineEvent {
  id:          string;
  event_type:  string;
  document_id?: string;
  payload?:    Record<string, unknown>;
  created_at:  string;
}

// Consumer KYC (ADR-020). Enriched server-side with consumer identity + compliance.
export interface KycCaseSummary {
  id:                string;
  subject_id:        string;
  status:            string;
  document_type?:    string;
  document_country?: string;
  reason_code?:      string;
  environment:       string;
  created_at:        string;
  submitted_at?:     string | null;
  reviewed_at?:      string | null;
  consumer_exists:   boolean;
  consumer_handle?:  string;
  consumer_name?:    string;
  consumer_status?:  string;
  consumer_phone?:   string;
  kyc_level?:        string;
  compliance_status?: string;
  evidence_count:    number;
}

export interface KycEvidence {
  id:            string;
  evidence_type: string;
  side?:         string;
  status:        string;
  mime_type?:    string;
  size_bytes?:   number;
  uploaded_at?:  string | null;
}

export interface KycReviewRecord {
  reviewer_type: string;
  reviewer_id?:  string;
  decision:      string;
  reason_code?:  string;
  granted_level?: string;
  notes?:        string;
  created_at:    string;
}

export interface KycCaseDetail extends KycCaseSummary {
  evidence: KycEvidence[];
  reviews:  KycReviewRecord[];
}

export interface KycTimelineEvent {
  id:         string;
  event_type: string;
  payload?:   Record<string, unknown>;
  created_at: string;
}

export interface NotificationSummary {
  pending_kyb_documents:        number;
  pending_kyc_documents:        number;
  pending_business_applications: number;
  failed_app_settlements:       number;
  open_disputes:                number;
  pending_reconciliations:      number;
  unread_notifications?:        number;
}

// Read-only transaction proof (ADR-040).
export interface AdminProof {
  proof_reference:     string;
  transaction_id:      string;
  environment:         string;
  status:              string;
  amount_minor:        number;
  currency:            string;
  payer_display_name?: string;
  payer_handle?:       string;
  payee_display_name?: string;
  payee_handle?:       string;
  method?:             string;
  description?:        string;
  proof_hash?:         string;
  signature_key_id?:   string;
  signature_algorithm?: string;
  verification_count:  number;
  public_url:          string;
  issued_at:           string;
  confirmed_at?:       string | null;
  reversed_at?:        string | null;
}
export interface ProofVerification {
  verified_at: string;
  country?:    string;
  result:      string;
}

// Central platform mode (SANDBOX/LIVE).
export interface PlatformMode {
  mode:        'SANDBOX' | 'LIVE';
  updated_at:  string;
  updated_by?: string;
  reason?:     string;
}

// Unified compliance case (ADR-023) — an operational index over an entity.
export interface ComplianceCase {
  id:                     string;
  environment:            string;
  case_type:              string;
  entity_type:            string;
  entity_id:              string;
  entity_name?:           string;
  entity_handle?:         string;
  status:                 'UNASSIGNED' | 'ASSIGNED' | 'ESCALATED' | 'RESOLVED';
  priority:               'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  risk_level:             'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assigned_operator_id?:  string;
  assigned_operator_name?: string;
  created_at:             string;
  updated_at:             string;
  last_activity:          string;
  resolved_at?:           string | null;
  age_seconds:            number;
  metadata?:              Record<string, unknown>;
}

export interface ComplianceNote {
  id:           string;
  case_id:      string;
  author_id?:   string;
  author_name?: string;
  body:         string;
  created_at:   string;
  updated_at?:  string | null;
}

// One persistent operator notification (Notification Center, ADR-022 s3).
export interface AdminNotification {
  id:           string;
  environment:  string;
  type:         string;
  severity:     'info' | 'success' | 'warning' | 'error';
  entity_type?: string;
  entity_id?:   string;
  title:        string;
  message?:     string;
  href?:        string;
  status:       'UNREAD' | 'READ' | 'DISMISSED';
  created_at:   string;
  read_at?:     string | null;
  dismissed_at?: string | null;
  metadata?:    Record<string, unknown>;
}

export interface WalletPayment {
  id:                string;
  reference:         string;
  merchant_id:       string;
  merchant_name:     string;
  payer_name:        string;
  amount_minor:      number;
  currency:          string;
  status:            string;
  environment:       string;
  created_at:        string;
  receipt_available: boolean;
}

export interface WalletPaymentList {
  items:        WalletPayment[];
  next_cursor?: string;
}

/** True when an AdminApiError signals that KYB storage isn't provisioned yet. */
export function isStorageNotConfigured(err: unknown): boolean {
  return err instanceof AdminApiError && err.status === 503 && err.code === 'STORAGE_NOT_CONFIGURED';
}
