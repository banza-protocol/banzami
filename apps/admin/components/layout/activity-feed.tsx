'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { AdminApi, type AdminNotification } from '@/lib/admin-api';
import { Card, CardHeader, EmptyMsg, ErrorState } from '@/components/ui/table';
import { timeAgo } from '@/lib/format';

// Passive: the feed polls every 60s, which is not the operator being active.
function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi({ passive: true }) : null;
}

const SEV_DOT: Record<string, string> = {
  info: '#3b82f6', success: '#16a34a', warning: '#d97706', error: '#B5101F',
};

// Persistent operator activity feed for the dashboard, sourced from the
// Notification Center. Self-contained: polls every 60s, no manual refresh.
export function ActivityFeed() {
  const [items, setItems] = useState<AdminNotification[] | null>(null);
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    try {
      const r = await api.listNotifications({ limit: 12 });
      setItems(r.notifications ?? []);
      setErr(false);
    } catch {
      setErr(true);
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <Card className="mt-4">
      <CardHeader title="Atividade recente" />
      {err ? (
        <ErrorState message="Não foi possível carregar a atividade." />
      ) : items === null ? (
        <div className="px-[22px] py-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="adm-skel my-[10px] h-[34px] rounded-[8px]" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyMsg title="Sem atividade recente." hint="Novos documentos, candidaturas e decisões aparecem aqui." />
      ) : (
        <ul className="px-[22px] pb-2 pt-1">
          {items.map((n) => {
            const dot = SEV_DOT[n.severity] ?? '#9a8a8e';
            const row = (
              <div className="flex items-start gap-[13px] border-b border-[#f8f1f1] py-[13px]">
                <span className="mt-[6px] h-[9px] w-[9px] flex-none rounded-full" style={{ background: dot }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-extrabold leading-[1.4] text-[#3a2e32]">{n.title}</div>
                  {n.message && <div className="mt-0.5 truncate text-[12.5px] font-semibold text-[#7a6a6e]">{n.message}</div>}
                  <div className="mt-0.5 text-[11.5px] font-semibold text-[#b09498]">{timeAgo(n.created_at)}</div>
                </div>
                {n.href && <span className="flex-none text-[12.5px] font-extrabold text-[#B5101F]">Abrir →</span>}
              </div>
            );
            return (
              <li key={n.id}>
                {n.href ? <Link href={n.href} className="block transition-colors hover:bg-[#FFF7F6]">{row}</Link> : row}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
