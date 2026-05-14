'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { getSession } from '@/lib/session';
import { BanzamiApi, type Transaction } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';

const STATUSES = ['', 'PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REVERSED', 'REFUNDED'] as const;

export default function TransactionsPage() {
  const [rows, setRows]         = useState<Transaction[]>([]);
  const [cursor, setCursor]     = useState<string | undefined>();
  const [hasMore, setHasMore]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [status, setStatus]     = useState('');
  const [error, setError]       = useState('');

  const load = useCallback(async (nextCursor?: string) => {
    const session = getSession();
    if (!session) return;
    const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
    setLoading(true);
    setError('');
    try {
      const page = await api.listTransactions({
        limit:  25,
        cursor: nextCursor,
        status: status || undefined,
      });
      setRows(prev => nextCursor ? [...prev, ...page.data] : page.data);
      setCursor(page.next_cursor);
      setHasMore(!!page.next_cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    setRows([]);
    setCursor(undefined);
    load(undefined);
  }, [load]);

  return (
    <div className="flex flex-col gap-lg max-w-5xl mx-auto">
      {/* Filter bar */}
      <div className="flex items-center gap-md">
        <label className="text-xs font-medium text-gray-700">Estado</label>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="h-8 bg-white border border-gray-100 rounded-md px-md text-sm text-gray-900 outline-none focus:ring-2 focus:ring-wine/30"
        >
          {STATUSES.map(s => (
            <option key={s} value={s}>{s || 'Todos'}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
                <th className="px-xl py-md">ID</th>
                <th className="px-xl py-md">Referência</th>
                <th className="px-xl py-md">Montante</th>
                <th className="px-xl py-md">Estado</th>
                <th className="px-xl py-md">Data</th>
                <th className="px-xl py-md w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(t => (
                <tr key={t.id} className="hover:bg-gray-100/50 transition-colors">
                  <td className="px-xl py-md font-mono text-xs text-gray-400">{t.id.slice(-12)}</td>
                  <td className="px-xl py-md text-gray-700 max-w-[140px] truncate">
                    {t.reference ?? '—'}
                  </td>
                  <td className="px-xl py-md font-semibold text-gray-900 font-mono tabular-nums whitespace-nowrap">
                    {formatMinor(t.amount_minor, t.currency)}
                  </td>
                  <td className="px-xl py-md"><Badge label={t.status} /></td>
                  <td className="px-xl py-md text-gray-400 whitespace-nowrap">
                    {new Date(t.created_at).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-xl py-md">
                    <ChevronRight size={14} className="text-gray-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="flex justify-center py-xl">
            <Spinner className="h-5 w-5" />
          </div>
        )}
        {!loading && !error && rows.length === 0 && (
          <EmptyState message="Nenhuma transacção encontrada" />
        )}
        {error && <p className="px-xl py-lg text-sm text-error">{error}</p>}

        {hasMore && !loading && (
          <div className="border-t border-gray-100 px-xl py-md">
            <button
              onClick={() => load(cursor)}
              className="text-sm font-medium text-wine hover:underline"
            >
              Carregar mais
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
