'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Banknote,
  Link2,
  Webhook,
  Settings,
  LogOut,
} from 'lucide-react';
import { destroySession } from '@/lib/session';

const NAV = [
  { href: '/',               label: 'Visão geral',    icon: LayoutDashboard },
  { href: '/transactions',   label: 'Transacções',    icon: ArrowLeftRight  },
  { href: '/wallets',        label: 'Carteiras',      icon: Wallet          },
  { href: '/payouts',        label: 'Pagamentos',     icon: Banknote        },
  { href: '/payment-links',  label: 'Cobranças',      icon: Link2           },
  { href: '/webhooks',       label: 'Webhooks',       icon: Webhook         },
  { href: '/settings',       label: 'Definições',     icon: Settings        },
];

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  function handleSignOut() {
    destroySession();
    router.replace('/login');
  }

  return (
    <aside className="w-64 min-h-screen bg-wine flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-xl py-xl border-b border-wine-medium">
        <span className="text-white font-bold text-lg tracking-tight">Banzami</span>
        <span className="ml-sm text-xs text-white/50 font-medium uppercase tracking-widest">Dashboard</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-sm py-lg flex flex-col gap-micro">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-md px-md py-sm rounded-md text-sm font-medium transition-colors ${
                active
                  ? 'bg-white/15 text-white'
                  : 'text-white/65 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon size={18} strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="px-sm pb-xl">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-md px-md py-sm rounded-md text-sm font-medium text-white/50 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut size={18} strokeWidth={1.75} />
          Sair
        </button>
      </div>
    </aside>
  );
}
