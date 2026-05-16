export class BanzamiApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BanzamiApiError';
  }

  get isNotFound()          { return this.status === 404; }
  get isUnauthorized()      { return this.status === 401; }
  get isInsufficientFunds() { return this.code === 'INSUFFICIENT_FUNDS'; }
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface Transaction {
  id:           string;
  merchant_id:  string;
  consumer_id?: string;
  amount_minor: number;
  currency:     string;
  status:       'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'REVERSED' | 'REFUNDED';
  reference?:   string;
  description?: string;
  created_at:   string;
  updated_at:   string;
}

export interface TransactionPage {
  data:         Transaction[];
  next_cursor?: string;
}

export interface Wallet {
  id:          string;
  merchant_id?: string;
  currency:    string;
  status:      string;
  created_at:  string;
}

export interface WalletBalance {
  available_minor: number;
  reserved_minor:  number;
  currency:        string;
}

export interface Payout {
  id:           string;
  wallet_id:    string;
  amount_minor: number;
  currency:     string;
  status:       string;
  reference?:   string;
  created_at:   string;
  updated_at:   string;
}

export interface PayoutPage {
  data:         Payout[];
  next_cursor?: string;
}

export interface Merchant {
  id:         string;
  name:       string;
  status:     string;
  created_at: string;
}

export interface ApiKey {
  id:            string;
  prefix:        string;
  label?:        string;
  created_at:    string;
  last_used_at?: string;
}

export interface NewApiKey extends ApiKey {
  key: string;
}

export interface WebhookEndpoint {
  id:         string;
  url:        string;
  events:     string[];
  status:     string;
  created_at: string;
}

export interface WebhookEvent {
  id:         string;
  type:       string;
  payload:    unknown;
  created_at: string;
}

export interface WebhookEventPage {
  data:         WebhookEvent[];
  next_cursor?: string;
}

export interface PaymentLink {
  id:           string;
  slug:         string;
  merchant_id:  string;
  wallet_id:    string;
  amount_minor: number | null;
  currency:     string;
  description:  string | null;
  status:       string;
  expires_at:   string | null;
  paid_at:      string | null;
  created_at:   string;
  updated_at:   string;
}

export interface PaymentLinkPage {
  data:         PaymentLink[];
  next_cursor?: string;
}

