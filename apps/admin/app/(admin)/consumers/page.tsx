'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type Consumer } from '@/lib/admin-api';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

export default function ConsumersPage() {
  const [search, setSearch]       = useState('');
  const [consumers, setConsumers] = useState<Consumer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  const [consumer, setConsumer]       = useState<Consumer | null>(null);
  const loadConsumers = useCallback(async (q?: string) => {
    const session = getSession();
    if (!session) return;
    setLoading(true); setError('');
    try {
      const api = new AdminApi(session.apiUrl, session.adminKey);
      const res = await api.listConsumers(q);
      setConsumers(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConsumers(); }, [loadConsumers]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    loadConsumers(search.trim() || undefined);
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-xl">

      {/* ── List ─────────────────────────────────────────────────────────── */}
      {!consumer && (
        <>
          <form onSubmit={handleSearch} className="flex gap-md">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 h-10 bg-white border border-gray-100 rounded-md px-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20"
              placeholder="Pesquisar por handle…"
            />
            <button type="submit" disabled={loading}
              className="h-10 px-lg bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-700 disabled:opacity-60 transition-colors flex items-center gap-sm">
              <Search size={15} />Pesquisar
            </button>
          </form>

          {loading && <div className="flex justify-center py-xl"><Spinner className="h-6 w-6" /></div>}
          {error   && <p className="text-sm text-error bg-error-bg rounded-lg px-xl py-lg">{error}</p>}

          {!loading && consumers.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-xl">Nenhum consumidor encontrado.</p>
          )}

          {consumers.length > 0 && (
            <div className="bg-white rounded-lg shadow-card overflow-hidden divide-y divide-gray-100">
              {consumers.map(c => (
                <button key={c.id} onClick={() => setConsumer(c)}
                  className="w-full flex items-center justify-between px-xl py-lg hover:bg-gray-50 transition-colors text-left">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      @{c.handle}
                      {c.display_name && <span className="text-gray-400 font-normal ml-sm">· {c.display_name}</span>}
                    </p>
                    <p className="text-xs text-gray-400 font-mono mt-xs">{c.id}</p>
                  </div>
                  <Badge label={c.status} />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Detail ───────────────────────────────────────────────────────── */}
      {consumer && (
        <>
          <button onClick={() => setConsumer(null)}
            className="flex items-center gap-sm text-sm text-gray-400 hover:text-gray-900 transition-colors self-start">
            <ArrowLeft size={14} /> Voltar à lista
          </button>

          <div className="bg-white rounded-lg shadow-card overflow-hidden">
            <div className="px-xl py-lg border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">@{consumer.handle}</h2>
              {consumer.display_name && <p className="text-xs text-gray-500">{consumer.display_name}</p>}
              <p className="text-xs font-mono text-gray-400 mt-xs">{consumer.id}</p>
            </div>
            <div className="divide-y divide-gray-100">
              <Row label="Estado"    value={<Badge label={consumer.status} />} />
              <Row label="Criado em" value={new Date(consumer.created_at).toLocaleString('pt-AO', { dateStyle: 'medium', timeStyle: 'short' })} />
            </div>
          </div>

        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-xl py-md gap-md">
      <span className="text-sm text-gray-400 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}
