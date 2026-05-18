/**
 * Banzami API client for the merchant dashboard.
 *
 * This module provides the `BanzamiApi` compatibility adapter, which wraps
 * the official `@banzami/sdk` `BanzamiClient`. Dashboard components use
 * `new BanzamiApi(gatewayUrl, apiKey)` and this adapter routes calls through
 * the SDK — gaining JWT caching, exponential-backoff retries, typed errors,
 * and automatic idempotency.
 *
 * SDK-first policy: ADR-012, CLAUDE.md §14.
 *
 * Remaining direct-fetch methods (getMerchantWallet, createStaticQr, sandboxFund)
 * are marked as pending SDK support and will migrate when those SDK methods land.
 */

import { BanzamiClient } from '@banzami/sdk';

// Re-export the error type from the SDK so callers don't need a separate import.
export { BanzamiApiError } from '@banzami/sdk';

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
} from '@banzami/sdk';

// Types that the dashboard adds on top of SDK types.
export interface TransactionPage { data: Transaction[];        next_cursor?: string; }
export interface PayoutPage      { data: Payout[];             next_cursor?: string; }
export interface WebhookEventPage{ data: WebhookEvent[];       next_cursor?: string; }
export interface PaymentLinkPage { data: PaymentLink[];        next_cursor?: string; }

// Bring in the re-exported types so the inline definitions above can reference them.
import type { Transaction, Payout, WebhookEvent, PaymentLink, WalletBalance } from '@banzami/sdk';

// ---------------------------------------------------------------------------
// Compatibility adapter
// ---------------------------------------------------------------------------

/**
 * Dashboard API client.
 *
 * Drop-in replacement for the old hand-rolled `BanzamiApi` class.
 * Internally backed by `BanzamiClient` from `@banzami/sdk`.
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

  createApiKey(merchantId: string, label?: string) {
    return this.client.createApiKey(merchantId, label);
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
  // Legacy direct-fetch for methods pending SDK support
  // -------------------------------------------------------------------------

  private async _legacyReq<T>(path: string, init?: RequestInit): Promise<T> {
    // Direct fetch — only for endpoints not yet covered by the SDK.
    // Uses Bearer API key; replace with SDK method when available.
    const { BanzamiApiError } = await import('@banzami/sdk');
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
