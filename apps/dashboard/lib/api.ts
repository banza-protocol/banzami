/**
 * Banzami API client for the merchant dashboard.
 *
 * This module provides the `BanzamiApi` compatibility adapter, which wraps
 * the official `@banza/sdk` `BanzamiClient`. Dashboard components use
 * `new BanzamiApi(gatewayUrl, apiKey)` and this adapter routes calls through
 * the SDK — gaining JWT caching, exponential-backoff retries, typed errors,
 * and automatic idempotency.
 *
 * SDK-first policy: ADR-012, CLAUDE.md §14.
 *
 * Remaining direct-fetch methods (getMerchantWallet, createStaticQr, sandboxFund)
 * are marked as pending SDK support and will migrate when those SDK methods land.
 */

import { BanzamiClient } from '@banza/sdk';

// Re-export the error type from the SDK so callers don't need a separate import.
export { BanzamiApiError } from '@banza/sdk';

// Re-export types from the SDK for use in dashboard components.
export type {
  Transaction,
  Wallet,
  WalletBalance,
  Payout,
  Merchant,
  ApiKey,
  NewApiKey,
  WebhookEndpoint,
  WebhookEvent,
  PaymentLink,
  QrResponse,
  Page,
} from '@banza/sdk';

// Types that the dashboard adds on top of SDK types.
export interface TransactionPage { data: Transaction[];        next_cursor?: string; }
export interface PayoutPage      { data: Payout[];             next_cursor?: string; }
export interface WebhookEventPage{ data: WebhookEvent[];       next_cursor?: string; }
export interface PaymentLinkPage { data: PaymentLink[];        next_cursor?: string; }

export interface Refund {
  id:             string;
  transaction_id: string;
  merchant_id:    string;
  consumer_id:    string | null;
  wallet_id:      string;
  amount_minor:   number;
  currency:       string;
  reason:         string | null;
  status:         string;
  failure_reason: string | null;
  processed_at:   string | null;
  created_at:     string;
  updated_at:     string;
}

export interface RefundPage { data: Refund[] }

export type TeamRole   = 'VIEWER' | 'OPERATOR';
export type TeamStatus = 'INVITED' | 'ACTIVE' | 'REMOVED';
export interface TeamMember {
  id:         string;
  email:      string;
  role:       TeamRole;
  status:     TeamStatus;
  invited_at: string;
  joined_at?: string;
}
export interface AccessLogEntry {
  id:          string;
  member_id?:  string;
  actor_email: string;
  action:      string;
  created_at:  string;
}

export interface AnalyticsDailyPoint { day: string;  count: number; volume_minor: number; }
export interface AnalyticsHourPoint  { hour: number; count: number; volume_minor: number; }
export interface MerchantAnalytics {
  wallet_id:          string;
  currency:           string;
  from?:              string;
  to?:                string;
  total_volume_minor: number;
  total_count:        number;
  active_days:        number;
  daily:              AnalyticsDailyPoint[];
  by_hour:            AnalyticsHourPoint[];
}

export interface Dispute {
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

export interface DisputePage { data: Dispute[] }

export interface WebhookDelivery {
  id:           string;
  endpoint_id:  string;
  event_id:     string;
  status:       'PENDING' | 'DELIVERED' | 'FAILED' | 'RETRYING';
  attempt:      number;
  next_attempt?: string;
  last_error?:  string;
  created_at:   string;
  updated_at:   string;
}

export interface EndpointHealth {
  endpoint_id:      string;
  total_24h:        number;
  delivered_24h:    number;
  failed_24h:       number;
  last_delivery_at: string | null;
  last_status:      string | null;
  success_rate_pct: number;
}

// Bring in the re-exported types so the inline definitions above can reference them.
import type { Transaction, Payout, WebhookEvent, PaymentLink, WalletBalance } from '@banza/sdk';

// ---------------------------------------------------------------------------
// Compatibility adapter
// ---------------------------------------------------------------------------

/**
 * Dashboard API client.
 *
 * Drop-in replacement for the old hand-rolled `BanzamiApi` class.
 * Internally backed by `BanzamiClient` from `@banza/sdk`.
 *
 * @example
 * ```typescript
 * const session = getSession();
 * const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
 * const page = await api.listTransactions({ limit: 25 });
 * ```
 */
export class BanzamiApi {
  private readonly client: BanzamiClient;
  private readonly base:   string;
  private readonly apiKey: string;

  constructor(gatewayUrl: string, apiKey: string) {
    this.base   = gatewayUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.client = new BanzamiClient({
      apiKey,
      environment: apiKey.startsWith('bz_test_') ? 'sandbox' : 'live',
      baseUrl:     gatewayUrl,
    });
  }

