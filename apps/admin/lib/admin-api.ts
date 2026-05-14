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
  id:             string;
  merchant_id:    string;
  wallet_id:      string;
  amount_minor:   number;
  currency:       string;
  status:         'PENDING' | 'SUBMITTED' | 'SETTLED' | 'FAILED';
  period_from:    string;
  period_to:      string;
  created_at:     string;
  updated_at:     string;
}

export interface SettlementList {
  data: Settlement[];
}

export interface Payout {
  id:           string;
  merchant_id:  string;
  wallet_id:    string;
  amount_minor: number;
  currency:     string;
  status:       'PENDING' | 'PROCESSING' | 'SENT' | 'CONFIRMED' | 'FAILED' | 'RETURNED';
  reference?:   string;
  created_at:   string;
  updated_at:   string;
}

export interface PayoutList {
  data: Payout[];
}

export interface MerchantCompliance {
  merchant_id:        string;
  compliance_status:  'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'FLAGGED_AML';
  notes?:             string;
  reviewed_at?:       string;
  created_at:         string;
  updated_at:         string;
}

export interface Merchant {
  id:         string;
  name:       string;
  status:     string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class AdminApi {
  private readonly base:   string;
  private readonly apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    this.base   = apiUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
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
  getMerchant(id: string):            Promise<Merchant>           { return this.req(`/admin/v1/merchants/${id}`); }

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

  // Reconciliation
  runReconciliation(): Promise<Record<string, unknown>> {
    return this.req('/admin/v1/reconciliation/run', { method: 'POST', body: JSON.stringify({}) });
  }
}
