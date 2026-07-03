import { BanzamiApiError, BanzamiConfigError, BanzamiAuthError } from './errors.js';
import { WebhooksClient } from './webhooks.js';
import type {
  BanzamiEnvironment,
  BusinessCategory,
  PricingProfile,
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
  BusinessProfile,
  ApiKey,
  NewApiKey,
  PaymentLink,
  PaymentQr,
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
  ApplicationSettlement,
  CreateApplicationSettlementParams,
  WalletAccount,
  CreateWalletAccountParams,
  CreateBusinessApplicationSettlementParams,
  PaymentSession,
  PaymentSessionInterface,
  CreatePaymentSessionParams,
} from './types.js';

const DEFAULT_BASE_URLS: Record<BanzamiEnvironment, string> = {
  live:    'https://api.banzami.com',
  sandbox: 'https://sandbox-api.banzami.com',
};

/**
 * Canonical pay-page host per environment — the base the SDK uses to
 * build the official payment QR payload (`${payBase}/pay/${slug}`). Override
 * via the `payBaseUrl` option. Both environments resolve to the same
 * host today; kept as a map so they can diverge without an API change.
 */
const DEFAULT_PAY_BASE_URLS: Record<BanzamiEnvironment, string> = {
  live:    'https://pay.banzami.com',
  sandbox: 'https://pay.banzami.com',
};

/** Gateway endpoint that exchanges a raw API key for a short-lived JWT. */
const AUTH_TOKEN_PATH = '/v1/auth/token';
/** Re-exchange this many ms before the JWT actually expires. */
const TOKEN_REFRESH_SKEW_MS = 60_000;
/** Fallback JWT lifetime if the auth response omits `expires_at`. */
const DEFAULT_TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

/**
 * Classify an API key by its prefix. The Banzami key model is Stripe-like:
 * every key carries its environment in the prefix, so a key can never be used
 * against the wrong universe by accident.
 *
 *   bz_test_…  (incl. bz_test_sk_…, bz_test_pk_…) → sandbox
 *   bz_live_…  (incl. bz_live_sk_…, bz_live_pk_…) → live
 *
 * Returns `null` for keys with no recognised prefix (e.g. empty or placeholder
 * values) so the caller can fall back to an explicit environment.
 */
export function environmentFromKey(apiKey: string): BanzamiEnvironment | null {
  if (apiKey.startsWith('bz_test_')) return 'sandbox';
  if (apiKey.startsWith('bz_live_')) return 'live';
  return null;
}

/**
 * Resolve the effective environment from the explicit option, the key prefix,
 * and the base URL — and reject definite mismatches.
 *
 * Precedence:
 *   1. If `environment` is explicit, it wins — but if the key prefix clearly
 *      disagrees, throw `BanzamiConfigError` (e.g. live env + bz_test_ key).
 *   2. Otherwise infer from the key prefix.
 *   3. Otherwise, if the base URL mentions "sandbox", use sandbox.
 *   4. Otherwise default to `live` (historical default; preserved for
 *      backward compatibility with keys that carry no recognised prefix).
 */
export function resolveEnvironment(
  apiKey:       string,
  environment?: BanzamiEnvironment,
  baseUrl?:     string,
): BanzamiEnvironment {
  const keyEnv = environmentFromKey(apiKey);

  if (environment) {
    if (keyEnv && keyEnv !== environment) {
      const prefix = keyEnv === 'sandbox' ? 'bz_test_' : 'bz_live_';
      const expected = environment === 'live' ? 'bz_live_' : 'bz_test_';
      throw new BanzamiConfigError(
        `Banzami environment/key mismatch: ${environment} environment cannot use ` +
        `${keyEnv} key (key starts with "${prefix}"). Use a ${expected} key for the ` +
        `${environment} environment, or set environment: '${keyEnv}'.`,
      );
    }
    return environment;
  }

  if (keyEnv) return keyEnv;
  if (baseUrl && /sandbox/i.test(baseUrl)) return 'sandbox';
  return 'live';
}

export interface BanzamiHooks {
  /** Called before every HTTP attempt, including retries. */
  onRequest?:  (method: string, path: string, attempt: number) => void;
  /** Called after every successful HTTP response. */
  onResponse?: (method: string, path: string, status: number, durationMs: number) => void;
  /** Called once after all retry attempts are exhausted. */
  onError?:    (method: string, path: string, error: Error, attempts: number) => void;
}

