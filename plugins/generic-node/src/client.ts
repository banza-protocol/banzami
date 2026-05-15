import { createHmac, timingSafeEqual } from 'node:crypto';

export class BanzamiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'BanzamiError';
  }

  get isNotFound():          boolean { return this.status === 404; }
  get isUnauthorized():      boolean { return this.status === 401; }
  get isConflict():          boolean { return this.status === 409; }
  get isForbidden():         boolean { return this.status === 403; }
  get isInsufficientFunds(): boolean { return this.code === 'INSUFFICIENT_FUNDS'; }
}

export interface BanzamiClientConfig {
  gatewayUrl: string;
  apiKey:     string;
  timeout?:   number; // ms, default 30000
}

export interface PaymentLink {
  id:           string;
  slug:         string;
  merchant_id:  string;
  wallet_id:    string;
  amount_minor: number | null;
  currency:     string;
  description:  string | null;
  status:       'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELLED';
  expires_at:   string | null;
  paid_at:      string | null;
  created_at:   string;
  updated_at:   string;
}

export interface CreatePaymentLinkParams {
  merchant_id:   string;
  wallet_id:     string;
  amount_minor?: number;
  currency:      string;
  description?:  string;
  expires_at?:   string; // ISO 8601
}

export interface Transaction {
  id:           string;
  status:       string;
  amount_minor: number;
  currency:     string;
  merchant_id:  string;
  description:  string;
  created_at:   string;
}

export interface Page<T> {
  items:       T[];
  next_cursor: string | null;
}

export interface Wallet {
  id:          string;
  merchant_id: string;
  currency:    string;
  status:      string;
  created_at:  string;
}

export interface WalletBalance {
  wallet_id:       string;
  available_minor: number;
  reserved_minor:  number;
  total_minor:     number;
  currency:        string;
}

export interface Payout {
  id:                       string;
  merchant_id:              string;
  wallet_id:                string;
  amount_minor:             number;
  currency:                 string;
  status:                   string;
  destination_bank_account: string;
  idempotency_key:          string;
  created_at:               string;
  updated_at:               string;
}

export interface Merchant {
  id:         string;
  name:       string;
  email:      string;
  status:     string;
  created_at: string;
}

/**
 * Banzami API client for Node.js.
 *
 * Uses the native fetch API (Node >= 18). No external dependencies.
 *
 * ```ts
 * import { BanzamiClient } from '@banzami/node';
 *
 * const client = new BanzamiClient({
 *   gatewayUrl: 'https://api.banzami.ao',
 *   apiKey:     'bz_live_...',
 * });
 *
 * const link = await client.createPaymentLink({
 *   merchant_id:  '...',
 *   wallet_id:    '...',
 *   amount_minor: 50000,
 *   currency:     'AOA',
 * });
 * // Redirect customer to: https://pay.banzami.co/${link.slug}
 * ```
 */
export class BanzamiClient {
  private readonly base: string;
  private readonly key:  string;
  private readonly timeout: number;

  constructor(cfg: BanzamiClientConfig) {
    this.base    = cfg.gatewayUrl.replace(/\/$/, '');
    this.key     = cfg.apiKey;
    this.timeout = cfg.timeout ?? 30_000;
  }

  // ---------------------------------------------------------------------------
  // Payment Links
  // ---------------------------------------------------------------------------

  async createPaymentLink(params: CreatePaymentLinkParams): Promise<PaymentLink> {
    return this.post<PaymentLink>('/v1/payment-links', params);
  }

  async listPaymentLinks(
    merchantId: string,
    limit = 20,
    cursor?: string,
  ): Promise<Page<PaymentLink>> {
    const qs = new URLSearchParams({ merchant_id: merchantId, limit: String(limit) });
    if (cursor) qs.set('cursor', cursor);
    return this.get<Page<PaymentLink>>(`/v1/payment-links?${qs}`);
  }

  async getPaymentLink(id: string): Promise<PaymentLink> {
    return this.get<PaymentLink>(`/v1/payment-links/${id}`);
  }

  async cancelPaymentLink(id: string): Promise<PaymentLink> {
    return this.post<PaymentLink>(`/v1/payment-links/${id}/cancel`, {});
  }

  // ---------------------------------------------------------------------------
  // Transactions
  // ---------------------------------------------------------------------------

  async createTransaction(params: {
    wallet_id:       string;
    amount_minor:    number;
    currency:        string;
    description?:    string;
    idempotency_key?: string;
  }): Promise<Transaction> {
    return this.post<Transaction>('/v1/transactions', params);
  }

