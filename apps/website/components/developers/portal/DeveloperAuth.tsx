'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { developerApi, type User } from '@/lib/developer-api';

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

  const logout = useCallback(async () => {
    try {
      await developerApi.logout(csrf);
    } catch {
      /* revoke best-effort; local state is cleared regardless */
    }
    clear();
  }, [csrf, clear]);

  return (
    <Ctx.Provider value={{ status, user, csrf, refresh, setSession, logout, clear }}>{children}</Ctx.Provider>
  );
}
