'use client';

import { Building2, Layers, Banknote, RefreshCw, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const MODULES = [
  {
    href:    '/merchants',
    icon:    Building2,
    label:   'Comerciantes',
    desc:    'Verificação KYC, aprovação, suspensão e sinalização AML.',
    color:   'bg-info-bg text-info',
  },
  {
    href:    '/settlements',
    icon:    Layers,
    label:   'Liquidações',
    desc:    'Gerir o ciclo de vida das liquidações — Pendente → Submetido → Liquidado.',
    color:   'bg-success-bg text-success',
  },
  {
    href:    '/payouts',
    icon:    Banknote,
    label:   'Pagamentos',
    desc:    'Processar, confirmar e marcar pagamentos enviados ou devolvidos.',
    color:   'bg-warning-bg text-warning',
  },
  {
    href:    '/reconciliation',
    icon:    RefreshCw,
    label:   'Reconciliação',
    desc:    'Executar reconciliação manual e verificar divergências.',
    color:   'bg-gray-100 text-gray-700',
  },
];

export default function OverviewPage() {
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-xl">
      <div className="bg-gray-900 rounded-xl p-xl text-white">
        <p className="text-xs font-medium text-white/50 uppercase tracking-widest mb-xs">Banzami Operations</p>
        <h2 className="text-xl font-bold">Painel Interno</h2>
        <p className="text-sm text-white/60 mt-sm">
          Acesso restrito a operadores autorizados. Todas as acções são auditadas.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-lg">
        {MODULES.map(({ href, icon: Icon, label, desc, color }) => (
          <Link key={href} href={href}
            className="group bg-white rounded-lg shadow-card p-xl flex flex-col gap-md hover:shadow-modal transition-shadow">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
              <Icon size={20} strokeWidth={1.75} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">{label}</p>
              <p className="text-xs text-gray-400 mt-xs">{desc}</p>
            </div>
            <div className="flex items-center gap-xs text-xs font-medium text-gray-400 group-hover:text-gray-900 transition-colors">
              Abrir <ArrowRight size={12} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
