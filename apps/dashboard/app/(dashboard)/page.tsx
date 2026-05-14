'use client';

import { useEffect, useState } from 'react';
import { getSession } from '@/lib/session';
import { BanzamiApi, type Transaction } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';

export default function OverviewPage() {
  const [txs, setTxs]         = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
    api.listTransactions({ limit: 50 })
      .then(p => setTxs(p.data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const completed  = txs.filter(t => t.status === 'CAPTURED');
  const totalVol   = completed.reduce((s, t) => s + t.amount_minor, 0);
  const currency   = txs[0]?.currency ?? 'AOA';
  const successPct = txs.length ? Math.round((completed.length / txs.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-xl max-w-5xl mx-auto">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-lg">
        <StatCard
          label="Volume (últimas 50)"
          value={loading ? '…' : formatMinor(totalVol, currency)}
          loading={loading}
        />
        <StatCard
          label="Transacções"
          value={loading ? '…' : String(txs.length)}
          sub={loading ? undefined : `${completed.length} concluídas`}
          loading={loading}
        />
        <StatCard
          label="Taxa de Sucesso"
          value={loading ? '…' : `${successPct}%`}
          loading={loading}
        />
      </div>

      {/* Recent transactions */}
      <div className="bg-white rounded-lg shadow-card overflow-hidden">
        <div className="px-xl py-lg border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Actividade Recente</h2>
        </div>

        {loading && (
          <div className="flex justify-center py-page">
            <Spinner className="h-6 w-6" />
          </div>
        )}
        {!loading && error && (
          <p className="px-xl py-lg text-sm text-error">{error}</p>
        )}
        {!loading && !error && txs.length === 0 && (
          <EmptyState message="Nenhuma transacção ainda" />
        )}
        {!loading && !error && txs.length > 0 && (
          <TransactionTable rows={txs.slice(0, 10)} />
        )}
      </div>
    </div>
  );
}

function TransactionTable({ rows }: { rows: Transaction[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-100 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
            <th className="px-xl py-md">ID</th>
            <th className="px-xl py-md">Montante</th>
            <th className="px-xl py-md">Estado</th>
            <th className="px-xl py-md">Data</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(t => (
            <tr key={t.id} className="hover:bg-gray-100/50 transition-colors">
              <td className="px-xl py-md font-mono text-xs text-gray-400">{t.id.slice(-12)}</td>
              <td className="px-xl py-md font-semibold text-gray-900 font-mono tabular-nums">
                {formatMinor(t.amount_minor, t.currency)}
              </td>
              <td className="px-xl py-md"><Badge label={t.status} /></td>
              <td className="px-xl py-md text-gray-400 whitespace-nowrap">
                {new Date(t.created_at).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
