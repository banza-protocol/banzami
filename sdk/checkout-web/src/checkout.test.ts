import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BanzamiCheckoutError, assertNoCredential, formatAmount, paymentLinkSlug, payPageUrl } from './api';
import { BanzamiCheckout } from './checkout';

const SLUG = '3f9a1c2b7d4e';

// The browser holds no credential: the link is created on the merchant's
// server, and this package only shows it or sends the payer to pay.banzami.com.
describe('a browser checkout holds no credential', () => {
  it('refuses a key in its configuration before anything renders', () => {
    expect(() => new BanzamiCheckout({ apiKey: 'bz_live_sk_x' } as never)).toThrow(BanzamiCheckoutError);
    expect(() => assertNoCredential({ secretKey: 'x' })).toThrow(/does not belong in a browser/);
    expect(() => new BanzamiCheckout()).not.toThrow();
  });

  it('no source file calls the API or sends an Authorization header', () => {
    const dir = join(__dirname);
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/\bfetch\s*\(/);
      expect(src, f).not.toMatch(/['"]Authorization['"]\s*:/);
      expect(src, f).not.toMatch(/\b(merchant_id|wallet_id)\s*:/);
    }
  });

  it('the README never tells anyone to put a key in a page', () => {
    const readme = readFileSync(join(__dirname, '..', 'README.md'), 'utf8');
    expect(readme).not.toMatch(/bz_(live|test)_/);
    expect(readme).not.toMatch(/apiKey\s*:/);
  });
});

describe('payment links', () => {
  it('accepts the slug and its hosted URLs, exactly', () => {
    expect(paymentLinkSlug(SLUG)).toBe(SLUG);
    expect(paymentLinkSlug(`https://pay.banzami.com/pay/${SLUG}`)).toBe(SLUG);
    expect(paymentLinkSlug(`https://pay.banzami.com/${SLUG}`)).toBe(SLUG);
    expect(payPageUrl(SLUG)).toBe(`https://pay.banzami.com/pay/${SLUG}`);
  });

  it('refuses anything that is not one', () => {
    for (const bad of [
      SLUG.toUpperCase(), ` ${SLUG}`, `${SLUG}x`, 'not-a-link',
      `https://evil.example/pay/${SLUG}`, `https://pay.banzami.com/pay/${SLUG}?next=x`,
      `https://pay.banzami.com/r/${SLUG}`, `javascript:alert(1)`,
    ]) {
      expect(() => paymentLinkSlug(bad), bad).toThrow(BanzamiCheckoutError);
    }
  });

  it('formats money with the Money Engine', () => {
    expect(formatAmount(5_000_000, 'AOA')).toBe('50 000 Kz');
    expect(formatAmount(1050, 'AOA')).toBe('10,50 Kz');
  });
});
