'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSession } from '@/lib/session';
import { BanzamiApi, type Dispute } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';

const STATUS_COLORS: Record<string, string> = {
  OPEN:             'bg-yellow-100 text-yellow-800',
  UNDER_REVIEW:     'bg-blue-100 text-blue-800',
  WON_BY_CONSUMER:  'bg-green-100 text-green-800',
  WON_BY_MERCHANT:  'bg-gray-100 text-gray-700',
  CLOSED:           'bg-gray-100 text-gray-500',
};

const STATUSES = ['', 'OPEN', 'UNDER_REVIEW', 'WON_BY_CONSUMER', 'WON_BY_MERCHANT', 'CLOSED'];

function statusColor(s: string) {
  return STATUS_COLORS[s] ?? 'bg-gray-100 text-gray-700';
}

export default function DisputesPage() {
  const [rows, setRows]       = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [status, setStatus]   = useState('');
  const [selected, setSelected] = useState<Dispute | null>(null);

  const load = useCallback(async () => {
    const session = getSession();
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const api  = new BanzamiApi(session.gatewayUrl, session.apiKey);
      const page = await api.listDisputes({ status: status || undefined, limit: 50 });
      setRows(page.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar disputas');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    setRows([]);
    load();
  }, [load]);

  if (selected) {
    return <DisputeDetail dispute={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="flex flex-col gap-lg max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Disputas</h1>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="h-8 bg-white border border-gray-100 rounded-md px-md text-sm text-gray-900 outline-none focus:ring-2 focus:ring-banzami/30"
        >
          {STATUSES.map(s => <option key={s} value={s}>{s || 'Todos os estados'}</option>)}
        </select>
      </div>

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}
      {error   && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <EmptyState title="Sem disputas" description="Nenhuma disputa encontrada." />
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
                  <th className="px-xl py-md">Prazo evidências</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(d => (
                  <tr
                    key={d.id}
                    onClick={() => setSelected(d)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-xl py-md font-mono text-xs text-gray-500">{d.id.slice(0, 8)}…</td>
                    <td className="px-xl py-md font-mono text-xs text-gray-500">{d.transaction_id.slice(0, 8)}…</td>
                    <td className="px-xl py-md font-semibold">{formatMinor(d.amount_minor, d.currency)}</td>
                    <td className="px-xl py-md">
                      <Badge className={statusColor(d.status)}>{d.status}</Badge>
                    </td>
                    <td className="px-xl py-md text-gray-500 truncate max-w-xs">{d.reason}</td>
                    <td className="px-xl py-md text-gray-400 whitespace-nowrap">
                      {d.evidence_deadline
                        ? new Date(d.evidence_deadline).toLocaleDateString('pt-AO')
                        : '—'}
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

// ---------------------------------------------------------------------------
// Dispute detail drill-down (read-only for merchant side)
// ---------------------------------------------------------------------------

function DisputeDetail({ dispute, onBack }: { dispute: Dispute; onBack: () => void }) {
  const isOpen = ['OPEN', 'UNDER_REVIEW'].includes(dispute.status);

  return (
    <div className="flex flex-col gap-lg max-w-3xl mx-auto">
      <button
        onClick={onBack}
        className="self-start text-sm text-gray-500 hover:text-gray-700 flex items-center gap-xs"
      >
        ← Voltar às disputas
      </button>

      <div className="bg-white rounded-lg shadow-card p-xl flex flex-col gap-md">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Disputa</h2>
          <Badge className={dispute.status === 'OPEN' ? 'bg-yellow-100 text-yellow-800' :
            dispute.status === 'UNDER_REVIEW' ? 'bg-blue-100 text-blue-800' :
            dispute.status.startsWith('WON_BY_CONSUMER') ? 'bg-green-100 text-green-800' :
            'bg-gray-100 text-gray-700'}>
            {dispute.status}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-md text-sm">
          <InfoRow label="ID"              value={dispute.id} mono />
          <InfoRow label="Transacção"      value={dispute.transaction_id} mono />
          <InfoRow label="Consumidor"      value={dispute.consumer_id} mono />
          <InfoRow label="Montante"        value={formatMinor(dispute.amount_minor, dispute.currency)} />
          <InfoRow label="Motivo"          value={dispute.reason} />
          <InfoRow label="Prazo evidência" value={dispute.evidence_deadline ? new Date(dispute.evidence_deadline).toLocaleString('pt-AO') : '—'} />
          {dispute.resolution_notes && (
            <InfoRow label="Resolução" value={dispute.resolution_notes} />
          )}
          {dispute.resolved_at && (
            <InfoRow label="Resolvida em" value={new Date(dispute.resolved_at).toLocaleString('pt-AO')} />
          )}
        </div>

        {isOpen && (
          <p className="text-xs text-gray-500 bg-yellow-50 border border-yellow-200 rounded p-md">
            Esta disputa está em curso. Para submeter evidências ou solicitar resolução, contacte o suporte Banzami.
          </p>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-xs">
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
      <span className={`text-sm text-gray-900 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
