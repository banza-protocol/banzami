'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutGrid, Building2, Users, Layers, CreditCard, ReceiptText, RefreshCw, Scale, Shield, UserCog, LogOut, FileCheck, ScanFace, Inbox, Tags, Coins, HandCoins, PieChart, SlidersHorizontal, ScrollText,
  type LucideIcon,
} from 'lucide-react';
import { destroySession, getSession } from '@/lib/session';
import { AdminApi, type NotificationSummary } from '@/lib/admin-api';
import { BanzamiLogo } from '@/components/ui/brand';

// Maps a nav href to the summary count that should badge it.
function badgeCount(href: string, s: NotificationSummary | null): number {
  if (!s) return 0;
  switch (href) {
    case '/merchant-kyb':            return s.pending_kyb_documents;
    case '/consumer-kyc':            return s.pending_kyc_documents;
    case '/merchants':               return s.pending_business_applications;
    case '/disputes':                return s.open_disputes;
    case '/reconciliation':          return s.pending_reconciliations;
    case '/application-settlements': return s.failed_app_settlements;
    default:                         return 0;
  }
}

function Badge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="ml-auto flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-[#B5101F] px-[6px] text-[11px] font-extrabold text-white max-[860px]:hidden">
      {n > 99 ? '99+' : n}
    </span>
  );
}

type NavItem = { href: string; label: string; Icon: LucideIcon; exact?: boolean };
type NavSection = { section: string; items: NavItem[] };
type NavEntry = NavItem | NavSection;

const NAV: NavEntry[] = [
  { href: '/', label: 'Visão geral', Icon: LayoutGrid, exact: true },
  {
    section: 'Compliance',
    items: [
      { href: '/compliance/inbox', label: 'Inbox', Icon: Inbox },
    ],
  },
  { href: '/merchants', label: 'Comerciantes', Icon: Building2 },
  { href: '/merchant-kyb', label: 'Documentos KYB', Icon: FileCheck },
  { href: '/consumer-kyc', label: 'Documentos KYC', Icon: ScanFace },
  { href: '/consumers', label: 'Consumidores', Icon: Users },
  { href: '/settlements', label: 'Liquidações', Icon: Layers },
  { href: '/payments', label: 'Pagamentos', Icon: CreditCard },
  { href: '/wallet-payments', label: 'Pagamentos recebidos', Icon: ReceiptText },
  { href: '/reconciliation', label: 'Reconciliação', Icon: RefreshCw },
  { href: '/disputes', label: 'Disputas', Icon: Scale },
  { href: '/risk', label: 'Risco & Audit', Icon: Shield },
  { href: '/operators', label: 'Operadores', Icon: UserCog },
  {
    section: 'Finanças',
    items: [
      { href: '/finance', label: 'Visão geral', Icon: PieChart },
      { href: '/pricing-rules', label: 'Regras de preço', Icon: Tags },
      { href: '/pricing-profiles', label: 'Perfis de preço', Icon: SlidersHorizontal },
      { href: '/fee-policies', label: 'Políticas de fee', Icon: ScrollText },
      { href: '/operator-fees', label: 'Taxas do operador', Icon: Coins },
      { href: '/application-settlements', label: 'Liquidações de apps', Icon: HandCoins },
    ],
  },
];

function isSection(e: NavEntry): e is NavSection {
  return (e as NavSection).section !== undefined;
}

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [summary, setSummary] = useState<NotificationSummary | null>(null);

  // Poll the operator review-queue summary (live) so the sidebar shows real
  // pending counts. Best-effort: failures leave the badges hidden.
  const refresh = useCallback(async () => {
    const s = getSession();
    if (!s) return;
    try {
      setSummary(await new AdminApi(s.token).getNotificationSummary());
    } catch { /* leave badges as-is */ }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  function logout() {
    destroySession();
    router.replace('/login');
  }

  return (
    <aside className="adm-side sticky top-0 flex h-screen w-[248px] flex-none flex-col border-r border-[#f1e3e3] bg-white max-[860px]:w-[74px]">
      <div className="flex items-center gap-[11px] border-b border-[#f6eded] px-5 pb-[18px] pt-[22px]">
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[11px] bg-[#B5101F] shadow-[0_6px_14px_-4px_rgba(181,16,31,0.5)]">
          <BanzamiLogo />
        </span>
        <span className="flex items-baseline gap-[7px] max-[860px]:hidden">
          <span className="text-[19px] font-black tracking-[-0.02em]">BANZADMIN</span>
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-[3px] overflow-y-auto p-3">
        {NAV.map((entry) => {
          if (isSection(entry)) {
            return (
              <div key={entry.section} className="mt-[14px] flex flex-col gap-[3px]">
                <span className="px-[13px] pb-[2px] text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#bba6aa] max-[860px]:hidden">
                  {entry.section}
                </span>
                {entry.items.map(({ href, label, Icon, exact }) => {
                  const active = isActive(pathname, href, exact);
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-3 rounded-[13px] px-[13px] py-[11px] text-[14.5px] font-extrabold transition-colors max-[860px]:justify-center ${
                        active ? 'bg-[#FFF1F0] text-[#B5101F]' : 'text-[#5a4a4e] hover:bg-[#FFF7F6]'
                      }`}
                    >
                      <Icon size={20} className="flex-none" color={active ? '#B5101F' : '#9a8a8e'} strokeWidth={1.8} />
                      <span className="max-[860px]:hidden">{label}</span>
                      <Badge n={badgeCount(href, summary)} />
                    </Link>
                  );
                })}
              </div>
            );
          }
          const { href, label, Icon, exact } = entry;
          const active = isActive(pathname, href, exact);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-[13px] px-[13px] py-[11px] text-[14.5px] font-extrabold transition-colors max-[860px]:justify-center ${
                active ? 'bg-[#FFF1F0] text-[#B5101F]' : 'text-[#5a4a4e] hover:bg-[#FFF7F6]'
              }`}
            >
              <Icon size={20} className="flex-none" color={active ? '#B5101F' : '#9a8a8e'} strokeWidth={1.8} />
              <span className="max-[860px]:hidden">{label}</span>
              <Badge n={badgeCount(href, summary)} />
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[#f6eded] p-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-[13px] px-[13px] py-[11px] text-[14.5px] font-bold text-[#9a8a8e] transition-colors hover:bg-[#FFF1F0] hover:text-[#B5101F] max-[860px]:justify-center"
        >
          <LogOut size={20} className="flex-none" strokeWidth={1.8} />
          <span className="max-[860px]:hidden">Sair</span>
        </button>
      </div>
    </aside>
  );
}
