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
      // Expired/invalid operator token → clear session and bounce to login.
      if (res.status === 401 && typeof window !== 'undefined') {
        try { localStorage.removeItem('banzami_admin_session'); } catch { /* ignore */ }
        if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
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
}

export interface MerchantApplication {
  id:                   string;
  status:               'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  environment:          'LIVE' | 'SANDBOX';
  desired_handle:       string;
  business_name:        string;
  category:             string;
  email:                string;
  phone:                string;
  nif:                  string;
  country:              string;
  city:                 string;
  address:              string;
  legal_representative: string;
  business_activity:    string;
  estimated_volume:     string;
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

/** True when an AdminApiError signals that KYB storage isn't provisioned yet. */
export function isStorageNotConfigured(err: unknown): boolean {
  return err instanceof AdminApiError && err.status === 503 && err.code === 'STORAGE_NOT_CONFIGURED';
}
