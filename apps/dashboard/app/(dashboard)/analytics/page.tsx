'use client';

import { useEffect, useState } from 'react';
import { getSession } from '@/lib/session';
import { BanzamiApi, type MerchantAnalytics } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';

type Period = '7d' | '30d' | '90d' | 'month';

const PERIODS: { id: Period; label: string }[] = [
  { id: '7d',    label: '7 dias'   },
  { id: '30d',   label: '30 dias'  },
  { id: '90d',   label: '90 dias'  },
  { id: 'month', label: 'Este mês' },
];

function rangeFor(period: Period): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  if (period === 'month') {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  } else {
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    from.setDate(from.getDate() - days);
  }
  return { from, to };
}

function csvFor(a: MerchantAnalytics): string {
  const rows = [['day', 'count', 'volume_minor', 'volume']];
  for (const d of a.daily) {
    rows.push([d.day, String(d.count), String(d.volume_minor), formatMinor(d.volume_minor, a.currency)]);
  }
  return rows.map(r => r.join(',')).join('\n');
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [data, setData]     = useState<MerchantAnalytics | null>(null);
  const [loading, setLoad]  = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    setLoad(true);
    setError('');
    const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
    const { from, to } = rangeFor(period);

    const walletId = session.walletId
      ? Promise.resolve(session.walletId)
      : api.getMerchantWallet().then(w => w.id);

    walletId
      .then(id => api.getAnalytics(id, from.toISOString(), to.toISOString()))
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Erro ao carregar análises'))
      .finally(() => setLoad(false));
  }, [period]);

  function exportCsv() {
    if (!data) return;
    const blob = new Blob([csvFor(data)], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `banzami-analytics-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const ccy        = data?.currency ?? 'AOA';
  const maxDaily   = Math.max(1, ...(data?.daily.map(d => d.volume_minor) ?? [0]));
  const maxHour    = Math.max(1, ...(data?.by_hour.map(h => h.volume_minor) ?? [0]));
  const avgPerDay  = data && data.active_days > 0
    ? Math.round(data.total_volume_minor / data.active_days)
    : 0;
  const peakHour   = data?.by_hour.reduce<null | { hour: number; volume_minor: number }>(
    (best, h) => (best === null || h.volume_minor > best.volume_minor ? h : best), null) ?? null;

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex items-center justify-between flex-wrap gap-md">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Análises</h1>
          <p className="text-sm text-gray-400">Volume de pagamentos recebidos, derivado do ledger.</p>
        </div>
        <div className="flex items-center gap-sm">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-md py-xs text-sm rounded-md transition-colors ${
                  period === p.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={exportCsv}
            disabled={!data || data.daily.length === 0}
            className="px-md py-xs text-sm rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-error-bg text-error px-lg py-md text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-lg">
        <StatCard label="Volume total"    value={formatMinor(data?.total_volume_minor ?? 0, ccy)} loading={loading} />
        <StatCard label="Pagamentos"      value={String(data?.total_count ?? 0)}                  loading={loading} />
        <StatCard label="Média por dia"   value={formatMinor(avgPerDay, ccy)} sub={`${data?.active_days ?? 0} dias activos`} loading={loading} />
        <StatCard label="Hora de pico"    value={peakHour ? `${String(peakHour.hour).padStart(2, '0')}h` : '—'} sub={peakHour ? formatMinor(peakHour.volume_minor, ccy) : undefined} loading={loading} />
      </div>

      {loading ? (
        <div className="flex justify-center py-3xl"><Spinner className="h-8 w-8" /></div>
      ) : !data || data.daily.length === 0 ? (
        <EmptyState message="Sem pagamentos recebidos neste intervalo." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-xl">
          {/* Daily volume */}
          <div className="bg-white rounded-lg shadow-card p-xl">
            <h2 className="text-sm font-semibold text-gray-900 mb-lg">Volume diário</h2>
            <div className="flex items-end gap-1 h-48">
              {data.daily.map(d => (
                <div key={d.day} className="flex-1 flex flex-col justify-end group relative" title={`${d.day}: ${formatMinor(d.volume_minor, ccy)} (${d.count})`}>
                  <div
                    className="bg-gray-900 rounded-t group-hover:bg-gray-700 transition-colors"
                    style={{ height: `${Math.max(2, (d.volume_minor / maxDaily) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-sm text-[10px] text-gray-400">
              <span>{data.daily[0]?.day}</span>
              <span>{data.daily[data.daily.length - 1]?.day}</span>
            </div>
          </div>

          {/* Peak hours */}
          <div className="bg-white rounded-lg shadow-card p-xl">
            <h2 className="text-sm font-semibold text-gray-900 mb-lg">Horas de pico</h2>
            <div className="flex items-end gap-1 h-48">
              {Array.from({ length: 24 }, (_, hour) => {
                const point = data.by_hour.find(h => h.hour === hour);
                const vol   = point?.volume_minor ?? 0;
                return (
                  <div key={hour} className="flex-1 flex flex-col justify-end group relative" title={`${String(hour).padStart(2, '0')}h: ${formatMinor(vol, ccy)} (${point?.count ?? 0})`}>
                    <div
                      className="bg-[#B5101F]/80 rounded-t group-hover:bg-[#B5101F] transition-colors"
                      style={{ height: `${Math.max(2, (vol / maxHour) * 100)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-sm text-[10px] text-gray-400">
              <span>00h</span><span>12h</span><span>23h</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
