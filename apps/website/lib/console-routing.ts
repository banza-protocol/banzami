// Developer Console URL mapping — pure, framework-free, fully unit-tested.
//
// The Developer Console is served on developers.banzami.com, where it lives at
// the site root (/login, /, /api-keys, /invites/accept, …). The pages are
// physically implemented once under app/developers/*. This module maps between
// the clean, host-root URLs the browser shows and those physical pages, so the
// Next middleware can stay a thin host-guarded wrapper (see middleware.ts).
//
// It touches only pathnames — never query strings, and never session, OTP,
// CSRF or API-key material. It is scoped by the middleware to the console host;
// on banzami.com (the marketing site) none of this runs.

export const CONSOLE_HOST = 'developers.banzami.com';

// Physical Next segment the console pages live under.
const INTERNAL_PREFIX = '/developers';

// What "/" renders on the console host (the authenticated dashboard).
const ROOT_INTERNAL = '/developers/dashboard';

/** True for the legacy prefixed console URLs that must permanently redirect. */
export function isLegacyConsolePath(pathname: string): boolean {
  return pathname === INTERNAL_PREFIX || pathname.startsWith(INTERNAL_PREFIX + '/');
}

/**
 * Legacy prefixed console path → canonical clean path (target of a 308).
 * - /developers and /developers/dashboard collapse to the console root "/".
 * - the invite page keeps its canonical /invites/accept shape.
 * - everything else simply drops the /developers prefix.
 */
export function legacyToClean(pathname: string): string {
  if (pathname === INTERNAL_PREFIX || pathname === '/developers/dashboard') return '/';
  if (pathname === '/developers/accept-invite') return '/invites/accept';
  if (pathname.startsWith(INTERNAL_PREFIX + '/')) return pathname.slice(INTERNAL_PREFIX.length);
  return pathname;
}

/**
 * Clean host-root path → internal Next page path (target of a rewrite).
 * "/" maps to the dashboard; every other clean path gains the /developers
 * prefix (e.g. /invites/accept → /developers/invites/accept, matching the
 * physical page location).
 */
export function cleanToInternal(pathname: string): string {
  if (pathname === '/') return ROOT_INTERNAL;
  return INTERNAL_PREFIX + pathname;
}
