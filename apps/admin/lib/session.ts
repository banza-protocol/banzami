// Operator session for the Banzami Admin portal. Stores the admin JWT + the
// operator profile. The Admin API URL is a fixed env value (never user input),
// and the legacy Admin Key is gone.

export interface AdminUser {
  id:        string;
  email:     string;
  full_name: string;
  role:      string;
}

export interface AdminSession {
  token: string;
  user:  AdminUser;
}

const KEY = 'banzami_admin_session';

export function getSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AdminSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: AdminSession): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function destroySession(): void {
  localStorage.removeItem(KEY);
}
