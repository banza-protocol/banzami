export interface AdminSession {
  adminKey: string;
  apiUrl:   string;
}

const KEY = 'banzami_admin_session';

export function getSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AdminSession) : null;
  } catch { return null; }
}

export function saveSession(s: AdminSession): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function destroySession(): void {
  localStorage.removeItem(KEY);
}
