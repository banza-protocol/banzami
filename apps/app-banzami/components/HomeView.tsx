'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ActivityItem, Balance } from '@/lib/consumer-api';
import { apiGet } from '@/lib/client';
import { formatKz } from '@/lib/money';
import { ActivityRow } from '@/components/ActivityRow';

// The Home experience with live updates. It renders the server snapshot instantly,
// then keeps balance and activity current: it re-fetches when the tab becomes
// visible or regains focus, and polls on a light interval while visible. This is
// the functional realtime path AND the reconciliation fallback (§44/§45) — a
// reconnect never duplicates, because the canonical GET is the source of truth.
export function HomeView({
  handle, displayName, initialBalance, initialActivity,
}: {
  handle: string; displayName?: string; initialBalance: Balance | null; initialActivity: ActivityItem[];
}) {
  const [balance, setBalance] = useState(initialBalance);
  const [activity, setActivity] = useState(initialActivity);

  const refresh = useCallback(async () => {
    const [b, a] = await Promise.all([
      apiGet<Balance>('/api/balance'),
      apiGet<{ items: ActivityItem[] }>('/api/activity'),
    ]);
    if (b.ok) setBalance(b.data);
    if (a.ok && Array.isArray(a.data.items)) setActivity(a.data.items);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(refresh, 5000); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => { if (document.visibilityState === 'visible') { void refresh(); start(); } else stop(); };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', refresh);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', refresh); };
  }, [refresh]);

  const recent = activity.slice(0, 6);

  return (
    <div className="px-5 pb-6">
      {/* Balance card */}
      <div className="mt-2 rounded-3xl bg-gradient-to-br from-cherry via-cherry to-cherry-dark p-6 text-white shadow-[0_22px_50px_-24px_rgba(181,16,31,.65)]">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-white/80">Saldo disponível</span>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Sandbox</span>
        </div>
        <div className="mt-2 text-[38px] font-black leading-none tracking-[-0.02em]">
          {balance ? formatKz(balance.available_minor) : '—'}
        </div>
        <div className="mt-1 text-[12.5px] font-medium text-white/70">@{handle}{displayName ? ` · ${displayName}` : ''}</div>
      </div>

      {/* Primary actions */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link href="/enviar" className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 text-[15px] font-black text-cherry-dark shadow-[0_10px_28px_-18px_rgba(0,0,0,.4)] no-underline transition active:scale-[0.99]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 19V5M6 11l6-6 6 6" stroke="#9A1B22" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Enviar
        </Link>
        <Link href="/receber" className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 text-[15px] font-black text-cherry-dark shadow-[0_10px_28px_-18px_rgba(0,0,0,.4)] no-underline transition active:scale-[0.99]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M6 13l6 6 6-6" stroke="#9A1B22" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Receber
        </Link>
      </div>

      {/* Recent activity */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-[15px] font-black text-ink">Atividade recente</h2>
        <Link href="/historico" className="text-[13px] font-bold text-cherry no-underline">Ver tudo</Link>
      </div>
      <div className="mt-1 rounded-2xl bg-white px-3 shadow-[0_10px_30px_-24px_rgba(0,0,0,.4)]">
        {recent.length === 0 ? (
          <p className="px-2 py-8 text-center text-[13.5px] font-medium text-ink-muted">Ainda sem movimentos.</p>
        ) : (
          <div className="divide-y divide-[#f3ecec]">{recent.map((it) => <ActivityRow key={it.activity_id} item={it} />)}</div>
        )}
      </div>
    </div>
  );
}
