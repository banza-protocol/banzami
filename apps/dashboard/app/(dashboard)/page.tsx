'use client';

import { useEffect, useState } from 'react';
import { getSession } from '@/lib/session';
import { BanzamiApi, type Transaction, type WalletBalance } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';

function isToday(dateStr: string): boolean {
  const d   = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
         d.getMonth()    === now.getMonth()    &&
         d.getDate()     === now.getDate();
}

function isThisMonth(dateStr: string): boolean {
  const d   = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function isCompleted(status: string): boolean {
  return status === 'COMPLETED' || status === 'CAPTURED' || status === 'PAID';
}

export default function OverviewPage() {
  const [txs, setTxs]         = useState<Transaction[]>([]);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
    let cancelled = false;

    async function load() {
      const tasks: Promise<void>[] = [
        api.listTransactions({ limit: 100 })
          .then(p => { if (!cancelled) setTxs(p.data); })
          .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Erro'); }),
      ];

      const loadBalance = session!.walletId
        ? api.getWalletBalance(session!.walletId)
        : api.getMerchantWallet().then(w => api.getWalletBalance(w.id));

      tasks.push(loadBalance.then(b => { if (!cancelled) setBalance(b); }).catch(() => {}));
      await Promise.all(tasks);
      if (!cancelled) setLoading(false);
    }

    load();
    // Near-real-time: refresh balance + recent activity every 15s so incoming
    // payments surface without a manual reload. Money moves at internet speed.
    const timer = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const currency  = txs[0]?.currency ?? balance?.currency ?? 'AOA';
  const todayTxs  = txs.filter(t => isCompleted(t.status) && isToday(t.created_at));
  const monthTxs  = txs.filter(t => isCompleted(t.status) && isThisMonth(t.created_at));
  const todayVol  = todayTxs.reduce((s, t) => s + t.amount_minor, 0);
  const monthVol  = monthTxs.reduce((s, t) => s + t.amount_minor, 0);

  return (
    <div className="flex flex-col gap-xl max-w-5xl mx-auto">
      {/* Balance card */}
      <div
        className="rounded-xl p-xl text-white"
        style={{ background: 'linear-gradient(135deg, #990011 0%, #6B000B 100%)' }}
      >
        <p className="text-xs font-medium text-white/60 uppercase tracking-wide mb-xs">
          Saldo disponível
        </p>
        {loading ? (
          <div className="h-10 flex items-center">
            <Spinner className="h-6 w-6 opacity-50" />
          </div>
        ) : balance ? (
          <>
            <p className="text-4xl font-bold font-mono tabular-nums">
              {formatMinor(balance.available_minor, balance.currency)}
            </p>
            {balance.reserved_minor > 0 && (
              <p className="mt-sm text-sm text-white/60">
                {formatMinor(balance.reserved_minor, balance.currency)} reservados
              </p>
            )}
          </>
        ) : (
          <p className="text-2xl font-bold text-white/50">—</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-lg">
        <StatCard
          label="Receita hoje"
          value={loading ? '…' : formatMinor(todayVol, currency)}
          sub={loading ? undefined : `${todayTxs.length} transacção${todayTxs.length !== 1 ? 'ões' : ''}`}
          loading={loading}
        />
        <StatCard
          label="Receita este mês"
          value={loading ? '…' : formatMinor(monthVol, currency)}
          sub={loading ? undefined : `${monthTxs.length} transacção${monthTxs.length !== 1 ? 'ões' : ''}`}
          loading={loading}
        />
        <StatCard
          label="Transacções carregadas"
          value={loading ? '…' : String(txs.length)}
          sub={loading ? undefined : 'últimas 100'}
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
