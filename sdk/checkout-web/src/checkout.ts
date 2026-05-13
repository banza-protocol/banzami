import { CheckoutApi, BanzamiApiError } from './api';
import type { CreateLinkOptions, PaymentLink } from './api';
import { CheckoutModal } from './modal';

export interface BanzamiCheckoutConfig {
  /** Base URL of the Banzami API gateway. */
  gatewayUrl: string;
  /** Merchant API key (bz_live_... or bz_test_...). */
  apiKey:     string;
  /** Merchant ID — all payment links are created under this merchant. */
  merchantId: string;
  /** Wallet ID that receives the payments. */
  walletId:   string;
}

export interface OpenOptions {
  /** Payment amount in minor units (integer kwanzas for AOA). Omit for open-amount links. */
  amountMinor?: number;
  currency:     string;
  description?: string;
  /** Link expiry. Defaults to 30 minutes from now. */
  expiresAt?:   Date;
  onSuccess?:   (link: PaymentLink) => void;
  onError?:     (err: BanzamiApiError | Error) => void;
  onCancel?:    () => void;
}

export class BanzamiCheckout {
  private readonly api:   CheckoutApi;
  private readonly modal: CheckoutModal;
  private readonly cfg:   BanzamiCheckoutConfig;

  constructor(config: BanzamiCheckoutConfig) {
    this.cfg   = config;
    this.api   = new CheckoutApi(config.gatewayUrl, config.apiKey);
    this.modal = new CheckoutModal();
  }

  /**
   * Create a payment link and open the checkout modal.
   *
   * Returns a Promise that resolves once the link is created and the modal
   * is open. Payment completion is signalled via `onSuccess`.
   */
  async open(opts: OpenOptions): Promise<PaymentLink> {
    const expiresAt = opts.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000);

    let link: PaymentLink;
    try {
      link = await this.api.createPaymentLink({
        merchantId:   this.cfg.merchantId,
        walletId:     this.cfg.walletId,
        amountMinor:  opts.amountMinor,
        currency:     opts.currency,
        description:  opts.description,
        expiresAt,
      } satisfies CreateLinkOptions);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      opts.onError?.(error);
      throw error;
    }

    this.modal.open(
      link,
      {
        onSuccess: (l) => opts.onSuccess?.(l),
        onCancel:  () => opts.onCancel?.(),
      },
      () => this.api.getStatus(link.slug),
    );

    return link;
  }

  /** Programmatically close the checkout modal. */
  close(): void {
    this.modal.close();
  }
}
