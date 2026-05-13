'use client';

import { usePathname } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';

const TITLES: Record<string, string> = {
  '/':               'Visão geral',
  '/merchants':      'Comerciantes',
  '/settlements':    'Liquidações',
  '/payouts':        'Pagamentos',
  '/reconciliation': 'Reconciliação',
};

export function Topbar() {
  const pathname = usePathname();
  const title    = TITLES[pathname] ?? 'Admin';

  return (
    <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-xl shrink-0">
      <h1 className="text-base font-semibold text-gray-900">{title}</h1>
      <span className="flex items-center gap-xs text-xs font-medium text-error bg-error-bg px-md py-xs rounded-full">
        <ShieldAlert size={12} />
        Uso interno
      </span>
    </header>
  );
}
