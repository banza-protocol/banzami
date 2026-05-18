'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSession } from '@/lib/session';
import { AdminApi, type AdminDispute } from '@/lib/admin-api';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

const STATUS_COLORS: Record<string, string> = {
  OPEN:             'bg-yellow-100 text-yellow-700',
  UNDER_REVIEW:     'bg-blue-100 text-blue-700',
  WON_BY_CONSUMER:  'bg-green-100 text-green-700',
  WON_BY_MERCHANT:  'bg-gray-100 text-gray-600',
  CLOSED:           'bg-gray-100 text-gray-500',
};

const STATUSES = ['', 'OPEN', 'UNDER_REVIEW', 'WON_BY_CONSUMER', 'WON_BY_MERCHANT', 'CLOSED'];
const OUTCOMES = ['WON_BY_CONSUMER', 'WON_BY_MERCHANT', 'CLOSED'];

function fmt(n: number) {
  return (n / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' Kz';
}

export default function AdminDisputesPage() {
  const [rows, setRows]       = useState<AdminDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [filter, setFilter]   = useState('');
  const [selected, setSelected] = useState<AdminDispute | null>(null);

  // Resolve form
  const [outcome, setOutcome]     = useState('WON_BY_CONSUMER');
  const [notes, setNotes]         = useState('');
  const [resolvedBy, setResolvedBy] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveErr, setResolveErr] = useState('');

  const load = useCallback(async () => {
    const session = getSession();
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const api  = new AdminApi(session.adminUrl, session.adminKey);
      const page = await api.listDisputes({ status: filter || undefined, limit: 100 });
      setRows(page.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar disputas');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setRows([]);
    load();
  }, [load]);

  async function handleResolve(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !resolvedBy.trim()) {
      setResolveErr('resolved_by é obrigatório');
      return;
    }
    const session = getSession();
    if (!session) return;
    setResolving(true);
    setResolveErr('');
    try {
      const api = new AdminApi(session.adminUrl, session.adminKey);
      await api.resolveDispute(selected.id, outcome, notes.trim(), resolvedBy.trim());
      setSelected(null);
      setNotes('');
      setResolvedBy('');
      await load();
    } catch (e) {
      setResolveErr(e instanceof Error ? e.message : 'Erro ao resolver disputa');
    } finally {
      setResolving(false);
    }
  }

  const isResolvable = selected ? ['OPEN', 'UNDER_REVIEW'].includes(selected.status) : false;

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Disputas</h1>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="h-8 border border-gray-200 rounded-md px-3 text-sm"
        >
          {STATUSES.map(s => <option key={s} value={s}>{s || 'Todos os estados'}</option>)}
        </select>
      </div>

      <div className="flex gap-6">
        {/* List */}
        <div className="flex-1 min-w-0">
          {loading && <div className="flex justify-center py-12"><Spinner /></div>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {!loading && rows.length === 0 && (
            <p className="text-sm text-gray-400 py-8 text-center">Nenhuma disputa encontrada.</p>
          )}

          {!loading && rows.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Transacção</th>
                    <th className="px-4 py-3">Montante</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Criada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(d => (
                    <tr
                      key={d.id}
                      onClick={() => { setSelected(d); setResolveErr(''); }}
                      className={`cursor-pointer hover:bg-gray-50 ${selected?.id === d.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{d.id.slice(0, 8)}…</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{d.transaction_id.slice(0, 8)}…</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{fmt(d.amount_minor)}</td>
                      <td className="px-4 py-3">
                        <Badge className={STATUS_COLORS[d.status] ?? 'bg-gray-100 text-gray-600'}>{d.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                        {new Date(d.created_at).toLocaleDateString('pt-AO')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail + resolution panel */}
        {selected && (
          <div className="w-80 flex-shrink-0">
            <div className="bg-white rounded-lg border border-gray-100 p-5 flex flex-col gap-4 sticky top-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800 text-sm">Detalhe</h3>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
              </div>

              <dl className="grid gap-2 text-xs">
                <DetailRow label="ID"          value={selected.id} mono />
                <DetailRow label="Transacção"  value={selected.transaction_id} mono />
                <DetailRow label="Consumidor"  value={selected.consumer_id} mono />
                <DetailRow label="Comerciante" value={selected.merchant_id} mono />
                <DetailRow label="Montante"    value={fmt(selected.amount_minor)} />
                <DetailRow label="Motivo"      value={selected.reason} />
                <DetailRow label="Estado"      value={selected.status} />
                {selected.evidence_deadline && (
                  <DetailRow label="Prazo" value={new Date(selected.evidence_deadline).toLocaleString('pt-AO')} />
                )}
                {selected.resolution_notes && (
                  <DetailRow label="Notas" value={selected.resolution_notes} />
                )}
                {selected.resolved_at && (
                  <DetailRow label="Resolvida" value={new Date(selected.resolved_at).toLocaleString('pt-AO')} />
                )}
              </dl>

              {isResolvable && (
                <form onSubmit={handleResolve} className="flex flex-col gap-3 border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Resolver disputa</p>

                  {resolveErr && <p className="text-xs text-red-600">{resolveErr}</p>}

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">Desfecho</label>
                    <select
                      value={outcome}
                      onChange={e => setOutcome(e.target.value)}
                      className="h-8 border border-gray-200 rounded px-2 text-xs"
                    >
                      {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">Notas de resolução</label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Explicação da decisão…"
                      className="border border-gray-200 rounded px-2 py-1 text-xs resize-none outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">Resolvido por (ID admin) *</label>
                    <input
                      value={resolvedBy}
                      onChange={e => setResolvedBy(e.target.value)}
                      placeholder="uuid do admin"
                      className="h-8 border border-gray-200 rounded px-2 text-xs outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={resolving}
                    className="h-9 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {resolving ? 'A resolver…' : 'Confirmar resolução'}
                  </button>
                </form>
              )}

              {!isResolvable && (
                <p className="text-xs text-gray-400 text-center pt-2">Disputa já resolvida.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-400 shrink-0">{label}</dt>
      <dd className={`text-gray-800 text-right truncate ${mono ? 'font-mono text-[10px]' : ''}`}>{value}</dd>
    </div>
  );
}
