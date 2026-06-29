'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, X, CheckCheck } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type AdminNotification } from '@/lib/admin-api';
import { timeAgo } from '@/lib/format';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

const SEV: Record<string, string> = {
  info: 'bg-blue-50 text-blue-700',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  error: 'bg-red-50 text-red-700',
};
const SEV_DOT: Record<string, string> = {
  info: 'bg-blue-500', success: 'bg-green-500', warning: 'bg-amber-500', error: 'bg-[#B5101F]',
};

// The bell polls the summary for an unread count (cheap) and lazy-loads the full
// list when opened. It never refreshes manually — a 60s interval keeps it live.
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AdminNotification[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);

  const pollUnread = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    try {
      const s = await api.getNotificationSummary();
      setUnread(s.unread_notifications ?? 0);
    } catch { /* leave as-is */ }
  }, []);

  useEffect(() => {
    void pollUnread();
    const t = setInterval(() => void pollUnread(), 60_000);
    return () => clearInterval(t);
  }, [pollUnread]);

  const loadList = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setItems(null); setLoadErr(false);
    try {
      const r = await api.listNotifications({ limit: 20 });
      setItems(r.notifications ?? []);
    } catch {
      setLoadErr(true);
      setItems([]);
    }
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void loadList();
  }

  async function markRead(n: AdminNotification) {
    if (n.status === 'UNREAD') {
      const api = getApi();
      if (api) { try { await api.markNotificationRead(n.id); } catch { /* ignore */ } }
      setItems((cur) => cur?.map((x) => x.id === n.id ? { ...x, status: 'READ' } : x) ?? cur);
      setUnread((u) => Math.max(0, u - 1));
    }
  }

  async function dismiss(n: AdminNotification, e: React.MouseEvent) {
    e.stopPropagation();
    const api = getApi();
    if (api) { try { await api.dismissNotification(n.id); } catch { /* ignore */ } }
    setItems((cur) => cur?.filter((x) => x.id !== n.id) ?? cur);
    if (n.status === 'UNREAD') setUnread((u) => Math.max(0, u - 1));
  }

  async function markAllRead() {
    const api = getApi();
    const unreadItems = (items ?? []).filter((x) => x.status === 'UNREAD');
    setItems((cur) => cur?.map((x) => ({ ...x, status: 'READ' as const })) ?? cur);
    setUnread(0);
    if (api) await Promise.all(unreadItems.map((x) => api.markNotificationRead(x.id).catch(() => {})));
  }

  function openItem(n: AdminNotification) {
    void markRead(n);
    if (n.href) { setOpen(false); router.push(n.href); }
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        aria-label="Notificações"
        className="relative flex h-[38px] w-[38px] items-center justify-center rounded-[12px] transition-colors hover:bg-[#FFF1F0]"
      >
        <Bell size={20} strokeWidth={1.8} color={open ? '#B5101F' : '#5a4a4e'} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#B5101F] px-1 text-[10px] font-extrabold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[380px] max-w-[92vw] overflow-hidden rounded-[16px] border border-[#f1e3e3] bg-white shadow-[0_24px_60px_-24px_rgba(0,0,0,0.3)]">
            <div className="flex items-center justify-between border-b border-[#f6eded] px-4 py-3">
              <span className="text-[14px] font-black text-[#2a2024]">Notificações</span>
              {(items?.some((x) => x.status === 'UNREAD')) && (
                <button onClick={markAllRead} className="inline-flex items-center gap-1 text-[12px] font-bold text-[#B5101F] hover:underline">
                  <CheckCheck size={14} /> Marcar todas como lidas
                </button>
              )}
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {items === null ? (
                <div className="space-y-2 p-3">
                  {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-[#f7ecec]" />)}
                </div>
              ) : loadErr ? (
                <div className="px-4 py-10 text-center text-[13px] font-semibold text-[#B5101F]">Não foi possível carregar as notificações.</div>
              ) : items.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <div className="text-[14px] font-extrabold text-[#5a4a4e]">Tudo em dia</div>
                  <div className="mt-1 text-[12.5px] font-semibold text-[#9a8a8e]">Não há notificações novas.</div>
                </div>
              ) : (
                <ul className="divide-y divide-[#f6eded]">
                  {items.map((n) => (
                    <li key={n.id}>
                      <button
                        onClick={() => openItem(n)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#FFF7F6] ${n.status === 'UNREAD' ? 'bg-[#FFF7F6]/60' : ''}`}
                      >
                        <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${n.status === 'UNREAD' ? SEV_DOT[n.severity] ?? 'bg-gray-400' : 'bg-transparent'}`} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[13.5px] font-extrabold text-[#2a2024]">{n.title}</span>
                            <span className={`flex-none rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase ${SEV[n.severity] ?? 'bg-gray-100 text-gray-500'}`}>{n.severity}</span>
                          </span>
                          {n.message && <span className="mt-0.5 block truncate text-[12.5px] font-semibold text-[#7a6a6e]">{n.message}</span>}
                          <span className="mt-0.5 block text-[11px] font-semibold text-[#9a8a8e]">{timeAgo(n.created_at)}</span>
                        </span>
                        <span className="flex flex-none items-center gap-1">
                          {n.status === 'UNREAD' && (
                            <span onClick={(e) => { e.stopPropagation(); void markRead(n); }} title="Marcar como lida" className="rounded p-1 text-[#9a8a8e] hover:bg-[#f3e9e9] hover:text-[#2a2024]">
                              <Check size={14} />
                            </span>
                          )}
                          <span onClick={(e) => dismiss(n, e)} title="Dispensar" className="rounded p-1 text-[#9a8a8e] hover:bg-[#f3e9e9] hover:text-[#B5101F]">
                            <X size={14} />
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
