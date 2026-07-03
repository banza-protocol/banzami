import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

// Integration test for the host-based Developer Console middleware. It exercises
// the real NextRequest/NextResponse runtime so it also proves the 308 status,
// query-string preservation, and the banzami.com pass-through.

const DEV = 'developers.banzami.com';

function run(urlStr: string, host: string) {
  const req = new NextRequest(new URL(urlStr), { headers: { host } });
  return middleware(req);
}

function locationOf(res: Response): URL {
  const loc = res.headers.get('location');
  if (!loc) throw new Error('no Location header (not a redirect)');
  return new URL(loc);
}

describe('Developer Console host middleware', () => {
  describe('every legacy /developers/* → 308 to its clean equivalent', () => {
    it.each([
      ['/developers', '/'],
      ['/developers/', '/'],
      ['/developers/dashboard', '/'],
      ['/developers/login', '/login'],
      ['/developers/verify', '/verify'],
      ['/developers/api-keys', '/api-keys'],
      ['/developers/settings', '/settings'],
      ['/developers/docs', '/docs'],
      ['/developers/webhooks', '/webhooks'],
      ['/developers/go-live', '/go-live'],
      ['/developers/logs', '/logs'],
      // generic deep path
      ['/developers/onboarding/project', '/onboarding/project'],
    ])('%s → %s (308)', (legacy, clean) => {
      const res = run(`https://${DEV}${legacy}`, DEV);
      expect(res.status).toBe(308);
      const loc = locationOf(res);
      expect(loc.host).toBe(DEV);
      expect(loc.pathname).toBe(clean);
    });
  });

  it('both legacy invite paths → /invites/accept with the token query preserved', () => {
    for (const legacy of ['/developers/accept-invite', '/developers/invites/accept']) {
      const res = run(`https://${DEV}${legacy}?token=abc123`, DEV);
      expect(res.status).toBe(308);
      const loc = locationOf(res);
      expect(loc.pathname).toBe('/invites/accept');
      expect(loc.searchParams.get('token')).toBe('abc123');
    }
  });

  it('preserves arbitrary non-sensitive query params on a generic redirect', () => {
    const res = run(`https://${DEV}/developers/logs?page=3&ref=nav`, DEV);
    expect(res.status).toBe(308);
    const loc = locationOf(res);
    expect(loc.pathname).toBe('/logs');
    expect(loc.searchParams.get('page')).toBe('3');
    expect(loc.searchParams.get('ref')).toBe('nav');
  });

  it('no legacy route can resolve to the old /developers/login', () => {
    for (const legacy of ['/developers/login', '/developers/dashboard', '/developers', '/developers/', '/developers/verify']) {
      const res = run(`https://${DEV}${legacy}`, DEV);
      const loc = locationOf(res);
      expect(loc.pathname).not.toContain('/developers');
    }
  });

  describe('clean host-root paths internally rewrite to the app/developers/* pages', () => {
    it.each([
      ['/', '/developers/dashboard'],
      ['/login', '/developers/login'],
      ['/api-keys', '/developers/api-keys'],
      ['/settings', '/developers/settings'],
      ['/invites/accept', '/developers/invites/accept'],
      // Docs: /docs is the CANONICAL clean URL — it must rewrite (200), never redirect.
      ['/docs', '/developers/docs'],
    ])('%s rewrites to %s (not a redirect)', (clean, internal) => {
      const res = run(`https://${DEV}${clean}`, DEV);
      expect(res.status).not.toBe(308);
      expect(res.headers.get('location')).toBeNull();
      const rewrite = res.headers.get('x-middleware-rewrite');
      expect(rewrite).toBeTruthy();
      expect(new URL(rewrite as string).pathname).toBe(internal);
    });
  });

  describe('banzami.com is completely unaffected by the developers-host middleware', () => {
    it.each(['/', '/login', '/produto', '/developers', '/developers/login', '/developers/api-keys'])(
      'banzami.com%s passes through (no redirect, no rewrite)',
      (path) => {
        const res = run(`https://banzami.com${path}`, 'banzami.com');
        expect(res.status).not.toBe(308);
        expect(res.headers.get('location')).toBeNull();
        expect(res.headers.get('x-middleware-rewrite')).toBeNull();
      },
    );
  });

  describe('documentation canonical/legacy routing (regression: no loop, no second canonical host)', () => {
    it('console host: /docs is canonical (rewrite to /developers/docs, NOT a redirect)', () => {
      const res = run(`https://${DEV}/docs`, DEV);
      expect(res.status).not.toBe(308);
      expect(res.headers.get('location')).toBeNull();
      expect(new URL(res.headers.get('x-middleware-rewrite') as string).pathname).toBe('/developers/docs');
    });

    it('console host: legacy /developers/docs → 308 → /docs (same host)', () => {
      const res = run(`https://${DEV}/developers/docs`, DEV);
      expect(res.status).toBe(308);
      const loc = locationOf(res);
      expect(loc.host).toBe(DEV);
      expect(loc.pathname).toBe('/docs');
    });

    it('no redirect loop: the /docs target of the legacy redirect does not itself redirect', () => {
      // /developers/docs → /docs (redirect) ; /docs → rewrite (terminal). One hop, no bounce.
      const legacy = run(`https://${DEV}/developers/docs`, DEV);
      expect(legacy.status).toBe(308);
      const canonical = run(`https://${DEV}${locationOf(legacy).pathname}`, DEV);
      expect(canonical.status).not.toBe(308);
      expect(canonical.headers.get('location')).toBeNull();
    });

    it.each([
      ['banzami.com', '/docs'],
      ['banzami.com', '/developers/docs'],
      ['www.banzami.com', '/docs'],
      ['www.banzami.com', '/developers/docs'],
    ])('marketing %s%s → 308 → canonical developers.banzami.com/docs', (host, path) => {
      const res = run(`https://${host}${path}`, host);
      expect(res.status).toBe(308);
      const loc = locationOf(res);
      expect(loc.host).toBe('developers.banzami.com');
      expect(loc.pathname).toBe('/docs');
    });

    it('marketing host does NOT render docs itself (never a second canonical docs host)', () => {
      for (const path of ['/docs', '/developers/docs']) {
        const res = run(`https://banzami.com${path}`, 'banzami.com');
        // it redirects away — no internal rewrite that would render the page here
        expect(res.headers.get('x-middleware-rewrite')).toBeNull();
        expect(res.status).toBe(308);
      }
    });

    it('marketing docs redirect leaves other /developers/* marketing pages untouched', () => {
      for (const path of ['/developers', '/developers/webhooks', '/produto']) {
        const res = run(`https://banzami.com${path}`, 'banzami.com');
        expect(res.status).not.toBe(308);
        expect(res.headers.get('location')).toBeNull();
        expect(res.headers.get('x-middleware-rewrite')).toBeNull();
      }
    });
  });

  it('never emits developer-api.banzami.com in a redirect or rewrite target', () => {
    const cases: [string, string][] = [
      [`https://${DEV}/developers/login`, DEV],
      [`https://${DEV}/login`, DEV],
      [`https://${DEV}/`, DEV],
    ];
    for (const [url, host] of cases) {
      const res = run(url, host);
      const target = res.headers.get('location') ?? res.headers.get('x-middleware-rewrite') ?? '';
      expect(target).not.toContain('developer-api.banzami.com');
    }
  });
});
