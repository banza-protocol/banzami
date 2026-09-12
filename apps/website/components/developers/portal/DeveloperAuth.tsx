'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { developerApi, ApiError, type User } from '@/lib/developer-api';

// Account Identity auth state for the Developer Console. The session lives in a
// host-only HttpOnly cookie (never JS-readable); this provider keeps only the
// current user and CSRF token in memory (never localStorage/sessionStorage) and
// restores them on load via GET /auth/me.

type Status = 'loading' | 'authed' | 'anon';

type AuthValue = {
  status: Status;
  user: User | null;
  csrf: string;
  refresh: () => Promise<void>;
  setSession: (user: User, csrf: string) => void;
  logout: () => Promise<void>;
  clear: () => void; // called on a 401 to drop local state
};

const Ctx = createContext<AuthValue | null>(null);

export function useDeveloperAuth(): AuthValue {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDeveloperAuth must be used within DeveloperAuthProvider');
  return c;
}

export function DeveloperAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [csrf, setCsrf] = useState('');

  const clear = useCallback(() => {
    setUser(null);
    setCsrf('');
    setStatus('anon');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await developerApi.me();
      setUser(r.user);
      setCsrf(r.csrf_token);
      setStatus('authed');
    } catch {
      clear();
    }
  }, [clear]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setSession = useCallback((u: User, token: string) => {
    setUser(u);
    setCsrf(token);
    setStatus('authed');
  }, []);

  /**
   * Signs out only when the server says the session is gone.
   *
   * This used to swallow the failure and clear local state anyway. POST
   * /auth/logout answers 503 precisely when revocation failed, and the handler
   * deliberately KEEPS the session cookie for that case — accountidentity
   * handlers.go: "The session is still live server-side. The cookie is kept, so
   * the person can sign out again; clearing it would leave a working token
   * behind a Console that says 'signed out'". Clearing here reproduced that
   * exact lie one layer up: a live session, a live cookie, and a Console
   * showing the sign-in page.
   *
   * So the rejection travels to the caller, which keeps the person signed in
   * and shows the reason. The one failure that is not a failure is 401 — that
   * session is already invalid, and there is nothing left to revoke.
   */
  const logout = useCallback(async () => {
    try {
      await developerApi.logout(csrf);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') {
        clear();
        return;
      }
      throw e;
    }
    clear();
  }, [csrf, clear]);

  return (
    <Ctx.Provider value={{ status, user, csrf, refresh, setSession, logout, clear }}>{children}</Ctx.Provider>
  );
}
