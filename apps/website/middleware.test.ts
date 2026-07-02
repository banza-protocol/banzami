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