  // -------------------------------------------------------------------------
  // Transactions — delegated to SDK
  // -------------------------------------------------------------------------

  listTransactions(opts: { limit?: number; cursor?: string; status?: string } = {}): Promise<TransactionPage> {
    return this.client.listTransactions(opts) as Promise<TransactionPage>;
  }

  getTransaction(id: string): Promise<Transaction> {
    return this.client.getTransaction(id);
  }

  // -------------------------------------------------------------------------
  // Wallets — partially delegated to SDK
  // -------------------------------------------------------------------------

  getWallet(id: string) {
    return this.client.getWallet(id);
  }

  /**
   * @deprecated Pending SDK support for wallet-by-currency lookup.
   * The SDK requires a wallet ID; this method falls back to a direct request.
   */
  async getMerchantWallet(currency = 'AOA') {
    return this._legacyReq<{ id: string; merchant_id?: string; currency: string; status: string; created_at: string }>(
      `/wallets?currency=${encodeURIComponent(currency)}`,
    );
  }

  getWalletBalance(id: string): Promise<WalletBalance> {
    return this.client.getWalletBalance(id);
  }

  // -------------------------------------------------------------------------
  // Analytics — merchant payment volume, aggregated from the ledger
  // -------------------------------------------------------------------------

  getAnalytics(walletId: string, from?: string, to?: string): Promise<MerchantAnalytics> {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    const qs = params.toString();
    return this._legacyReq<MerchantAnalytics>(
      `/wallets/${encodeURIComponent(walletId)}/analytics${qs ? `?${qs}` : ''}`,
    );
  }

  // -------------------------------------------------------------------------
  // Team & permissions
  // -------------------------------------------------------------------------

  listTeamMembers(): Promise<{ data: TeamMember[] }> {
    return this._legacyReq<{ data: TeamMember[] }>('/team/members');
  }

  inviteTeamMember(email: string, role: 'VIEWER' | 'OPERATOR'): Promise<TeamMember> {
    return this._legacyReq<TeamMember>('/team/members', {
      method: 'POST',
      body:   JSON.stringify({ email, role }),
    });
  }

