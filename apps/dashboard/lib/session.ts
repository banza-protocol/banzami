export interface Session {
  apiKey:      string;
  merchantId:  string;
  walletId?:   string;
  gatewayUrl:  string;
  /** 'live' for production keys (bz_live_…); 'sandbox' for test keys (bz_test_…). */
  environment: 'live' | 'sandbox';
}

const KEY = 'banzami_session';

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function destroySession(): void {
  localStorage.removeItem(KEY);
}
