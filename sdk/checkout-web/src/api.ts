/**
 * The browser side of a Banzami checkout holds NO credential.
 *
 * This file used to create payment links from the browser: it sent
 * `Authorization: Bearer <apiKey>` with a caller-supplied merchant_id and
 * wallet_id, and the README told integrators to pass `bz_live_...`. A secret key
 * in a web page is a secret key handed to every visitor (CLAUDE.md §6, §13) —
 * whoever opened devtools could create links, list payments and refund them.
 *
 * The model now is the one every hosted checkout uses:
 *
 *   1. YOUR SERVER creates the payment link with the server SDK
 *      (`@banzami/sdk`, secret key, server-side only).
 *   2. It hands the browser the link's slug — or its pay.banzami.com URL.
 *   3. This package shows that link (QR, "Abrir app Banzami", the hosted page)
 *      or sends the payer to pay.banzami.com. It never calls the API.
 *
 * Whether the link was paid is your server's to say (the `payment_link.paid`
 * webhook, or the server SDK's status call); `checkPaid` lets the modal ask it.
 */

/** A payment link slug is 12 lower-case hex characters — nothing else is one. */
const SLUG = /^[0-9a-f]{12}$/;

/** The hosted payer surface. */
export const DEFAULT_PAY_URL = 'https://pay.banzami.com';

export class BanzamiCheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BanzamiCheckoutError';
  }
}

/**
 * The slug of a payment link your server created, from the slug itself or from
 * its hosted URL (https://pay.banzami.com/pay/<slug>, or the older bare
 * https://pay.banzami.com/<slug>). Exact: nothing is trimmed or re-cased into a
 * slug — a value that is not one is refused.
 */
export function paymentLinkSlug(link: string, payUrl: string = DEFAULT_PAY_URL): string {
  if (SLUG.test(link)) return link;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new BanzamiCheckoutError('Not a Banzami payment link: pass the slug or the pay.banzami.com URL your server received.');
  }
  const origin = new URL(payUrl).origin;
  const parts = url.pathname.split('/').filter(Boolean);
  const slug = parts.length === 2 && parts[0] === 'pay' ? parts[1] : parts.length === 1 ? parts[0] : '';
  if (url.origin !== origin || url.search || url.hash || !SLUG.test(slug)) {
    throw new BanzamiCheckoutError(`Not a Banzami payment link: expected ${origin}/pay/<slug>.`);
  }
  return slug;
}

/** The hosted page a payer opens for a link: https://pay.banzami.com/pay/<slug>. */
export function payPageUrl(link: string, payUrl: string = DEFAULT_PAY_URL): string {
  return `${new URL(payUrl).origin}/pay/${paymentLinkSlug(link, payUrl)}`;
}

/**
 * Money Engine display: integer minor units → "50 000 Kz", "10,50 Kz". This
 * printed the MINOR amount as kwanzas (5 000 000 minor → "5.000.000 Kz").
 */
export function formatAmount(amountMinor: number, currency: string = 'AOA'): string {
  const abs = Math.abs(Math.trunc(amountMinor));
  const major = Math.trunc(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const frac = abs % 100;
  const sign = amountMinor < 0 ? '-' : '';
  const unit = currency.toUpperCase() === 'AOA' ? 'Kz' : currency.toUpperCase();
  return `${sign}${major}${frac ? ',' + String(frac).padStart(2, '0') : ''} ${unit}`;
}

/**
 * A credential in a browser configuration is refused before anything renders.
 * Plain-JS callers do not get the type checker's protection, so this is checked
 * at runtime too.
 */
export function assertNoCredential(config: object | undefined): void {
  if (!config) return;
  for (const key of ['apiKey', 'secretKey', 'api_key', 'token']) {
    if (key in config) {
      throw new BanzamiCheckoutError(
        `"${key}" does not belong in a browser. Create the payment link on your server with a secret key ` +
          'and pass only its slug or pay.banzami.com URL here.',
      );
    }
  }
}
