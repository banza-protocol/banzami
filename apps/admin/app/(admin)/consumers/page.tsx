'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, ArrowLeft, ShieldCheck, ShieldOff, Ban } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type Consumer, type VerificationBadge } from '@/lib/admin-api';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

export default function ConsumersPage() {
  const [search, setSearch]       = useState('');
  const [consumers, setConsumers] = useState<Consumer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  const [consumer, setConsumer]   = useState<Consumer | null>(null);
  const [badgeSaving, setBadgeSaving] = useState(false);
  const [badgeError,  setBadgeError]  = useState('');

  const [showSuspend, setShowSuspend]     = useState(false);
  const [suspendNotes, setSuspendNotes]   = useState('');
  const [suspending,  setSuspending]      = useState(false);
  const [suspendError, setSuspendError]   = useState('');
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

  async function handleSuspend() {
    if (!consumer) return;
    const session = getSession();
    if (!session) return;
    setSuspending(true); setSuspendError('');
    try {
      const api = new AdminApi(session.apiUrl, session.adminKey);
      const updated = await api.suspendConsumer(consumer.id, suspendNotes);
      setConsumer(updated);
      setShowSuspend(false);
      setSuspendNotes('');
    } catch (e) {
      setSuspendError(e instanceof Error ? e.message : 'Erro ao suspender.');
    } finally {
      setSuspending(false);
    }
  }

  async function handleSetBadge(badge: VerificationBadge | null) {
    if (!consumer) return;
    const session = getSession();
    if (!session) return;
    setBadgeSaving(true); setBadgeError('');
    try {
      const api = new AdminApi(session.apiUrl, session.adminKey);
      const updated = await api.setConsumerBadge(consumer.id, badge);
      setConsumer(updated);
    } catch (e) {
      setBadgeError(e instanceof Error ? e.message : 'Erro ao actualizar badge.');
    } finally {
      setBadgeSaving(false);
    }
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
              <Row label="Badge de verificação" value={
                consumer.verification_badge
                  ? <Badge label={consumer.verification_badge} />
                  : <span className="text-gray-400 text-xs">Nenhum</span>
              } />
            </div>
          </div>

          {/* Suspend action */}
          {consumer.status !== 'SUSPENDED' && (
            <div className="bg-white rounded-lg shadow-card overflow-hidden">
              <div className="px-xl py-lg border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-sm">
                  <Ban size={15} className="text-gray-400" />
                  Acções de conta
                </h3>
              </div>
              <div className="px-xl py-lg flex flex-wrap gap-sm">
                <button
                  onClick={() => { setShowSuspend(true); setSuspendError(''); }}
                  className="px-lg py-sm text-sm font-medium rounded-md border border-error/40 text-error bg-error-bg hover:bg-red-100 transition-colors"
                >
                  Suspender
                </button>
              </div>
            </div>
          )}

          {/* Suspend confirmation modal */}
          {showSuspend && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-md">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-xl flex flex-col gap-lg">
                <h3 className="text-sm font-semibold text-gray-900">Suspender @{consumer.handle}?</h3>
                <p className="text-xs text-gray-500">
                  A conta ficará imediatamente inactiva. Esta acção pode ser revertida via API.
                </p>
                <div className="flex flex-col gap-xs">
                  <label className="text-xs font-medium text-gray-700">Notas (obrigatório)</label>
                  <textarea
                    value={suspendNotes}
                    onChange={e => setSuspendNotes(e.target.value)}
                    placeholder="Motivo ou observações…"
                    rows={3}
                    className="w-full text-sm border border-gray-200 rounded-md px-lg py-sm resize-none outline-none focus:ring-2 focus:ring-gray-900/20"
                  />
                </div>
                {suspendError && (
                  <p className="text-xs text-error bg-error-bg rounded-lg px-lg py-sm">{suspendError}</p>
                )}
                <div className="flex gap-sm justify-end">
                  <button
                    onClick={() => { setShowSuspend(false); setSuspendNotes(''); }}
                    disabled={suspending}
                    className="px-lg py-sm text-sm rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSuspend}
                    disabled={suspending || !suspendNotes.trim()}
                    className="px-lg py-sm text-sm font-medium rounded-md bg-error text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-sm"
                  >
                    {suspending && <Spinner className="h-3 w-3" />}
                    Confirmar suspensão
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Badge control */}
          <div className="bg-white rounded-lg shadow-card overflow-hidden">
            <div className="px-xl py-lg border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-sm">
                <ShieldCheck size={15} className="text-gray-400" />
                Atribuir badge de verificação
              </h3>
              <p className="text-xs text-gray-400 mt-xs">
                O badge aparece no perfil do utilizador na app mobile.
              </p>
            </div>
            <div className="px-xl py-lg flex flex-wrap gap-sm">
              <button
                disabled={badgeSaving}
                onClick={() => handleSetBadge('CONSUMER')}
                className={`px-lg py-sm text-sm font-medium rounded-md border transition-colors disabled:opacity-50 ${
                  consumer.verification_badge === 'CONSUMER'
                    ? 'bg-amber-50 border-amber-400 text-amber-800'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Consumidor (gold)
              </button>
              <button
                disabled={badgeSaving}
                onClick={() => handleSetBadge('MERCHANT')}
                className={`px-lg py-sm text-sm font-medium rounded-md border transition-colors disabled:opacity-50 ${
                  consumer.verification_badge === 'MERCHANT'
                    ? 'bg-blue-50 border-blue-400 text-blue-800'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Comerciante (azul)
              </button>
              <button
                disabled={badgeSaving || consumer.verification_badge === null}
                onClick={() => handleSetBadge(null)}
                className="px-lg py-sm text-sm font-medium rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-40 flex items-center gap-xs"
              >
                <ShieldOff size={13} /> Remover badge
              </button>
              {badgeSaving && <Spinner className="h-4 w-4 self-center" />}
            </div>
            {badgeError && (
              <p className="px-xl pb-lg text-xs text-error">{badgeError}</p>
            )}
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
