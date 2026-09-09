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

export const CONSOLE_ORIGIN = `https://${CONSOLE_HOST}`;

// Marketing hosts (banzami.com + its www alias). The Console and the Developer
// Documentation are canonical on the console host only; on these hosts a console
// URL is redirected there so the marketing site never becomes a second canonical
// host for either.
export const MARKETING_HOSTS = ['banzami.com', 'www.banzami.com'];

// The single canonical documentation URL.
export const CANONICAL_DOCS_URL = `${CONSOLE_ORIGIN}/docs`;

// Physical Next segment the console pages live under.
const INTERNAL_PREFIX = '/developers';

// What "/" renders on the console host (the authenticated dashboard).
const ROOT_INTERNAL = '/developers/dashboard';

/**
 * True for any documentation URL — the clean canonical /docs and the legacy
 * prefixed /developers/docs (and deep paths under it). Used to consolidate docs
 * traffic on marketing hosts to the canonical console URL.
 */
export function isDocsPath(pathname: string): boolean {
  return (
    pathname === '/docs' ||
    pathname === INTERNAL_PREFIX + '/docs' ||
    pathname.startsWith(INTERNAL_PREFIX + '/docs/')
  );
}

/**
 * True for a CONSOLE page reached on a marketing host — any /developers/ SUB-path.
 *
 * Deliberately not /developers itself: that is the developer landing page, which
 * is marketing content and belongs on the marketing host. Everything beneath it
 * — login, verify, api-keys, webhooks, saldos — is the Console.
 *
 * Serving those on the marketing host does not merely duplicate them, it breaks
 * them. developer-api allows exactly one credentialed CORS origin (the console
 * host), so the OTP request from banzami.com/developers/login fails preflight and
 * the developer is told "Sem ligação ao serviço" with no way to learn that the
 * Console is on another host. The page it navigates to next, /verify, does not
 * exist on the marketing host at all.
 *
 * The docs rule below already consolidated one console surface for a weaker
 * reason — a duplicate canonical URL. This is the same rule applied to the
 * surface that actually fails.
 */
export function isConsoleSubPath(pathname: string): boolean {
  return pathname.startsWith(INTERNAL_PREFIX + '/');
}

/**
 * The canonical console URL for a console path seen on a marketing host.
 * Reuses legacyToClean, so /developers/login → /login and /developers/dashboard
 * → / exactly as they map on the console host itself.
 */
export function marketingToConsoleUrl(pathname: string): string {
  return CONSOLE_ORIGIN + legacyToClean(pathname);
}

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
