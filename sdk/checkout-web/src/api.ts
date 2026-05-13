export interface PaymentLink {
  id:           string;
  slug:         string;
  amount_minor: number | null;
  currency:     string;
  description:  string | null;
  status:       'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELLED';
}

export interface CreateLinkOptions {
  merchantId:   string;
  walletId:     string;
  amountMinor?: number;
  currency:     string;
  description?: string;
  expiresAt?:   Date;
}

export class BanzamiApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'BanzamiApiError';
  }
}

export class CheckoutApi {
  constructor(
    private readonly gatewayUrl: string,
    private readonly apiKey: string,
  ) {}

  async createPaymentLink(opts: CreateLinkOptions): Promise<PaymentLink> {
    const res = await fetch(`${this.gatewayUrl}/v1/payment-links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        merchant_id:  opts.merchantId,
        wallet_id:    opts.walletId,
        amount_minor: opts.amountMinor ?? null,
        currency:     opts.currency,
        description:  opts.description ?? null,
        expires_at:   opts.expiresAt?.toISOString() ?? null,
      }),
    });
    if (!res.ok) {
      throw new BanzamiApiError(`Failed to create payment link: ${res.status}`, res.status);
    }
    return res.json();
  }

  async getStatus(slug: string): Promise<{ paid: boolean }> {
    const res = await fetch(`${this.gatewayUrl}/public/pay/${encodeURIComponent(slug)}/status`);
    if (!res.ok) throw new BanzamiApiError(`Status check failed: ${res.status}`, res.status);
    return res.json();
  }
}

export function formatAmount(amountMinor: number, currency: string): string {
  if (currency.toUpperCase() === 'AOA') {
    return `${amountMinor.toLocaleString('pt-AO')} Kz`;
  }
  return new Intl.NumberFormat('pt-AO', { style: 'currency', currency }).format(
    amountMinor / 100,
  );
}