  removeTeamMember(id: string): Promise<void> {
    return this._legacyReq<void>(`/team/members/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  listAccessLog(limit = 50): Promise<{ data: AccessLogEntry[] }> {
    return this._legacyReq<{ data: AccessLogEntry[] }>(`/team/access-log?limit=${limit}`);
  }

  // -------------------------------------------------------------------------
  // Payouts — delegated to SDK
  // -------------------------------------------------------------------------

  listPayouts(opts: { limit?: number; cursor?: string } = {}): Promise<PayoutPage> {
    return this.client.listPayouts(opts) as Promise<PayoutPage>;
  }

  createPayout(opts: {
    walletId:          string;
    amountMinor:       number;
    currency?:         string;
    bankAccountNumber: string;
    bankCode:          string;
    accountHolderName: string;
  }): Promise<Payout> {
    return this.client.createPayout(opts.walletId, opts.amountMinor, opts.currency) as Promise<Payout>;
  }

  // -------------------------------------------------------------------------
  // Merchants / API keys — delegated to SDK
  // -------------------------------------------------------------------------

  getMerchant(id: string) {
    return this.client.getMerchant(id);
  }

  listApiKeys(merchantId: string) {
    return this.client.listApiKeys(merchantId);
  }

  createApiKey(merchantId: string, label?: string, environment: 'LIVE' | 'SANDBOX' = 'LIVE') {
    return this.client.createApiKey(merchantId, label, environment);
  }

  revokeApiKey(merchantId: string, keyId: string) {
    return this.client.revokeApiKey(merchantId, keyId);
  }

  // -------------------------------------------------------------------------
  // Webhooks — delegated to SDK
  // -------------------------------------------------------------------------

  listWebhookEndpoints() {
    return this.client.listWebhookEndpoints();
  }

  registerWebhookEndpoint(url: string, events: string[]) {
    return this.client.registerWebhookEndpoint(url, events);
  }

  deleteWebhookEndpoint(id: string) {
    return this.client.deleteWebhookEndpoint(id);
  }

  listWebhookEvents(opts: { limit?: number; cursor?: string } = {}): Promise<WebhookEventPage> {
    return this.client.listWebhookEvents(opts) as Promise<WebhookEventPage>;
  }

  /** @deprecated Pending SDK support for endpoint health. */
  getEndpointHealth(endpointId: string): Promise<EndpointHealth> {
    return this._legacyReq<EndpointHealth>(`/webhooks/endpoints/${encodeURIComponent(endpointId)}/health`);
  }

  /** @deprecated Pending SDK support for delivery replay. */
  replayDelivery(deliveryId: string): Promise<WebhookDelivery> {
    return this._legacyReq<WebhookDelivery>(`/webhooks/deliveries/${encodeURIComponent(deliveryId)}/replay`, { method: 'POST' });
  }

  listEventDeliveries(eventId: string): Promise<{ data: WebhookDelivery[] }> {
    return this._legacyReq<{ data: WebhookDelivery[] }>(`/webhooks/events/${encodeURIComponent(eventId)}/deliveries`);
  }

  // -------------------------------------------------------------------------
  // Payment links — delegated to SDK
  // -------------------------------------------------------------------------

  listPaymentLinks(opts: { merchantId: string; limit?: number; cursor?: string }): Promise<PaymentLinkPage> {
    return this.client.listPaymentLinks(opts) as Promise<PaymentLinkPage>;
  }

  createPaymentLink(opts: {
    merchantId:   string;
    walletId:     string;
    amountMinor?: number | null;
    currency?:    string;
    description?: string;
    expiresAt?:   string;
  }): Promise<PaymentLink> {
    return this.client.createPaymentLink({
      merchantId:   opts.merchantId,
      walletId:     opts.walletId,
      amountMinor:  opts.amountMinor ?? undefined,
      currency:     opts.currency,
      description:  opts.description,
      expiresAt:    opts.expiresAt ? new Date(opts.expiresAt) : undefined,
    });
  }

  getPaymentLink(id: string) {
    return this.client.getPaymentLink(id);
  }

  cancelPaymentLink(id: string) {
    return this.client.cancelPaymentLink(id);
  }

  // -------------------------------------------------------------------------
  // QR — partially pending SDK support
  // -------------------------------------------------------------------------

  /**
   * @deprecated Pending SDK support for owner_type and currency params.
   */
  createStaticQr(opts: { ownerId: string; ownerType: 'MERCHANT' | 'CONSUMER'; currency?: string }) {
    return this._legacyReq<{ qr_code: unknown; payload: string }>('/qr/static', {
      method: 'POST',
      body:   JSON.stringify({
        owner_id:   opts.ownerId,
        owner_type: opts.ownerType,
        currency:   opts.currency ?? 'AOA',
      }),
    });
  }

  // -------------------------------------------------------------------------
  // Sandbox helpers — pending SDK support
  // -------------------------------------------------------------------------

  /**
   * @deprecated Pending SDK support for sandbox simulation endpoints.
   */
  sandboxFund(amountMinor: number, currency = 'AOA') {
    return this._legacyReq<{ funded: boolean; new_balance: WalletBalance; credited_minor: number }>(
      '/sandbox/fund',
      {
        method: 'POST',
        body:   JSON.stringify({ amount_minor: amountMinor, currency }),
      },
    );
  }

  // -------------------------------------------------------------------------
  // Refunds — pending SDK support
  // -------------------------------------------------------------------------

  listRefunds(opts: { transaction_id?: string; limit?: number } = {}): Promise<RefundPage> {
    const params = new URLSearchParams();
    if (opts.transaction_id) params.set('transaction_id', opts.transaction_id);
    if (opts.limit)          params.set('limit', String(opts.limit));
    return this._legacyReq<RefundPage>(`/refunds?${params}`);
  }

  createRefund(opts: {
    transaction_id:  string;
    amount_minor:    number;
    reason?:         string;
    idempotency_key: string;
  }): Promise<Refund> {
    return this._legacyReq<Refund>('/refunds', {
      method: 'POST',
      body:   JSON.stringify(opts),
    });
  }

  // -------------------------------------------------------------------------
  // Disputes — pending SDK support
  // -------------------------------------------------------------------------

  listDisputes(opts: { status?: string; limit?: number } = {}): Promise<DisputePage> {
    const params = new URLSearchParams();
    if (opts.status) params.set('status', opts.status);
    if (opts.limit)  params.set('limit', String(opts.limit));
    return this._legacyReq<DisputePage>(`/disputes?${params}`);
  }

  openDispute(opts: {
    transaction_id: string;
    consumer_id:    string;
    reason:         string;
  }): Promise<Dispute> {
    return this._legacyReq<Dispute>('/disputes', {
      method: 'POST',
      body:   JSON.stringify(opts),
    });
  }

  // -------------------------------------------------------------------------
  // Legacy direct-fetch for methods pending SDK support
  // -------------------------------------------------------------------------

  private async _legacyReq<T>(path: string, init?: RequestInit): Promise<T> {
    // Direct fetch — only for endpoints not yet covered by the SDK.
    // Uses Bearer API key; replace with SDK method when available.
    const { BanzamiApiError } = await import('@banza/sdk');
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
}
