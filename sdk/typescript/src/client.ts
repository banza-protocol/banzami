import { BanzaApiError } from './errors.js';
import { WebhooksClient } from './webhooks.js';
import type {
  BanzamiEnvironment,
  Consumer,
  ConsumerWallet,
  WalletBalance,
  Transfer,
  Page,
  Transaction,
  Wallet,
  Payout,
  QrResponse,
  ParsedQr,
  Merchant,
  ApiKey,
  NewApiKey,
  PaymentLink,
  WebhookEndpoint,
  WebhookEvent,
  Refund,
  CreateRefundParams,
  Dispute,
  OpenDisputeParams,
  ListDisputesParams,
  PaymentRequest,
  CreatePaymentRequestParams,
  ListPaymentRequestsParams,
} from './types.js';

const DEFAULT_BASE_URLS: Record<BanzamiEnvironment, string> = {
  live:    'https://api.banzami.com',
  sandbox: 'https://sandbox-api.banzami.com',
};

export interface BanzamiHooks {
  /** Called before every HTTP attempt, including retries. */
  onRequest?:  (method: string, path: string, attempt: number) => void;
  /** Called after every successful HTTP response. */
  onResponse?: (method: string, path: string, status: number, durationMs: number) => void;
  /** Called once after all retry attempts are exhausted. */
  onError?:    (method: string, path: string, error: Error, attempts: number) => void;
}

export interface BanzaClientOptions {
  /** API key for this client. Prefix determines environment:
   *  - `bz_live_…` → live (production money)
   *  - `bz_test_…` → sandbox (virtual funds) */
  apiKey:         string;
  /** Which data universe to operate in. Defaults to 'live'. */
  environment?:   BanzamiEnvironment;
  /** Override the API base URL. Defaults to the canonical URL for the chosen environment. */
  baseUrl?:       string;
  /** Maximum number of retry attempts after the initial request. Default: 3. */
  maxRetries?:    number;
  /** Base delay in milliseconds for exponential backoff. Default: 500. */
  retryDelay?:    number;
  /** Optional hooks for logging, tracing, and monitoring. */
  hooks?:         BanzamiHooks;
  /**
   * Webhook secret for this client (obtained when registering a webhook endpoint).
   * Required to call `banzami.webhooks.constructEvent()`.
   * Never expose this value in browser or client-side code.
   */
  webhookSecret?: string;
}

export class BanzaClient {
  private readonly base:        string;
  private readonly apiKey:      string;
  readonly environment:         BanzamiEnvironment;
  private readonly maxRetries:  number;
  private readonly retryDelay:  number;
  private readonly hooks:       BanzamiHooks;

  /**
   * Webhook verification and test-helper methods.
   * Requires `webhookSecret` in the constructor options to call `constructEvent()`.
   */
  readonly webhooks: WebhooksClient;

  get isSandbox():    boolean { return this.environment === 'sandbox'; }
  get isProduction(): boolean { return this.environment === 'live'; }