export interface BanzamiClientOptions {
  /** Secret API key for this client (`bz_live_sk_…` or `bz_test_sk_…`). The
   *  prefix determines the environment; never expose a secret key in browser
   *  or mobile code. */
  apiKey:         string;
  /**
   * Which data universe to operate in. If omitted, it is inferred from the key
   * prefix (`bz_test_…` → sandbox, `bz_live_…` → live), then from the base URL.
   * If provided explicitly and it conflicts with the key prefix, the
   * constructor throws `BanzamiConfigError`.
   */
  environment?:   BanzamiEnvironment;
  /** Override the API base URL. Defaults to the canonical URL for the chosen environment. */
  baseUrl?:       string;
  /**
   * Override the pay-page base used to build the official payment QR
   * payload (`${payBaseUrl}/pay/${slug}`). Defaults to the canonical pay host
   * for the chosen environment (https://pay.banzami.com).
   */
  payBaseUrl?:    string;
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

export class BanzamiClient {
  private readonly base:        string;
  private readonly payBase:     string;
  private readonly apiKey:      string;
  readonly environment:         BanzamiEnvironment;
  private readonly maxRetries:  number;
  private readonly retryDelay:  number;
  private readonly hooks:       BanzamiHooks;

  // ── Auth: the gateway is JWT-authenticated. The raw API key is
  // exchanged for a short-lived JWT (cached in memory) and that JWT is
  // sent as the Bearer token on every protected request. The raw API key
  // only ever leaves the process to hit AUTH_TOKEN_PATH.
  private accessToken?:          string;
  private accessTokenExpiresAt?: number;     // epoch ms
  private tokenInFlight?:        Promise<string>;

  /**
   * Webhook verification and test-helper methods.
   * Requires `webhookSecret` in the constructor options to call `constructEvent()`.
   */
  readonly webhooks: WebhooksClient;

  get isSandbox():    boolean { return this.environment === 'sandbox'; }
  get isProduction(): boolean { return this.environment === 'live'; }

  constructor({
    apiKey,
    environment,
    baseUrl,
    payBaseUrl,
    maxRetries = 3,
    retryDelay = 500,
    hooks = {},
    webhookSecret,
  }: BanzamiClientOptions) {
    this.apiKey      = apiKey;
    this.environment = resolveEnvironment(apiKey, environment, baseUrl);
    this.base        = (baseUrl ?? DEFAULT_BASE_URLS[this.environment]).replace(/\/$/, '');
    this.payBase     = (payBaseUrl ?? DEFAULT_PAY_BASE_URLS[this.environment]).replace(/\/$/, '');
    this.maxRetries  = maxRetries;
    this.retryDelay  = retryDelay;
    this.hooks       = hooks;
    this.webhooks    = new WebhooksClient(webhookSecret);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Return a valid access token, exchanging the API key for a fresh JWT
   * when the cached one is missing or about to expire. Concurrent callers
   * share a single in-flight exchange. The raw API key is never logged.
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (
      this.accessToken &&
      this.accessTokenExpiresAt &&
      now < this.accessTokenExpiresAt - TOKEN_REFRESH_SKEW_MS
    ) {
      return this.accessToken;
    }
    if (!this.tokenInFlight) {
      this.tokenInFlight = this.exchangeApiKeyForToken()
        .finally(() => { this.tokenInFlight = undefined; });
    }
    return this.tokenInFlight;
  }

  /** Invalidate the cached token (forces a fresh exchange next call). */
  private invalidateToken(): void {
    this.accessToken = undefined;
    this.accessTokenExpiresAt = undefined;
  }

