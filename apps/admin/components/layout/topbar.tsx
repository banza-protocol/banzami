'use client';

import { usePathname } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import type { AdminUser } from '@/lib/session';
import { initials } from '@/lib/format';

// Title + subtitle per route (README §Header).
const META: { match: (p: string) => boolean; title: string; sub: string }[] = [
  { match: (p) => p === '/', title: 'Visão geral', sub: 'Resumo operacional da rede Banzami.' },
  { match: (p) => p.startsWith('/merchants'), title: 'Comerciantes', sub: 'Candidaturas Business, KYC e gestão de contas.' },
  { match: (p) => p.startsWith('/consumers'), title: 'Consumidores', sub: 'Carteiras e contas de consumidores.' },
  { match: (p) => p.startsWith('/settlements'), title: 'Liquidações', sub: 'Ciclo de liquidação aos comerciantes.' },
  { match: (p) => p.startsWith('/payments'), title: 'Pagamentos', sub: 'Pagamentos e payouts pendentes.' },
  { match: (p) => p.startsWith('/reconciliation'), title: 'Reconciliação', sub: 'Conferência de movimentos e divergências.' },
  { match: (p) => p.startsWith('/disputes'), title: 'Disputas', sub: 'Resolução de disputas de transações.' },
  { match: (p) => p.startsWith('/risk'), title: 'Risco & Audit', sub: 'Sinalizações de risco e registo de auditoria.' },
];

export function Topbar({ user }: { user: AdminUser }) {
  const pathname = usePathname();
  const meta = META.find((m) => m.match(pathname)) ?? { title: 'Admin', sub: '' };

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[#f1e3e3] bg-[rgba(255,247,246,0.85)] px-8 py-[18px] backdrop-blur-[12px] backdrop-saturate-150">
      <div>
        <h1 className="m-0 text-[23px] font-black tracking-[-0.02em]">{meta.title}</h1>
        <p className="m-0 mt-[3px] text-[13.5px] font-semibold text-[#9a8a8e]">{meta.sub}</p>
      </div>
      <div className="flex items-center gap-[14px]">
        <span className="inline-flex items-center gap-[7px] rounded-[30px] border border-[#f6d3d1] bg-[#FFF1F0] px-[14px] py-2 text-[12.5px] font-extrabold text-[#B5101F]">
          <AlertCircle size={14} strokeWidth={1.8} />
          Uso interno
        </span>
        <span className="flex items-center gap-[9px]">
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#1a1416] text-[13px] font-extrabold text-white">
            {initials(user.full_name)}
          </span>
          <span className="leading-[1.2] max-[860px]:hidden">
            <span className="block text-[13.5px] font-extrabold text-[#2a2024]">{user.full_name}</span>
            <span className="block text-[11.5px] font-semibold text-[#9a8a8e]">{user.role}</span>
          </span>
        </span>
      </div>
    </header>
  );
}
