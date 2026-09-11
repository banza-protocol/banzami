'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AlertCircle, ChevronDown, KeyRound, LogOut, ShieldOff } from 'lucide-react';
import { type AdminUser, destroySession, getSession } from '@/lib/session';
import { AdminApi } from '@/lib/admin-api';
import { initials } from '@/lib/format';
import { ChangePasswordModal } from '@/components/ui/change-password-modal';
import { NotificationBell } from '@/components/layout/notification-bell';
import { useDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

// Title + subtitle per route (README §Header).
const META: { match: (p: string) => boolean; title: string; sub: string }[] = [
  { match: (p) => p === '/', title: 'Visão geral', sub: 'Resumo operacional da rede Banzami.' },
  { match: (p) => p.startsWith('/merchants'), title: 'Comerciantes', sub: 'Candidaturas Business, KYC e gestão de contas.' },
  { match: (p) => p.startsWith('/consumers'), title: 'Consumidores', sub: 'Carteiras e contas de consumidores.' },
  { match: (p) => p.startsWith('/settlements'), title: 'Liquidações', sub: 'Ciclo de liquidação aos comerciantes.' },
  { match: (p) => p.startsWith('/payments'), title: 'Levantamentos', sub: 'Levantamentos das carteiras dos negócios para o banco.' },
  { match: (p) => p.startsWith('/reconciliation'), title: 'Reconciliação', sub: 'Conferência de movimentos e divergências.' },
  { match: (p) => p.startsWith('/disputes'), title: 'Disputas', sub: 'Resolução de disputas de transações.' },
  { match: (p) => p.startsWith('/risk'), title: 'Risco & Audit', sub: 'Sinalizações de risco e registo de auditoria.' },
  { match: (p) => p.startsWith('/operators'), title: 'Operadores', sub: 'Gestão de acesso ao BANZADMIN.' },
];

export function Topbar({ user }: { user: AdminUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const meta = META.find((m) => m.match(pathname)) ?? { title: 'Admin', sub: '' };
  const dialog = useDialog();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [platformMode, setPlatformMode] = useState<'SANDBOX' | 'LIVE' | null>(null);

  // Global platform-mode badge: avoids operating as if in production when the
  // whole platform is in SANDBOX. Polled so a SUPER_ADMIN change reflects quickly.
  const refreshMode = useCallback(async () => {
    const s = getSession();
    if (!s) return;
    try {
      setPlatformMode((await new AdminApi(s.token).getPlatformMode()).mode);
    } catch {
      // Fail-safe to SANDBOX when the mode is still unknown (matches website/pay):
      // never operate as if in production just because the read failed. A previously
      // known mode is kept rather than downgraded on a transient error.
      setPlatformMode((prev) => prev ?? 'SANDBOX');
    }
  }, []);
  useEffect(() => {
    void refreshMode();
    const t = setInterval(() => void refreshMode(), 60_000);
    return () => clearInterval(t);
  }, [refreshMode]);

  function logout() {
    destroySession();
    router.replace('/login');
  }

  async function terminateMySessions() {
    setMenuOpen(false);
    const okGo = await dialog.confirm({
      title: 'Terminar as minhas sessões',
      message: 'Terminar todas as sessões ativas em todos os dispositivos? Vais ter de iniciar sessão de novo aqui também. A ação fica registada no log de auditoria.',
      confirmLabel: 'Terminar sessões',
      danger: true,
    });
    if (!okGo) return;
    const session = getSession();
    if (!session) { logout(); return; }
    try {
      await new AdminApi(session.token).terminateMySessions();
    } catch {
      // The current token is revoked server-side either way; fall through to logout.
    }
    toast('success', 'Sessões terminadas.');
    logout();
  }

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[#f1e3e3] bg-[rgba(255,247,246,0.85)] px-8 py-[18px] backdrop-blur-[12px] backdrop-saturate-150 max-[680px]:flex-wrap max-[680px]:gap-y-3 max-[680px]:px-4">
      <div className="min-w-0">
        <h1 className="m-0 text-[23px] font-black tracking-[-0.02em]">{meta.title}</h1>
        <p className="m-0 mt-[3px] text-[13.5px] font-semibold text-[#9a8a8e]">{meta.sub}</p>
      </div>
      {/* On a phone the cluster wraps under the title instead of widening the page. */}
      <div className="flex items-center gap-[14px] max-[680px]:ml-auto max-[680px]:gap-2">
        {platformMode === 'SANDBOX' && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[12px] font-extrabold text-amber-900">
            🟡 SANDBOX
          </span>
        )}
        <span className="inline-flex items-center gap-[7px] rounded-[30px] border border-[#f6d3d1] bg-[#FFF1F0] px-[14px] py-2 text-[12.5px] font-extrabold text-[#B5101F] max-[680px]:hidden">
          <AlertCircle size={14} strokeWidth={1.8} />
          Uso interno
        </span>

        <NotificationBell />

        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-[9px] rounded-[12px] px-1.5 py-1 transition-colors hover:bg-[#FFF1F0]"
          >
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#1a1416] text-[13px] font-extrabold text-white">
              {initials(user.full_name)}
            </span>
            <span className="leading-[1.2] max-[860px]:hidden">
              <span className="block text-left text-[13.5px] font-extrabold text-[#2a2024]">{user.full_name}</span>
              <span className="block text-left text-[11.5px] font-semibold text-[#9a8a8e]">{user.role}</span>
            </span>
            <ChevronDown size={16} strokeWidth={2} color="#9a8a8e" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[230px] overflow-hidden rounded-[14px] border border-[#f1e3e3] bg-white shadow-[0_20px_50px_-20px_rgba(0,0,0,0.25)]">
                <div className="border-b border-[#f6eded] px-4 py-3">
                  <div className="text-[13px] font-extrabold text-[#2a2024]">{user.full_name}</div>
                  <div className="truncate text-[12px] font-semibold text-[#9a8a8e]">{user.email}</div>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); setPwOpen(true); }}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[14px] font-bold text-[#5a4a4e] transition-colors hover:bg-[#FFF7F6]"
                >
                  <KeyRound size={17} strokeWidth={1.8} color="#9a8a8e" />
                  Alterar palavra-passe
                </button>
                <button
                  onClick={terminateMySessions}
                  className="flex w-full items-center gap-2.5 border-t border-[#f6eded] px-4 py-3 text-left text-[14px] font-bold text-[#5a4a4e] transition-colors hover:bg-[#FFF7F6]"
                >
                  <ShieldOff size={17} strokeWidth={1.8} color="#9a8a8e" />
                  Terminar as minhas sessões
                </button>
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-2.5 border-t border-[#f6eded] px-4 py-3 text-left text-[14px] font-bold text-[#5a4a4e] transition-colors hover:bg-[#FFF1F0] hover:text-[#B5101F]"
                >
                  <LogOut size={17} strokeWidth={1.8} />
                  Sair
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </header>
  );
}