  private async exchangeApiKeyForToken(): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.base}${AUTH_TOKEN_PATH}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ api_key: this.apiKey }),
      });
    } catch {
      throw new BanzamiAuthError('Unable to exchange Banzami API key for access token');
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new BanzamiAuthError('Invalid or unauthorized Banzami API key');
      }
      throw new BanzamiAuthError('Unable to exchange Banzami API key for access token');
    }

    const data = await response.json().catch(() => ({})) as {
      token?: string;
      expires_at?: string;
    };
    if (!data.token) {
      throw new BanzamiAuthError('Unable to exchange Banzami API key for access token');
    }

    const expiresAt = data.expires_at ? Date.parse(data.expires_at) : NaN;
    this.accessToken = data.token;
    this.accessTokenExpiresAt = Number.isFinite(expiresAt)
      ? expiresAt
      : Date.now() + DEFAULT_TOKEN_TTL_MS;
    return data.token;
  }

  private async executeOnce<T>(
    path: string,
    init?: RequestInit,
    idempotencyKey?: string,
    attempt = 0,
    reauthed = false,
  ): Promise<T> {
    const extraHeaders: Record<string, string> = {};
    if (idempotencyKey !== undefined) {
      extraHeaders['Idempotency-Key'] = idempotencyKey;
    }

    const method = (init?.method ?? 'GET').toUpperCase();
    this.hooks.onRequest?.(method, path, attempt);
    const t0 = Date.now();

    const token = await this.getAccessToken();
    const response = await fetch(`${this.base}/v1${path}`, {
      ...init,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
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

      // A previously-valid JWT may have expired or been rotated → the
      // gateway answers 401. Re-exchange once and retry before surfacing.
      if (response.status === 401 && !reauthed && (code === 'INVALID_TOKEN' || code === 'UNAUTHORIZED')) {
        this.invalidateToken();
        return this.executeOnce<T>(path, init, idempotencyKey, attempt, true);
      }

      throw new BanzamiApiError(response.status, code, message);
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
    let lastErr: BanzamiApiError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise<void>(r => setTimeout(r, this.retryDelay * 2 ** (attempt - 1)));
      }
      try {
        return await this.executeOnce<T>(path, init, idempotencyKey, attempt);
      } catch (err) {
        if (err instanceof BanzamiApiError && this.shouldRetry(err.status, attempt)) {
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
    /**
     * BANZA ADR-039 fee references — operator-internal categorization only.
     * Reference only: the SDK never sends or receives a fee/percentage; the
     * operator resolves any fee internally. Omitting these keeps the legacy
     * zero-fee behaviour (backwards compatible).
     */
    businessCategory?: BusinessCategory;
    pricingProfile?:   PricingProfile;
    feePolicyRef?:     string;
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
        // references only; omitted when unset so the operator treats them as unpriced
        ...(params.businessCategory ? { business_category: params.businessCategory } : {}),
        ...(params.pricingProfile   ? { pricing_profile:   params.pricingProfile   } : {}),
        ...(params.feePolicyRef     ? { fee_policy_ref:    params.feePolicyRef     } : {}),
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

  /**
   * Settle accumulated net value from one of YOUR wallets to a beneficiary,
   * splitting off an application fee. The operator moves the money: it reads the
   * gross from the source wallet's available balance and resolves the fee from
   * `feePolicyRef` (you never send an amount or a fee). Idempotent on
   * `idempotencyKey`. Completion is also delivered as an
   * `application_settlement.completed` webhook. Account ids are never exposed.
   */
  createApplicationSettlement(p: CreateApplicationSettlementParams): Promise<ApplicationSettlement> {
    return this.request<ApplicationSettlement>('/application-settlements', {
      method: 'POST',
      body:   JSON.stringify({
        idempotency_key:           p.idempotencyKey,
        owner_ref:                 p.ownerRef,
        source_wallet_id:          p.sourceWalletId,
        beneficiary_wallet_id:     p.beneficiaryWalletId,
        application_fee_wallet_id: p.applicationFeeWalletId,
        fee_policy_ref:            p.feePolicyRef,
        business_category:         p.businessCategory,
        pricing_profile:           p.pricingProfile,
      }),
    });
  }

  getApplicationSettlement(id: string): Promise<ApplicationSettlement> {
    return this.request<ApplicationSettlement>(`/application-settlements/${id}`);
  }

  // ---------------------------------------------------------------------------
  // Wallet Accounts (ADR-042) — segregated accounts within a wallet
  // ---------------------------------------------------------------------------

  /** Open a segregated account inside a wallet you own (e.g. a CAMPAIGN account
   *  to isolate a fundraiser). Idempotent on (wallet, purpose, reference). */
  createWalletAccount(p: CreateWalletAccountParams): Promise<WalletAccount> {
    return this.request<WalletAccount>('/business/wallet-accounts', {
      method: 'POST',
      body:   JSON.stringify({
        wallet_id:      p.walletId,
        purpose:        p.purpose,
        reference_type: p.referenceType ?? null,
        reference_id:   p.referenceId ?? null,
        label:          p.label ?? null,
      }),
    });
  }

  listWalletAccounts(walletId: string): Promise<{ data: WalletAccount[] }> {
    return this.request<{ data: WalletAccount[] }>(
      `/business/wallet-accounts${this.qs({ wallet_id: walletId })}`,
    );
  }

  getWalletAccount(id: string): Promise<WalletAccount> {
    return this.request<WalletAccount>(`/business/wallet-accounts/${id}`);
  }

  // ---------------------------------------------------------------------------
  // Application Settlement — app-defined fee (ADR-029)
  // ---------------------------------------------------------------------------

  /** Settle a segregated account: the APP defines the fee rate
   *  (`applicationFeeBps`); the operator reads the real balance as the gross,
   *  resolves the @banza beneficiary / fee destination, splits and audits it.
   *  You send no amount and never compute the fee. Idempotent on `idempotencyKey`. */
  createBusinessApplicationSettlement(
    p: CreateBusinessApplicationSettlementParams,
  ): Promise<ApplicationSettlement> {
    return this.request<ApplicationSettlement>('/business/application-settlements', {
      method: 'POST',
      body:   JSON.stringify({
        idempotency_key:            p.idempotencyKey,
        source_account_id:          p.sourceAccountId,
        beneficiary_banza_name:     p.beneficiaryBanzaName,
        fee_destination_banza_name: p.feeDestinationBanzaName ?? null,
        application_fee_bps:        p.applicationFeeBps,
        reason:                     p.reason ?? 'CAMPAIGN_CLOSE',
        reference_type:             p.referenceType ?? null,
        reference_id:               p.referenceId ?? null,
      }),
    });
  }

  /** Resolve a @banza handle to confirm it exists and can receive funds (used to
   *  validate a beneficiary before settlement). Consumer handles today. */
  resolveHandle(handle: string): Promise<Consumer> {
    return this.getConsumerByHandle(handle);
  }

  // ---------------------------------------------------------------------------
  // Payment Sessions (ADR-043) — one financial object bound to a wallet account
  // ---------------------------------------------------------------------------

  /** Create a Payment Session that credits a segregated wallet account (e.g. a
   *  CAMPAIGN account). Returns the session with its display interfaces (link,
   *  deep link, QR). Omit `amountMinor` for an open-amount session. */
  createPaymentSession(p: CreatePaymentSessionParams): Promise<PaymentSession> {
    return this.request<PaymentSession>('/business/payment-sessions', {
      method: 'POST',
      body:   JSON.stringify({
        wallet_account_id: p.walletAccountId,
        purpose:           p.purpose ?? null,
        reference_type:    p.referenceType ?? null,
        reference_id:      p.referenceId ?? null,
        amount_minor:      p.amountMinor ?? null,
        currency:          p.currency ?? 'AOA',
        description:       p.description ?? null,
        expires_at:        p.expiresAt ? p.expiresAt.toISOString() : null,
        metadata:          p.metadata ?? null,
      }),
    });
  }

  getPaymentSession(id: string): Promise<PaymentSession> {
    return this.request<PaymentSession>(`/business/payment-sessions/${id}`);
  }

  /** List this merchant's payment sessions, newest first. Optional status filter. */
  listPaymentSessions(params: { status?: string; limit?: number } = {}): Promise<{ data: PaymentSession[] }> {
    return this.request<{ data: PaymentSession[] }>(
      `/business/payment-sessions${this.qs({ status: params.status, limit: params.limit })}`,
    );
  }

  /** Find one interface kind on a session (e.g. the DYNAMIC_QR payload to show). */
  paymentSessionInterface(
    session: PaymentSession,
    type: PaymentSessionInterface['type'],
  ): PaymentSessionInterface | undefined {
    return session.interfaces.find(i => i.type === type);
  }

  // ---------------------------------------------------------------------------
  // Merchants
  // ---------------------------------------------------------------------------

  getMerchant(id: string): Promise<Merchant> {
    return this.request<Merchant>(`/merchants/${id}`);
  }

  /**
   * Resolve the authenticated Business account's own consolidated profile —
   * handle, account type, category, wallet + KYB readiness — so an integrating
   * application can render an accurate "Integration Health" view instead of
   * inferring from local env vars. Self-scoped to the key's business; returns
   * only non-secret fields.
   */
  getBusinessMe(): Promise<BusinessProfile> {
    return this.request<BusinessProfile>('/business/me');
  }

  listApiKeys(merchantId: string): Promise<ApiKey[]> {
    return this.request<ApiKey[]>(`/merchants/${merchantId}/api-keys`);
  }

  /**
   * Create an API key. `environment` selects the data universe the key operates
   * in: `'LIVE'` (default, `bz_live_` prefix) or `'SANDBOX'` (`bz_test_` prefix).
   * Live and sandbox keys never share financial data.
   */
  createApiKey(
    merchantId: string,
    label?: string,
    environment: 'LIVE' | 'SANDBOX' = 'LIVE',
  ): Promise<NewApiKey> {
    return this.request<NewApiKey>(`/merchants/${merchantId}/api-keys`, {
      method: 'POST',
      body:   JSON.stringify({ label: label ?? null, environment }),
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
  // Payment QR
  //
  // The official, renderable QR payload for a payment link is owned by the
  // SDK. Integrators encode `qrValue` into a QR image and never construct
  // that value themselves — so the payload format can evolve here without
  // every integration changing.
  // ---------------------------------------------------------------------------

  /**
   * Build the official QR payload for a payment link the caller already
   * holds — no network call. `qrValue` is the canonical Banzami pay URL;
   * encode it into a QR image as-is. Optionally enrich with the recipient
   * identity the caller knows (the gateway does not return it on the link).
   */
  paymentLinkQr(
    link: PaymentLink,
    opts: { recipientName?: string | null; recipientHandle?: string | null } = {},
  ): PaymentQr {
    const paymentUrl = `${this.payBase}/pay/${link.slug}`;
    return {
      qrValue:         paymentUrl,
      paymentUrl,
      slug:            link.slug,
      paymentLinkId:   link.id,
      amountMinor:     link.amount_minor ?? null,
      currency:        link.currency,
      description:     link.description ?? null,
      recipientName:   opts.recipientName ?? null,
      recipientHandle: opts.recipientHandle ?? null,
      environment:     this.environment,
      isSandbox:       this.isSandbox,
      status:          link.status,
    };
  }

  /**
   * Fetch a payment link by id (JWT-authenticated) and return its official
   * QR payload + metadata. Prefer {@link paymentLinkQr} when you already
   * hold the PaymentLink object, to avoid a round-trip.
   */
  async getPaymentLinkQr(
    id: string,
    opts: { recipientName?: string | null; recipientHandle?: string | null } = {},
  ): Promise<PaymentQr> {
    const link = await this.getPaymentLink(id);
    return this.paymentLinkQr(link, opts);
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
    // A refund always names its TYPED source explicitly (BANZA ADR-030) — the
    // SDK never infers a source type from an arbitrary id.
    //
    // idempotency_key is MANDATORY and is validated BEFORE any HTTP dispatch: a
    // refund moves money, and an SDK-generated random key would let a retried
    // refund create a second movement. The caller owns the key (server-side,
    // persisted, scoped to the refund intent). No auto-generation here.
    if (typeof params.idempotency_key !== 'string' || params.idempotency_key.trim() === '') {
      throw new BanzamiConfigError(
        'createRefund requires an explicit idempotency_key (a stable, server-generated key scoped to the refund intent). The SDK does not generate one for financial writes.',
      );
    }
    return this.request<Refund>('/refunds', {
      method: 'POST',
      body:   JSON.stringify({
        source_type:     params.source_type,
        source_id:       params.source_id,
        amount_minor:    params.amount_minor,
        currency:        params.currency,
        reason:          params.reason ?? null,
        idempotency_key: params.idempotency_key,
      }),
    });
  }

  getRefund(id: string): Promise<Refund> {
    return this.request<Refund>(`/refunds/${id}`);
  }

  listRefunds(params: { sourceId?: string; limit?: number } = {}): Promise<Page<Refund>> {
    return this.request<Page<Refund>>(
      `/refunds${this.qs({ source_id: params.sourceId, limit: params.limit })}`,
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