export interface QrResponse {
  qr_code: {
    id:           string;
    owner_id:     string;
    owner_type:   string;
    qr_type:      string;
    currency:     string;
    amount_minor: number | null;
    status:       string;
    expires_at:   string | null;
    created_at:   string;
  };
  payload: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class BanzamiApi {
  private readonly base: string;
  private readonly apiKey: string;

  constructor(gatewayUrl: string, apiKey: string) {
    this.base   = gatewayUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}/v1${path}`, {
      ...init,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...(init?.headers ?? {}),
      },
    });

    if (!res.ok) {
      let code    = 'UNKNOWN';
      let message = res.statusText;
      try {
        const body = await res.json();
        code    = body.code    ?? code;
        message = body.message ?? message;
      } catch { /* ignore parse errors */ }
      throw new BanzamiApiError(res.status, code, message);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  // Transactions
  listTransactions(opts: { limit?: number; cursor?: string; status?: string } = {}): Promise<TransactionPage> {
    const p = new URLSearchParams();
    if (opts.limit)  p.set('limit',  String(opts.limit));
    if (opts.cursor) p.set('cursor', opts.cursor);
    if (opts.status) p.set('status', opts.status);
    return this.req<TransactionPage>(`/transactions?${p}`);
  }

  getTransaction(id: string): Promise<Transaction> {
    return this.req<Transaction>(`/transactions/${id}`);
  }

  // Wallets
  getWallet(id: string): Promise<Wallet> {
    return this.req<Wallet>(`/wallets/${id}`);
  }

  getMerchantWallet(currency = 'AOA'): Promise<Wallet> {
    return this.req<Wallet>(`/wallets?currency=${currency}`);
  }

  getWalletBalance(id: string): Promise<WalletBalance> {
    return this.req<WalletBalance>(`/wallets/${id}/balance`);
  }

  // Payouts
  listPayouts(opts: { limit?: number; cursor?: string } = {}): Promise<PayoutPage> {
    const p = new URLSearchParams();
    if (opts.limit)  p.set('limit',  String(opts.limit));
    if (opts.cursor) p.set('cursor', opts.cursor);
    return this.req<PayoutPage>(`/payouts?${p}`);
  }

  createPayout(opts: {
    walletId:          string;
    amountMinor:       number;
    currency?:         string;
    bankAccountNumber: string;
    bankCode:          string;
    accountHolderName: string;
  }): Promise<Payout> {
    return this.req<Payout>('/payouts', {
      method: 'POST',
      body:   JSON.stringify({
        idempotency_key:     crypto.randomUUID(),
        wallet_id:           opts.walletId,
        amount_minor:        opts.amountMinor,
        currency:            opts.currency ?? 'AOA',
        bank_account_number: opts.bankAccountNumber,
        bank_code:           opts.bankCode,
        account_holder_name: opts.accountHolderName,
      }),
    });
  }

  // Merchants
  getMerchant(id: string): Promise<Merchant> {
    return this.req<Merchant>(`/merchants/${id}`);
  }

  // API Keys
  listApiKeys(merchantId: string): Promise<ApiKey[]> {
    return this.req<ApiKey[]>(`/merchants/${merchantId}/api-keys`);
  }

  createApiKey(merchantId: string, label?: string): Promise<NewApiKey> {
    return this.req<NewApiKey>(`/merchants/${merchantId}/api-keys`, {
      method: 'POST',
      body:   JSON.stringify({ label: label ?? null }),
    });
  }

  revokeApiKey(merchantId: string, keyId: string): Promise<void> {
    return this.req<void>(`/merchants/${merchantId}/api-keys/${keyId}`, { method: 'DELETE' });
  }

  // Webhooks
  listWebhookEndpoints(): Promise<WebhookEndpoint[]> {
    return this.req<WebhookEndpoint[]>('/webhooks/endpoints');
  }

  registerWebhookEndpoint(url: string, events: string[]): Promise<WebhookEndpoint> {
    return this.req<WebhookEndpoint>('/webhooks/endpoints', {
      method: 'POST',
      body:   JSON.stringify({ url, events }),
    });
  }

  deleteWebhookEndpoint(id: string): Promise<void> {
    return this.req<void>(`/webhooks/endpoints/${id}`, { method: 'DELETE' });
  }

  listWebhookEvents(opts: { limit?: number; cursor?: string } = {}): Promise<WebhookEventPage> {
    const p = new URLSearchParams();
    if (opts.limit)  p.set('limit',  String(opts.limit));
    if (opts.cursor) p.set('cursor', opts.cursor);
    return this.req<WebhookEventPage>(`/webhooks/events?${p}`);
  }

  // Payment Links
  listPaymentLinks(opts: { merchantId: string; limit?: number; cursor?: string }): Promise<PaymentLinkPage> {
    const p = new URLSearchParams({ merchant_id: opts.merchantId });
    if (opts.limit)  p.set('limit',  String(opts.limit));
    if (opts.cursor) p.set('cursor', opts.cursor);
    return this.req<PaymentLinkPage>(`/payment-links?${p}`);
  }

  createPaymentLink(opts: {
    merchantId:   string;
    walletId:     string;
    amountMinor?: number | null;
    currency?:    string;
    description?: string;
    expiresAt?:   string;
  }): Promise<PaymentLink> {
    return this.req<PaymentLink>('/payment-links', {
      method: 'POST',
      body:   JSON.stringify({
        merchant_id:  opts.merchantId,
        wallet_id:    opts.walletId,
        amount_minor: opts.amountMinor ?? null,
        currency:     opts.currency ?? 'AOA',
        description:  opts.description ?? null,
        expires_at:   opts.expiresAt ?? null,
      }),
    });
  }

  cancelPaymentLink(id: string): Promise<PaymentLink> {
    return this.req<PaymentLink>(`/payment-links/${id}`, { method: 'DELETE' });
  }

  // QR codes
  createStaticQr(opts: { ownerId: string; ownerType: 'MERCHANT' | 'CONSUMER'; currency?: string }): Promise<QrResponse> {
    return this.req<QrResponse>('/qr/static', {
      method: 'POST',
      body:   JSON.stringify({
        owner_id:   opts.ownerId,
        owner_type: opts.ownerType,
        currency:   opts.currency ?? 'AOA',
      }),
    });
  }
}
