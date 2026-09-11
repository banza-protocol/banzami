import { BanzamiCheckoutError, DEFAULT_PAY_URL, assertNoCredential, paymentLinkSlug, payPageUrl } from './api';
import { CheckoutModal } from './modal';

export interface BanzamiCheckoutConfig {
  /** Origin of the hosted payer page. Defaults to https://pay.banzami.com. */
  payUrl?: string;
}

export interface OpenOptions {
  /**
   * The payment link YOUR SERVER created with the server SDK — its slug, or its
   * pay.banzami.com URL. The browser never creates one.
   */
  link:         string;
  /** What to show while the payer decides. Display only — the link fixes the amount. */
  amountMinor?: number | null;
  currency?:    string;
  description?: string;
  /**
   * Ask YOUR server whether the link has been paid (it knows from the
   * payment_link.paid webhook or the server SDK). Polled every 3 s while the
   * modal is open. Without it the modal shows the link and waits for the payer.
   */
  checkPaid?:   () => Promise<boolean>;
  onSuccess?:   () => void;
  onError?:     (err: Error) => void;
  onCancel?:    () => void;
}

export class BanzamiCheckout {
  private readonly modal = new CheckoutModal();
  private readonly payUrl: string;

  constructor(config: BanzamiCheckoutConfig = {}) {
    assertNoCredential(config);
    this.payUrl = config.payUrl ?? DEFAULT_PAY_URL;
  }

  /**
   * Show a payment link your server created: its QR, "Abrir app Banzami", and
   * the hosted payment page. Throws (and calls onError) for a value that is not
   * a Banzami payment link.
   */
  open(opts: OpenOptions): void {
    let slug: string;
    try {
      slug = paymentLinkSlug(opts.link, this.payUrl);
    } catch (err) {
      const error = err instanceof Error ? err : new BanzamiCheckoutError(String(err));
      opts.onError?.(error);
      throw error;
    }
    this.modal.open(
      {
        slug,
        pageUrl:     payPageUrl(slug, this.payUrl),
        amountMinor: opts.amountMinor ?? null,
        currency:    opts.currency ?? 'AOA',
        description: opts.description ?? null,
      },
      {
        onSuccess: () => opts.onSuccess?.(),
        onCancel:  () => opts.onCancel?.(),
      },
      opts.checkPaid,
    );
  }

  /** Send the payer to the hosted payment page for a link your server created. */
  redirect(link: string): void {
    window.location.assign(payPageUrl(link, this.payUrl));
  }

  /** Programmatically close the checkout modal. */
  close(): void {
    this.modal.close();
  }
}

/** Script-tag convenience: `BanzamiCheckout.openCheckout({ link })`. */
export function openCheckout(opts: OpenOptions, config: BanzamiCheckoutConfig = {}): BanzamiCheckout {
  const checkout = new BanzamiCheckout(config);
  checkout.open(opts);
  return checkout;
}

/** Script-tag convenience: `BanzamiCheckout.redirectToPayment(link)`. */
export function redirectToPayment(link: string, config: BanzamiCheckoutConfig = {}): void {
  new BanzamiCheckout(config).redirect(link);
}
