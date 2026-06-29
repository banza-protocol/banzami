'use client';

import { useCallback, useEffect, useState } from 'react';
import { Coins, CalendarDays, HandCoins, Clock, AlertTriangle } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type FinanceDashboard, type FinanceDashboardFilters, type FeeBucket } from '@/lib/admin-api';
import { Card, CardHeader, ErrorState, EmptyMsg } from '@/components/ui/table';
import { formatKz } from '@/lib/format';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

const selClass = 'rounded-[11px] border border-[#f1e3e3] bg-white px-[12px] py-[8px] text-[13px] font-semibold text-[#3a2e32] outline-none focus:border-[#B5101F]';
const CURRENCIES = ['AOA', 'USD', 'EUR'];

/** "1.000,00 AOA · 50,00 USD" from a list of per-currency buckets. */
function moneyByCurrency(buckets: FeeBucket[]): string {
  if (buckets.length === 0) return '—';
  return buckets.map((b) => `${formatKz(b.total_minor)} ${b.key ?? ''}`.trim()).join(' · ');
}
function sumCount(buckets: FeeBucket[]): number {
  return buckets.reduce((a, b) => a + b.count, 0);
}

export default function FinanceDashboardPage() {
  const [data, setData] = useState<FinanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<FinanceDashboardFilters>({ environment: 'LIVE' });

  const load = useCallback(async (f: FinanceDashboardFilters) => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    setError('');
    try {
      setData(await api.getFinanceDashboard(f));
    } catch {
      setError('Não foi possível carregar o painel financeiro.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(filters); }, [load, filters]);

  function set<K extends keyof FinanceDashboardFilters>(k: K, v: string) {
    setFilters({ ...filters, [k]: v || undefined });
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="rounded-[18px] bg-[#1a1416] px-[26px] py-[22px] text-white">
        <h1 className="text-[23px] font-black tracking-[-0.02em]">Finanças · Visão geral</h1>
        <p className="mt-1 max-w-[760px] text-[13.5px] text-white/70">
          Agregações apenas de leitura sobre taxas do operador e liquidações de aplicações.
          A receita do operador é a soma das taxas aplicadas. Sem dados inventados.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select className={selClass} value={filters.environment ?? ''} onChange={(e) => set('environment', e.target.value)}>
          <option value="">Todos os ambientes</option>
          <option value="LIVE">LIVE</option>
          <option value="SANDBOX">SANDBOX</option>
        </select>
        <select className={selClass} value={filters.currency ?? ''} onChange={(e) => set('currency', e.target.value)}>
          <option value="">Todas as moedas</option>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className={selClass} type="date" value={filters.from?.slice(0, 10) ?? ''} onChange={(e) => set('from', e.target.value ? `${e.target.value}T00:00:00Z` : '')} />
        <input className={selClass} type="date" value={filters.to?.slice(0, 10) ?? ''} onChange={(e) => set('to', e.target.value ? `${e.target.value}T23:59:59Z` : '')} />
      </div>

      {loading ? (
        <div className="adm-skel h-[320px] rounded-[18px]" />
      ) : error ? (
        <Card><ErrorState message={error} /></Card>
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Kpi icon={Coins} bg="#fff1f0" color="#B5101F" label="Taxas hoje" big={String(sumCount(data.operator_fees.today))} sub={moneyByCurrency(data.operator_fees.today)} />
            <Kpi icon={CalendarDays} bg="#eef4ff" color="#2657c9" label="Taxas no mês" big={String(sumCount(data.operator_fees.month))} sub={moneyByCurrency(data.operator_fees.month)} />
            <Kpi icon={HandCoins} bg="#eafaf0" color="#1f9d57" label="Liquidações hoje" big={String(data.application_settlements.today_count)} sub="aplicações" />
            <Kpi icon={Clock} bg="#fff7e8" color="#b07d18" label="Pendentes" big={String(data.application_settlements.pending_count)} sub="por concluir" />
            <Kpi icon={AlertTriangle} bg="#fdeef0" color="#c0392b" label="Falhadas" big={String(data.application_settlements.failed_count)} sub="requerem atenção" />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <ChartCard title="Receita por categoria" buckets={data.operator_fees.by_business_category} />
            <ChartCard title="Receita por moeda" buckets={data.operator_fees.by_currency} />
            <ChartCard title="Receita por perfil" buckets={data.operator_fees.by_pricing_profile} />
            <ChartCard title="Liquidações por estado" buckets={data.application_settlements.by_status} valueIsMoney={false} />
          </div>

          <Card>
            <CardHeader title="Taxas por dia (janela do filtro)" />
            <div className="p-[18px]">
              {data.operator_fees.by_day.length === 0
                ? <EmptyMsg title="Sem dados" hint="Nenhuma taxa na janela selecionada." />
                : <DayBars buckets={data.operator_fees.by_day} />}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, bg, color, label, big, sub }: {
  icon: typeof Coins; bg: string; color: string; label: string; big: string; sub: string;
}) {
  return (
    <div className="rounded-[16px] border border-[#f1e3e3] bg-white p-[18px]">
      <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px]" style={{ background: bg }}>
        <Icon size={18} color={color} strokeWidth={2.2} />
      </span>
      <p className="mt-3 font-mono text-[26px] font-black leading-none tracking-[-0.02em]">{big}</p>
      <p className="mt-[6px] text-[13px] font-extrabold text-[#2a2024]">{label}</p>
      <p className="mt-[2px] text-[12px] font-semibold text-[#9a8a8e]">{sub}</p>
    </div>
  );
}

function ChartCard({ title, buckets, valueIsMoney = true }: { title: string; buckets: FeeBucket[]; valueIsMoney?: boolean }) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="p-[18px]">
        {buckets.length === 0 ? <EmptyMsg title="Sem dados" hint="Nada para mostrar nesta janela." /> : <Bars buckets={buckets} valueIsMoney={valueIsMoney} />}
      </div>
    </Card>
  );
}

/** Horizontal bars sized by `total_minor` (revenue) or `count`. */
function Bars({ buckets, valueIsMoney }: { buckets: FeeBucket[]; valueIsMoney: boolean }) {
  const metric = (b: FeeBucket) => (valueIsMoney ? b.total_minor : b.count);
  const max = Math.max(1, ...buckets.map(metric));
  return (
    <div className="flex flex-col gap-[11px]">
      {buckets.map((b, i) => {
        const v = metric(b);
        const pctW = Math.max(2, Math.round((v / max) * 100));
        return (
          <div key={`${b.key}-${i}`} className="flex flex-col gap-[4px]">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="font-extrabold text-[#2a2024]">{b.key ?? 'sem categoria'}</span>
              <span className="font-mono font-bold text-[#5a4a4e]">{valueIsMoney ? formatKz(v) : v}{!valueIsMoney && ` · ${b.count}`}</span>
            </div>
            <div className="h-[9px] w-full overflow-hidden rounded-full bg-[#f6eded]">
              <div className="h-full rounded-full bg-[#B5101F]" style={{ width: `${pctW}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Compact vertical day bars (fees over the window). */
function DayBars({ buckets }: { buckets: FeeBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.total_minor));
  return (
    <div className="flex items-end gap-[3px] overflow-x-auto pb-1" style={{ height: 160 }}>
      {buckets.map((b) => {
        const h = Math.max(3, Math.round((b.total_minor / max) * 140));
        return (
          <div key={b.key} className="flex flex-none flex-col items-center gap-1" title={`${b.key}: ${formatKz(b.total_minor)} (${b.count})`}>
            <div className="w-[14px] rounded-t-[4px] bg-[#B5101F]" style={{ height: h }} />
            <span className="font-mono text-[9px] text-[#b3a3a7]">{(b.key ?? '').slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}