  constructor({
    apiKey,
    environment = 'live',
    baseUrl,
    maxRetries = 3,
    retryDelay = 500,
    hooks = {},
    webhookSecret,
  }: BanzaClientOptions) {
    this.apiKey      = apiKey;
    this.environment = environment;
    this.base        = (baseUrl ?? DEFAULT_BASE_URLS[environment]).replace(/\/$/, '');
    this.maxRetries  = maxRetries;
    this.retryDelay  = retryDelay;
    this.hooks       = hooks;
    this.webhooks    = new WebhooksClient(webhookSecret);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async executeOnce<T>(path: string, init?: RequestInit, idempotencyKey?: string, attempt = 0): Promise<T> {
    const extraHeaders: Record<string, string> = {};
    if (idempotencyKey !== undefined) {
      extraHeaders['Idempotency-Key'] = idempotencyKey;
    }

    const method = (init?.method ?? 'GET').toUpperCase();
    this.hooks.onRequest?.(method, path, attempt);
    const t0 = Date.now();

    const response = await fetch(`${this.base}/v1${path}`, {
      ...init,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...(init?.headers ?? {}),
        ...extraHeaders,
      },
    });

    if (!response.ok) {
      let code    = 'UNKNOWN';
      let message = response.statusText;
      try {
        const body = await response.json() as { code?: string; message?: string };
        code    = body.code    ?? code;
        message = body.message ?? message;
      } catch { /* non-JSON error body */ }
      throw new BanzaApiError(response.status, code, message);
    }

    this.hooks.onResponse?.(method, path, response.status, Date.now() - t0);

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  private shouldRetry(status: number, attempt: number): boolean {
    if (attempt >= this.maxRetries) return false;
    return status === 429 || status === 502 || status === 503 || status === 504;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const method         = (init?.method ?? 'GET').toUpperCase();
    const isPost         = method === 'POST';
    const idempotencyKey = isPost ? crypto.randomUUID() : undefined;
    let lastErr: BanzaApiError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise<void>(r => setTimeout(r, this.retryDelay * 2 ** (attempt - 1)));
      }
      try {
        return await this.executeOnce<T>(path, init, idempotencyKey, attempt);
      } catch (err) {
        if (err instanceof BanzaApiError && this.shouldRetry(err.status, attempt)) {
          lastErr = err;
          continue;
        }
        this.hooks.onError?.(method, path, err instanceof Error ? err : new Error(String(err)), attempt + 1);
        throw err;
      }
    }
    this.hooks.onError?.(method, path, lastErr!, this.maxRetries + 1);
    throw lastErr!;
  }

  private qs(params: Record<string, string | number | undefined>): string {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  // ---------------------------------------------------------------------------
  // Consumers
  // ---------------------------------------------------------------------------

  createConsumer(handle: string, displayName?: string): Promise<Consumer> {
    return this.request<Consumer>('/consumers', {
      method: 'POST',
      body:   JSON.stringify({ handle, display_name: displayName ?? null }),
    });
  }

  getConsumer(id: string): Promise<Consumer> {
    return this.request<Consumer>(`/consumers/${id}`);
  }

  getConsumerByHandle(handle: string): Promise<Consumer> {
    return this.request<Consumer>(`/consumers/handle/${handle}`);
  }

  suspendConsumer(id: string): Promise<Consumer> {
    return this.request<Consumer>(`/consumers/${id}/suspend`, { method: 'POST' });
  }

  closeConsumer(id: string): Promise<Consumer> {
    return this.request<Consumer>(`/consumers/${id}/close`, { method: 'POST' });
  }

  // ---------------------------------------------------------------------------
  // Consumer wallets
  // ---------------------------------------------------------------------------

  getOrCreateConsumerWallet(consumerId: string, currency = 'AOA'): Promise<ConsumerWallet> {
    return this.request<ConsumerWallet>('/consumer-wallets', {
      method: 'POST',
      body:   JSON.stringify({ consumer_id: consumerId, currency }),
    });
  }

  getConsumerWallet(walletId: string): Promise<ConsumerWallet> {
    return this.request<ConsumerWallet>(`/consumer-wallets/${walletId}`);
  }

  getConsumerWalletBalance(walletId: string): Promise<WalletBalance> {
    return this.request<WalletBalance>(`/consumer-wallets/${walletId}/balance`);
  }

  getConsumerWalletForConsumer(consumerId: string, currency = 'AOA'): Promise<ConsumerWallet> {
    return this.request<ConsumerWallet>(
      `/consumer-wallets${this.qs({ consumer_id: consumerId, currency })}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Transfers (P2P)
  // ---------------------------------------------------------------------------

  sendTransfer(params: {
    senderId:    string;
    recipientId: string;
    amountMinor: number;
    currency?:   string;
    description?: string;
  }): Promise<Transfer> {
    return this.request<Transfer>('/transfers', {
      method: 'POST',
      body:   JSON.stringify({
        sender_id:    params.senderId,
        recipient_id: params.recipientId,
        amount_minor: params.amountMinor,
        currency:     params.currency ?? 'AOA',
        description:  params.description ?? null,
      }),
    });
  }

  getTransfer(id: string): Promise<Transfer> {
    return this.request<Transfer>(`/transfers/${id}`);
  }

  listTransfers(params: {
    consumerId: string;
    limit?:     number;
    cursor?:    string;
  }): Promise<Page<Transfer>> {
    return this.request<Page<Transfer>>(
      `/transfers${this.qs({ consumer_id: params.consumerId, limit: params.limit, cursor: params.cursor })}`,
    );
  }

  // ---------------------------------------------------------------------------
  // QR codes
  // ---------------------------------------------------------------------------

  createStaticQr(ownerId: string): Promise<QrResponse> {
    return this.request<QrResponse>('/qr/static', {
      method: 'POST',
      body:   JSON.stringify({ owner_id: ownerId }),
    });
  }

  createDynamicQr(params: {
    ownerId:     string;
    amountMinor: number;
    currency?:   string;
    reference?:  string;
    expiresAt:   Date;
  }): Promise<QrResponse> {
    return this.request<QrResponse>('/qr/dynamic', {
      method: 'POST',
      body:   JSON.stringify({
        owner_id:     params.ownerId,
        amount_minor: params.amountMinor,
        currency:     params.currency ?? 'AOA',
        reference:    params.reference ?? null,
        expires_at:   params.expiresAt.toISOString(),
      }),
    });
  }

  getQrCode(id: string): Promise<QrResponse> {
    return this.request<QrResponse>(`/qr/${id}`);
  }

  decodeQrPayload(payload: string): Promise<ParsedQr> {
    return this.request<ParsedQr>('/qr/decode', {
      method: 'POST',
      body:   JSON.stringify({ payload }),
    });
  }

  markQrUsed(id: string): Promise<void> {
    return this.request<void>(`/qr/${id}/use`, { method: 'POST' });
  }

  // ---------------------------------------------------------------------------
  // Transactions (merchant-facing)
  // ---------------------------------------------------------------------------

  createTransaction(params: {
    idempotencyKey:   string;
    amountMinor:      number;
    currency?:        string;
    description?:     string;
    walletId?:        string;
    transactionType?: string;
  }): Promise<Transaction> {
    return this.request<Transaction>('/transactions', {
      method: 'POST',
      body:   JSON.stringify({
        idempotency_key:  params.idempotencyKey,
        amount_minor:     params.amountMinor,
        currency:         params.currency ?? 'AOA',
        description:      params.description ?? null,
        wallet_id:        params.walletId ?? null,
        transaction_type: params.transactionType ?? 'payment',
      }),
    });
  }

  listTransactions(params: {
    limit?:  number;
    cursor?: string;
    status?: string;
  } = {}): Promise<Page<Transaction>> {
    return this.request<Page<Transaction>>(
      `/transactions${this.qs({ limit: params.limit, cursor: params.cursor, status: params.status })}`,
    );
  }

  getTransaction(id: string): Promise<Transaction> {
    return this.request<Transaction>(`/transactions/${id}`);
  }

  // ---------------------------------------------------------------------------
  // Wallets (merchant-facing)
  // ---------------------------------------------------------------------------

  getWallet(id: string): Promise<Wallet> {
    return this.request<Wallet>(`/wallets/${id}`);
  }

  getWalletBalance(id: string): Promise<WalletBalance> {
    return this.request<WalletBalance>(`/wallets/${id}/balance`);
  }

  // ---------------------------------------------------------------------------
  // Payouts
  // ---------------------------------------------------------------------------

  listPayouts(params: { limit?: number; cursor?: string } = {}): Promise<Page<Payout>> {
    return this.request<Page<Payout>>(
      `/payouts${this.qs({ limit: params.limit, cursor: params.cursor })}`,
    );
  }

  createPayout(walletId: string, amountMinor: number, currency = 'AOA'): Promise<Payout> {
    return this.request<Payout>('/payouts', {
      method: 'POST',
      body:   JSON.stringify({ wallet_id: walletId, amount_minor: amountMinor, currency }),
    });
  }

  // ---------------------------------------------------------------------------
  // Merchants
  // ---------------------------------------------------------------------------

  getMerchant(id: string): Promise<Merchant> {
    return this.request<Merchant>(`/merchants/${id}`);
  }

  listApiKeys(merchantId: string): Promise<ApiKey[]> {
    return this.request<ApiKey[]>(`/merchants/${merchantId}/api-keys`);
  }

  createApiKey(merchantId: string, label?: string): Promise<NewApiKey> {
    return this.request<NewApiKey>(`/merchants/${merchantId}/api-keys`, {
      method: 'POST',
      body:   JSON.stringify({ label: label ?? null }),
    });
  }

  revokeApiKey(merchantId: string, keyId: string): Promise<void> {
    return this.request<void>(`/merchants/${merchantId}/api-keys/${keyId}`, { method: 'DELETE' });
  }

  // ---------------------------------------------------------------------------
  // Payment links
  // ---------------------------------------------------------------------------

  createPaymentLink(params: {
    merchantId:   string;
    walletId:     string;
    currency?:    string;
    amountMinor?: number;
    description?: string;
    expiresAt?:   Date;
  }): Promise<PaymentLink> {
    return this.request<PaymentLink>('/payment-links', {
      method: 'POST',
      body:   JSON.stringify({
        merchant_id:  params.merchantId,
        wallet_id:    params.walletId,
        currency:     params.currency ?? 'AOA',
        amount_minor: params.amountMinor ?? null,
        description:  params.description ?? null,
        expires_at:   params.expiresAt?.toISOString() ?? null,
      }),
    });
  }

  listPaymentLinks(params: {
    merchantId: string;
    limit?:     number;
    cursor?:    string;
  }): Promise<Page<PaymentLink>> {
    return this.request<Page<PaymentLink>>(
      `/payment-links${this.qs({ merchant_id: params.merchantId, limit: params.limit, cursor: params.cursor })}`,
    );
  }

  getPaymentLink(id: string): Promise<PaymentLink> {
    return this.request<PaymentLink>(`/payment-links/${id}`);
  }

  cancelPaymentLink(id: string): Promise<PaymentLink> {
    return this.request<PaymentLink>(`/payment-links/${id}`, { method: 'DELETE' });
  }

  getPublicPaymentLink(slug: string): Promise<PaymentLink> {
    return this.request<PaymentLink>(`/public/pay/${slug}`);
  }

  getPaymentLinkStatus(slug: string): Promise<{ paid: boolean }> {
    return this.request<{ paid: boolean }>(`/public/pay/${slug}/status`);
  }

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  listWebhookEndpoints(): Promise<WebhookEndpoint[]> {
    return this.request<WebhookEndpoint[]>('/webhooks/endpoints');
  }

  registerWebhookEndpoint(url: string, events: string[]): Promise<WebhookEndpoint> {
    return this.request<WebhookEndpoint>('/webhooks/endpoints', {
      method: 'POST',
      body:   JSON.stringify({ url, events }),
    });
  }

  deleteWebhookEndpoint(id: string): Promise<void> {
    return this.request<void>(`/webhooks/endpoints/${id}`, { method: 'DELETE' });
  }

  listWebhookEvents(params: { limit?: number; cursor?: string } = {}): Promise<Page<WebhookEvent>> {
    return this.request<Page<WebhookEvent>>(
      `/webhooks/events${this.qs({ limit: params.limit, cursor: params.cursor })}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Refunds
  // ---------------------------------------------------------------------------

  createRefund(params: CreateRefundParams): Promise<Refund> {
    return this.request<Refund>('/refunds', {
      method: 'POST',
      body:   JSON.stringify({
        transaction_id:  params.transaction_id,
        amount_minor:    params.amount_minor,
        reason:          params.reason ?? null,
        idempotency_key: params.idempotency_key ?? crypto.randomUUID(),
      }),
    });
  }

  getRefund(id: string): Promise<Refund> {
    return this.request<Refund>(`/refunds/${id}`);
  }

  listRefunds(params: { transactionId?: string; limit?: number } = {}): Promise<Page<Refund>> {
    return this.request<Page<Refund>>(
      `/refunds${this.qs({ transaction_id: params.transactionId, limit: params.limit })}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Disputes
  // ---------------------------------------------------------------------------

  openDispute(params: OpenDisputeParams): Promise<Dispute> {
    return this.request<Dispute>('/disputes', {
      method: 'POST',
      body:   JSON.stringify({
        transaction_id:    params.transaction_id,
        consumer_id:       params.consumer_id,
        amount_minor:      params.amount_minor,
        currency:          params.currency,
        reason:            params.reason,
        evidence_deadline: params.evidence_deadline ?? null,
      }),
    });
  }

  getDispute(id: string): Promise<Dispute> {
    return this.request<Dispute>(`/disputes/${id}`);
  }

  listDisputes(params: ListDisputesParams = {}): Promise<Page<Dispute>> {
    return this.request<Page<Dispute>>(
      `/disputes${this.qs({ status: params.status, limit: params.limit })}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Payment requests
  // ---------------------------------------------------------------------------

  createPaymentRequest(params: CreatePaymentRequestParams): Promise<PaymentRequest> {
    return this.request<PaymentRequest>('/payment-requests', {
      method: 'POST',
      body:   JSON.stringify({
        requester_id:    params.requester_id,
        payer_handle:    params.payer_handle ?? null,
        amount_minor:    params.amount_minor,
        currency:        params.currency,
        description:     params.description ?? null,
        expires_at:      params.expires_at ?? null,
        idempotency_key: params.idempotency_key ?? crypto.randomUUID(),
      }),
    });
  }

  getPaymentRequest(id: string): Promise<PaymentRequest> {
    return this.request<PaymentRequest>(`/payment-requests/${id}`);
  }

  listPaymentRequests(params: ListPaymentRequestsParams = {}): Promise<Page<PaymentRequest>> {
    return this.request<Page<PaymentRequest>>(
      `/payment-requests${this.qs({ status: params.status, limit: params.limit })}`,
    );
  }

  payPaymentRequest(id: string, payerId: string): Promise<PaymentRequest> {
    return this.request<PaymentRequest>(`/payment-requests/${id}/pay`, {
      method: 'POST',
      body:   JSON.stringify({ payer_id: payerId }),
    });
  }

  declinePaymentRequest(id: string, payerId: string): Promise<PaymentRequest> {
    return this.request<PaymentRequest>(`/payment-requests/${id}/decline`, {
      method: 'POST',
      body:   JSON.stringify({ payer_id: payerId }),
    });
  }

  cancelPaymentRequest(id: string, requesterId: string): Promise<PaymentRequest> {
    return this.request<PaymentRequest>(`/payment-requests/${id}/cancel`, {
      method: 'POST',
      body:   JSON.stringify({ requester_id: requesterId }),
    });
  }
}
