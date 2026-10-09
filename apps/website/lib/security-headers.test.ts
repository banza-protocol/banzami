import { describe, it, expect } from 'vitest';
import nextConfig from '../next.config.mjs';

/**
 * banzami.com and developers.banzami.com are served by this app. The live site
 * was found sending no Strict-Transport-Security while pay, admin and app did.
 */
describe('website security headers', () => {
  it('every route carries HSTS and the baseline headers', async () => {
    const rules = await nextConfig.headers();
    const all = rules.find((r: { source: string }) => r.source === '/(.*)');
    expect(all).toBeDefined();
    const byKey: Record<string, string> = Object.fromEntries(
      all!.headers.map((h: { key: string; value: string }) => [h.key, h.value]),
    );

    const maxAge = Number(/^max-age=(\d+)/.exec(byKey['Strict-Transport-Security'] ?? '')?.[1] ?? 0);
    expect(maxAge).toBeGreaterThanOrEqual(31536000);

    expect(byKey['X-Frame-Options']).toBe('DENY');
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
    expect(byKey['Referrer-Policy']).toBeDefined();
  });

  it('does not advertise the framework', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
