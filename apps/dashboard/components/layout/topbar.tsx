'use client';

import { usePathname } from 'next/navigation';

const TITLES: Record<string, string> = {
  '/':               'Visão geral',
  '/transactions':   'Transacções',
  '/wallets':        'Carteiras',
  '/payouts':        'Levantamentos',
  '/payment-links':  'Cobranças',
  '/webhooks':       'Webhooks',
  '/settings':       'Definições',
};

export function Topbar({ merchantName }: { merchantName: string }) {
  const pathname = usePathname();
  const title    = TITLES[pathname] ?? TITLES['/'];

  return (
    <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-xl shrink-0">
      <h1 className="text-base font-semibold text-gray-900">{title}</h1>
      <span className="text-sm font-medium text-gray-700">
        {merchantName}
      </span>
    </header>
  );
}