  async getTransaction(id: string): Promise<Transaction> {
    return this.get<Transaction>(`/v1/transactions/${id}`);
  }

  async listTransactions(
    merchantId: string,
    limit = 20,
    cursor?: string,
  ): Promise<Page<Transaction>> {
    const qs = new URLSearchParams({ merchant_id: merchantId, limit: String(limit) });
    if (cursor) qs.set('cursor', cursor);
    return this.get<Page<Transaction>>(`/v1/transactions?${qs}`);
  }

  // ---------------------------------------------------------------------------
  // Wallets
  // ---------------------------------------------------------------------------

  async provisionWallet(params: { merchant_id: string; currency: string }): Promise<Wallet> {
    return this.post<Wallet>('/v1/wallets', params);
  }

  async getWallet(id: string): Promise<Wallet> {
    return this.get<Wallet>(`/v1/wallets/${id}`);
  }

  async getWalletBalance(id: string): Promise<WalletBalance> {
    return this.get<WalletBalance>(`/v1/wallets/${id}/balance`);
  }

  // ---------------------------------------------------------------------------
  // Payouts
  // ---------------------------------------------------------------------------

  async createPayout(params: {
    wallet_id:                string;
    amount_minor:             number;
    currency:                 string;
    destination_bank_account: string;
    idempotency_key?:         string;
  }): Promise<Payout> {
    return this.post<Payout>('/v1/payouts', params);
  }

  async listPayouts(merchantId: string, limit = 20, cursor?: string): Promise<Page<Payout>> {
    const qs = new URLSearchParams({ merchant_id: merchantId, limit: String(limit) });
    if (cursor) qs.set('cursor', cursor);
    return this.get<Page<Payout>>(`/v1/payouts?${qs}`);
  }

  async getPayout(id: string): Promise<Payout> {
    return this.get<Payout>(`/v1/payouts/${id}`);
  }

  // ---------------------------------------------------------------------------
  // Merchants
  // ---------------------------------------------------------------------------

  async getMerchant(id: string): Promise<Merchant> {
    return this.get<Merchant>(`/v1/merchants/${id}`);
  }

  // ---------------------------------------------------------------------------
  // Public (unauthenticated)
  // ---------------------------------------------------------------------------

  async resolvePaymentLink(slug: string): Promise<PaymentLink> {
    return this.request<PaymentLink>('GET', `/v1/public/pay/${slug}`, undefined, false);
  }

  // ---------------------------------------------------------------------------
  // Webhook signature verification
  // ---------------------------------------------------------------------------

  /**
   * Verify an incoming webhook signature.
   *
   * @param rawBody   Raw request body Buffer or string (do NOT parse first).
   * @param signature Value of the `X-Banzami-Signature` header.
   * @param secret    Webhook secret from the Banzami dashboard.
   */
  static verifyWebhook(
    rawBody:   Buffer | string,
    signature: string,
    secret:    string,
  ): boolean {
    if (!signature) return false;
    const body     = typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody;
    const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
    const sigBuf   = Buffer.from(signature);
    const expBuf   = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return timingSafeEqual(sigBuf, expBuf);
  }

  // ---------------------------------------------------------------------------
  // Money helpers
  // ---------------------------------------------------------------------------

  static formatAmount(amountMinor: number, currency: string): string {
    if (currency.toUpperCase() === 'AOA') {
      return `${amountMinor.toLocaleString('pt-AO')} Kz`;
    }
    return new Intl.NumberFormat('pt-AO', { style: 'currency', currency }).format(
      amountMinor / 100,
    );
  }

  static toMinorUnits(total: number, currency: string): number {
    if (currency.toUpperCase() === 'AOA') return Math.round(total);
    return Math.round(total * 100);
  }

  // ---------------------------------------------------------------------------
  // HTTP internals
  // ---------------------------------------------------------------------------

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    authenticated = true,
  ): Promise<T> {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), this.timeout);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept':       'application/json',
    };
    if (authenticated) {
      headers['Authorization'] = `Bearer ${this.key}`;
    }

    let res: Response;
    try {
      res = await fetch(this.base + path, {
        method,
        headers,
        body:   body != null ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(tid);
    }

    const data = await res.json() as any;
    if (!res.ok) {
      const msg  = data?.error?.message ?? `HTTP ${res.status}`;
      const code = data?.error?.code    ?? 'UNKNOWN';
      throw new BanzamiError(msg, code, res.status);
    }
    return data as T;
  }
}
