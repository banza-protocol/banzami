import { describe, it, expect } from 'vitest';
import {
  CONSOLE_HOST,
  isLegacyConsolePath,
  legacyToClean,
  cleanToInternal,
} from './console-routing';

describe('Developer Console routing map', () => {
  it('pins the console host', () => {
    expect(CONSOLE_HOST).toBe('developers.banzami.com');
  });

  describe('legacy prefixed paths are detected', () => {
    it.each([
      ['/developers', true],
      ['/developers/login', true],
      ['/developers/api-keys', true],
      ['/developers/invites/accept', true],
      // clean host-root paths are NOT legacy
      ['/', false],
      ['/login', false],
      ['/api-keys', false],
      ['/invites/accept', false],
      // unrelated marketing-ish path is not legacy
      ['/developersomething', false],
    ])('%s → %s', (path, expected) => {
      expect(isLegacyConsolePath(path)).toBe(expected);
    });
  });

  describe('legacy → clean (308 redirect target)', () => {
    it.each([
      ['/developers/login', '/login'],
      ['/developers/verify', '/verify'],
      ['/developers/api-keys', '/api-keys'],
      ['/developers/settings', '/settings'],
      ['/developers/docs', '/docs'],
      ['/developers/webhooks', '/webhooks'],
      ['/developers/logs', '/logs'],
      ['/developers/go-live', '/go-live'],
      ['/developers/onboarding/project', '/onboarding/project'],
      // a deep/unknown path still simply drops the prefix (generic rule)
      ['/developers/some/deep/future/path', '/some/deep/future/path'],
      // dashboard + bare prefix (with and without trailing slash) → console root
      ['/developers/dashboard', '/'],
      ['/developers', '/'],
      ['/developers/', '/'],
      // BOTH invite shapes collapse to the canonical /invites/accept
      ['/developers/accept-invite', '/invites/accept'],
      ['/developers/invites/accept', '/invites/accept'],
    ])('%s → %s', (legacy, clean) => {
      expect(legacyToClean(legacy)).toBe(clean);
    });

    it('never routes to the old /developers/login (no clean target keeps the prefix)', () => {
      for (const legacy of [
        '/developers/login',
        '/developers/dashboard',
        '/developers',
        '/developers/',
        '/developers/verify',
        '/developers/accept-invite',
        '/developers/invites/accept',
      ]) {
        expect(legacyToClean(legacy)).not.toContain('/developers');
      }
    });
  });

  it('no mapping output ever references the backend developer-api host', () => {
    const paths = ['/', '/login', '/api-keys', '/invites/accept', '/developers/login', '/developers/accept-invite'];
    for (const p of paths) {
      expect(legacyToClean(p)).not.toContain('developer-api');
      expect(cleanToInternal(p)).not.toContain('developer-api');
    }
  });

  describe('clean → internal (rewrite target)', () => {
    it.each([
      ['/', '/developers/dashboard'],
      ['/login', '/developers/login'],
      ['/api-keys', '/developers/api-keys'],
      ['/settings', '/developers/settings'],
      ['/invites/accept', '/developers/invites/accept'],
      ['/onboarding/project', '/developers/onboarding/project'],
    ])('%s → %s', (clean, internal) => {
      expect(cleanToInternal(clean)).toBe(internal);
    });
  });

  it('round-trips: internal page of a clean path redirects back to that clean path', () => {
    for (const clean of ['/login', '/api-keys', '/settings', '/invites/accept', '/onboarding/project']) {
      const internal = cleanToInternal(clean);
      expect(legacyToClean(internal)).toBe(clean);
    }
  });
});
