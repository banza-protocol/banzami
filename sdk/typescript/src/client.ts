import { BanzamiApiError } from './errors.js';
import type {
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
  WebhookEndpoint,
  WebhookEvent,
} from './types.js';

export interface BanzamiClientOptions {
  /** Base URL of the Banzami API gateway, e.g. https://api.banzami.ao */
  baseUrl: string;
  /** API key used for Bearer token authentication. */
  apiKey:  string;
}

export class BanzamiClient {
  private readonly base:   string;
  private readonly apiKey: string;

  constructor({ baseUrl, apiKey }: BanzamiClientOptions) {
    this.base   = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.base}/v1${path}`, {
      ...init,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...(init?.headers ?? {}),
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
      throw new BanzamiApiError(response.status, code, message);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
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
}
