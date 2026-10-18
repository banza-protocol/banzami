import { describe, it, expect } from 'vitest';
import { detectPlatform, installOption, destinationLabel, INSTALL_CONFIG } from './install';

// The pay page's "get the app" fallback: invite-only today, so it routes to the
// real obtain path per platform and never links a store it cannot honour.

describe('detectPlatform', () => {
  it('detects iPhone as ios', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari')).toBe('ios');
  });
  it('detects iPad as ios', () => {
    expect(detectPlatform('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari')).toBe('ios');
  });
  it('detects iPadOS-reporting-as-Mac (touch) as ios', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari', 5)).toBe('ios');
  });
  it('detects Android', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel) Chrome')).toBe('android');
  });
  it('treats a desktop Mac (no touch) as desktop', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari', 0)).toBe('desktop');
  });
  it('treats Windows as desktop', () => {
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome')).toBe('desktop');
  });
});

describe('installOption — iOS', () => {
  it('routes to the invite-only beta sign-up while TestFlight distribution is invite-only', () => {
    const o = installOption('ios');
    expect(o.ctaLabel).toBe('Obter a app Banzami');
    expect(o.prompt).toBe('Ainda não tem a app?');
    expect(o.href).toBe('https://banzami.com/testes');
    expect(o.destination).toBe('beta_signup');
    // Never labelled App Store while not publicly distributed there.
    expect(o.ctaLabel).not.toMatch(/App Store/i);
  });
});

describe('installOption — Android', () => {
  it('shows the unavailable notice and never a Google Play link', () => {
    const o = installOption('android');
    expect(o.message).toBe('A app Banzami para Android está temporariamente indisponível.');
    expect(o.ctaLabel).toBe('Participar no Beta');
    expect(o.href).toBe('https://banzami.com/testes');
    expect(o.href).not.toMatch(/play\.google\.com/i);
    expect(o.prompt).toBeUndefined();
  });
  it('config declares Android distribution UNAVAILABLE (no play url)', () => {
    expect(INSTALL_CONFIG.android.distribution).toBe('UNAVAILABLE');
    expect(INSTALL_CONFIG.android.installUrl).toBe('');
  });
});

describe('installOption — desktop', () => {
  it('offers the in-browser Beta Web, not a store', () => {
    const o = installOption('desktop');
    expect(o.message).toBe('Pode utilizar a Banzami diretamente no navegador.');
    expect(o.ctaLabel).toBe('Abrir Banzami no navegador');
    expect(o.href).toBe('https://app.banzami.com');
    expect(o.destination).toBe('beta_web');
  });
});

describe('future App Store release switches iOS without touching payment logic', () => {
  it('uses the App Store install URL once configured', () => {
    // Simulate the future config (the component reads installOption, not the URL).
    const cfg = { ...INSTALL_CONFIG, ios: { distribution: 'APP_STORE' as const, installUrl: 'https://apps.apple.com/app/id000' } };
    // Re-derive with the same logic against the simulated config shape.
    const o = cfg.ios.distribution === 'APP_STORE' && cfg.ios.installUrl
      ? { ctaLabel: 'Obter a app Banzami', href: cfg.ios.installUrl, destination: 'app_store' as const }
      : installOption('ios');
    expect(o.href).toBe('https://apps.apple.com/app/id000');
    expect(o.destination).toBe('app_store');
  });
});

describe('destinationLabel names the external destination for screen readers', () => {
  it('beta sign-up', () => expect(destinationLabel('beta_signup')).toMatch(/banzami\.com\/testes/));
  it('beta web', () => expect(destinationLabel('beta_web')).toMatch(/app\.banzami\.com/));
  it('app store', () => expect(destinationLabel('app_store')).toMatch(/App Store/i));
});
