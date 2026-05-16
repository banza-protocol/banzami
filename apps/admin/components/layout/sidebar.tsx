'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Building2, Users, Layers, Banknote, RefreshCw, LogOut } from 'lucide-react';
import { destroySession } from '@/lib/session';

const NAV = [
  { href: '/',               label: 'Visão geral',  icon: LayoutDashboard },
  { href: '/merchants',      label: 'Comerciantes', icon: Building2       },
  { href: '/consumers',      label: 'Consumidores', icon: Users           },
  { href: '/settlements',    label: 'Liquidações',  icon: Layers          },
  { href: '/payouts',        label: 'Pagamentos',   icon: Banknote        },
  { href: '/reconciliation', label: 'Reconciliação',icon: RefreshCw       },
];

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  return (
    <aside className="w-64 min-h-screen bg-gray-900 flex flex-col shrink-0">
      <div className="px-xl py-xl border-b border-white/10">
        <span className="text-white font-bold text-lg tracking-tight">Banzami</span>
        <span className="ml-sm text-xs text-white/40 font-medium uppercase tracking-widest">Admin</span>
      </div>

      <nav className="flex-1 px-sm py-lg flex flex-col gap-micro">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-md px-md py-sm rounded-md text-sm font-medium transition-colors ${
                active ? 'bg-white/15 text-white' : 'text-white/50 hover:bg-white/10 hover:text-white'
              }`}>
              <Icon size={18} strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-sm pb-xl">
        <button
          onClick={() => { destroySession(); router.replace('/login'); }}
          className="w-full flex items-center gap-md px-md py-sm rounded-md text-sm font-medium text-white/40 hover:bg-white/10 hover:text-white transition-colors">
          <LogOut size={18} strokeWidth={1.75} />
          Sair
        </button>
      </div>
    </aside>
  );
}
