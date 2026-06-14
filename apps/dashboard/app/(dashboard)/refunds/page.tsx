'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSession } from '@/lib/session';
import { BanzamiApi, type Refund } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';

const STATUS_COLORS: Record<string, string> = {
  SUCCEEDED: 'bg-green-100 text-green-800',
  PENDING:   'bg-yellow-100 text-yellow-800',
  FAILED:    'bg-red-100 text-red-800',
};

function statusColor(s: string) {
  return STATUS_COLORS[s] ?? 'bg-gray-100 text-gray-700';
}

export default function RefundsPage() {
  const [rows, setRows]     = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  // Create-refund form state
  const [showForm, setShowForm]   = useState(false);
  const [txId, setTxId]           = useState('');
  const [amount, setAmount]       = useState('');
  const [reason, setReason]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    const session = getSession();
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const api  = new BanzamiApi(session.gatewayUrl, session.apiKey);
      const page = await api.listRefunds({ limit: 50 });
      setRows(page.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar reembolsos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const amtMinor = Math.round(parseFloat(amount) * 100);
    if (!txId.trim() || !amount || isNaN(amtMinor) || amtMinor <= 0) {
      setFormError('Preencha ID de transacção e montante válido.');
      return;
    }
    const session = getSession();
    if (!session) return;
    setSubmitting(true);
    try {
      const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
      await api.createRefund({
        transaction_id:  txId.trim(),
        amount_minor:    amtMinor,
        reason:          reason.trim() || undefined,
        idempotency_key: `refund-${txId.trim()}-${Date.now()}`,
      });
      setShowForm(false);
      setTxId(''); setAmount(''); setReason('');
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao criar reembolso');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-lg max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Reembolsos</h1>
        <button
          onClick={() => setShowForm(v => !v)}
          className="h-9 px-xl bg-banzami text-white rounded-md text-sm font-medium hover:bg-banzami/90 transition-colors"
        >
          {showForm ? 'Cancelar' : '+ Novo reembolso'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-lg shadow-card p-xl flex flex-col gap-md">
          <h2 className="font-semibold text-gray-800">Criar reembolso</h2>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="grid grid-cols-2 gap-md">
            <div className="flex flex-col gap-xs">
              <label className="text-xs font-medium text-gray-600">ID de transacção *</label>
              <input
                value={txId}
                onChange={e => setTxId(e.target.value)}
                placeholder="uuid"
                className="h-9 border border-gray-200 rounded-md px-md text-sm outline-none focus:ring-2 focus:ring-banzami/30"
              />
            </div>
            <div className="flex flex-col gap-xs">
              <label className="text-xs font-medium text-gray-600">Montante (Kz) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-9 border border-gray-200 rounded-md px-md text-sm outline-none focus:ring-2 focus:ring-banzami/30"
              />
            </div>
          </div>
          <div className="flex flex-col gap-xs">
            <label className="text-xs font-medium text-gray-600">Motivo (opcional)</label>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="ex: produto com defeito"
              className="h-9 border border-gray-200 rounded-md px-md text-sm outline-none focus:ring-2 focus:ring-banzami/30"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="self-end h-9 px-xl bg-banzami text-white rounded-md text-sm font-medium hover:bg-banzami/90 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'A processar…' : 'Criar reembolso'}
          </button>
        </form>
      )}

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}
      {error   && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <EmptyState title="Sem reembolsos" description="Nenhum reembolso encontrado." />
      )}

      {!loading && rows.length > 0 && (
        <div className="bg-white rounded-lg shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
                  <th className="px-xl py-md">ID</th>
                  <th className="px-xl py-md">Transacção</th>
                  <th className="px-xl py-md">Montante</th>
                  <th className="px-xl py-md">Estado</th>
                  <th className="px-xl py-md">Motivo</th>
                  <th className="px-xl py-md">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-xl py-md font-mono text-xs text-gray-500">{r.id.slice(0, 8)}…</td>
                    <td className="px-xl py-md font-mono text-xs text-gray-500">{r.transaction_id.slice(0, 8)}…</td>
                    <td className="px-xl py-md font-semibold">{formatMinor(r.amount_minor, r.currency)}</td>
                    <td className="px-xl py-md">
                      <Badge className={statusColor(r.status)}>{r.status}</Badge>
                    </td>
                    <td className="px-xl py-md text-gray-500 truncate max-w-xs">{r.reason ?? '—'}</td>
                    <td className="px-xl py-md text-gray-400 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString('pt-AO')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
