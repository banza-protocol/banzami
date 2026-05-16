'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { destroySession, getSession, type Session } from '@/lib/session';
import { BanzamiApi } from '@/lib/api';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { Spinner } from '@/components/ui/spinner';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router                      = useRouter();
  const [session, setSession]       = useState<Session | null>(null);
  const [merchantName, setMerchantName] = useState<string>('');
  const [ready, setReady]           = useState(false);
  const idleTimer                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(() => {
    destroySession();
    router.replace('/login');
  }, [router]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(logout, IDLE_TIMEOUT_MS);
  }, [logout]);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    setSession(s);
    setReady(true);

    const api = new BanzamiApi(s.gatewayUrl, s.apiKey);
    api.getMerchant(s.merchantId)
      .then(m => setMerchantName(m.name))
      .catch(() => { /* fall back to empty — topbar shows ID */ });
  }, [router]);

  // Idle timeout — reset on any user interaction
  useEffect(() => {
    if (!ready) return;
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetIdleTimer, { passive: true }));
    resetIdleTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdleTimer));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [ready, resetIdleTimer]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-off-white">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const isSandbox = session?.environment === 'sandbox';

  return (
    <div className="flex min-h-screen flex-col">
      {isSandbox && (
        <div className="bg-amber-400 text-amber-900 text-xs font-bold text-center py-1.5 tracking-widest uppercase shrink-0 select-none">
          ⚠ MODO DE TESTES — SANDBOX — nenhum pagamento real é processado
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar merchantName={merchantName || session!.merchantId} />
          <main className="flex-1 overflow-auto p-xl">{children}</main>
        </div>
      </div>
    </div>
  );
}
