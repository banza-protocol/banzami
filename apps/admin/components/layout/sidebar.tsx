'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutGrid, Building2, Users, Layers, CreditCard, RefreshCw, Scale, Shield, UserCog, LogOut,
} from 'lucide-react';
import { destroySession } from '@/lib/session';
import { BanzamiLogo } from '@/components/ui/brand';

const NAV = [
  { href: '/', label: 'Visão geral', Icon: LayoutGrid, exact: true },
  { href: '/merchants', label: 'Comerciantes', Icon: Building2 },
  { href: '/consumers', label: 'Consumidores', Icon: Users },
  { href: '/settlements', label: 'Liquidações', Icon: Layers },
  { href: '/payments', label: 'Pagamentos', Icon: CreditCard },
  { href: '/reconciliation', label: 'Reconciliação', Icon: RefreshCw },
  { href: '/disputes', label: 'Disputas', Icon: Scale },
  { href: '/risk', label: 'Risco & Audit', Icon: Shield },
  { href: '/operators', label: 'Operadores', Icon: UserCog },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

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
        {NAV.map(({ href, label, Icon, exact }) => {
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
