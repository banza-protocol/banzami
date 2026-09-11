// Operator session for the Banzami Admin portal.
//
// The session itself is NOT here, and no script in this app can read it. It is
// an HttpOnly, Secure, SameSite=Strict __Host- cookie that admin-api sets when
// both factors are proven, and the browser attaches it to every request to
// admin.banzami.com/api (A6-12). It used to be a 12-hour bearer token kept in
// localStorage, where any injected script could read it and replay it from
// anywhere.
//
// What IS kept here is the operator's profile (name, role) so the console can
// draw itself before /auth/me answers. It is a display hint, not a credential:
// every decision is re-made by admin-api from the cookie.

export interface AdminUser {
  id:        string;
  email:     string;
  full_name: string;
  role:      string;
}

export interface AdminSession {
  user: AdminUser;
}

const KEY = 'banzami_admin_profile';
// Where the pre-A6-12 console kept the bearer token. Removed on sight, so a
// browser that still holds one stops holding it on the first page load.
const LEGACY_KEY = 'banzami_admin_session';

/** Name of the readable cookie carrying the CSRF token (see admin-api auth.CSRFCookieName). */
export const CSRF_COOKIE = '__Host-bzadm_csrf';

export function getSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    localStorage.removeItem(LEGACY_KEY);
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<AdminSession>;
    return s && s.user ? { user: s.user } : null;
  } catch {
    return null;
  }
}

export function saveSession(s: AdminSession): void {
  // Only the profile is written — whatever else the caller passes.
  localStorage.setItem(KEY, JSON.stringify({ user: s.user }));
}

export function destroySession(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* storage unavailable — nothing to clear */ }
}

/**
 * The CSRF token admin-api issued with the session, read from its cookie. Sent
 * as X-CSRF-Token on every state-changing request; admin-api refuses one
 * without it. Empty when there is no session.
 */
export function readCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  for (const part of document.cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === CSRF_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return '';
}
