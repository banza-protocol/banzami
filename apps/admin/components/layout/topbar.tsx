'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AlertCircle, ChevronDown, KeyRound, LogOut, ShieldOff } from 'lucide-react';
import { type AdminUser, destroySession, getSession } from '@/lib/session';
import { AdminApi, signOut } from '@/lib/admin-api';
import { initials } from '@/lib/format';
import { ChangePasswordModal } from '@/components/ui/change-password-modal';
import { NotificationBell } from '@/components/layout/notification-bell';
import { useDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { navItems } from '@/components/layout/nav-config';

// The page title is the label of the active nav item — one source (nav-config),
// so the sidebar label, the header title and the breadcrumb can never drift
// (BANZADMIN-IA-NAV-001 §22/§35). Subtitles are optional flavour keyed by route.
const SUBS: Record<string, string> = {
  '/': 'Resumo operacional da rede Banzami.',
  '/compliance/inbox': 'Casos de compliance por resolver.',
  '/merchants': 'Candidaturas Business: revisão, aprovação e associação.',
  '/businesses': 'Contas de comerciantes e acesso à App Banzami Business.',
  '/consumers': 'Carteiras e contas de consumidores.',
  '/merchant-kyb': 'Documentos KYB de negócios para revisão.',
  '/consumer-kyc': 'Documentos KYC de consumidores para revisão.',
  '/beta-testers': 'Inscrições para testar as apps móveis (App Banzami e App Banzami Business).',
  '/settlements': 'Ciclo de liquidação aos comerciantes.',
  '/payments': 'Levantamentos das carteiras dos comerciantes para o banco.',
  '/reconciliation': 'Conferência de movimentos e divergências.',
  '/disputes': 'Resolução de disputas de transações.',
  '/risk': 'Sinalizações de risco e registo de auditoria.',
  '/operators': 'Gestão de acesso ao BANZADMIN.',
  '/platform-mode': 'Modo da plataforma: SANDBOX ou LIVE.',
};

function headerFor(pathname: string): { title: string; sub: string } {
  let best: { href: string; label: string; exact?: boolean } | null = null;
  for (const it of navItems()) {
    const active = it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(it.href + '/');
    if (active && (!best || it.href.length > best.href.length)) best = it;
  }
  return best ? { title: best.label, sub: SUBS[best.href] ?? '' } : { title: 'Admin', sub: '' };
}

export function Topbar({ user }: { user: AdminUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const meta = headerFor(pathname);
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
      // Passive: polled every 60s; it must not keep an idle console signed in.
      setPlatformMode((await new AdminApi({ passive: true }).getPlatformMode()).mode);
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

  // Sign out on the server too (admin-api revokes the session), then leave.
  async function logout() {
    await signOut();
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
    if (!session) { void logout(); return; }
    try {
      await new AdminApi().terminateMySessions();
    } catch {
      // The current session is revoked server-side either way; fall through.
    }
    toast('success', 'Sessões terminadas.');
    // Already revoked on the server; only the local profile is left to clear.
    destroySession();
    router.replace('/login');
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
