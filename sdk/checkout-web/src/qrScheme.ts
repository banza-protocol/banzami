/**
 * Single source of truth for Banzami QR / deep-link URI schemes on the web side.
 * Mirrors the Flutter BanzamiQrScheme so the link emitted by Checkout is exactly
 * what the app's parser accepts (the `banzami://pay/link/{slug}` contract). Emit
 * only through these helpers — never hand-write the scheme.
 */
export const BanzamiQrScheme = {
  live: 'banzami',
  sandbox: 'banzami-sandbox',

  /** `banzami://pay/link/{slug}` — merchant payment link (environment-implicit). */
  payLink(slug: string): string {
    return `${this.live}://pay/link/${slug}`;
  },
} as const;
