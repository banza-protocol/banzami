'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type Settlement } from '@/lib/admin-api';
import { formatMinor } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type Action = { type: 'submit' | 'confirm' | 'fail'; settlementId: string };

export default function SettlementsPage() {
  const [merchantId, setMerchantId]   = useState('');
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [action, setAction]           = useState<Action | null>(null);

  async function lookup() {
    const id = merchantId.trim();
    if (!id) return;
    const session = getSession();
    if (!session) return;
    setLoading(true); setError('');
    try {
      const api  = new AdminApi(session.apiUrl, session.adminKey);
      const page = await api.listSettlements(id);
      setSettlements(page.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }

  function updateRow(updated: Settlement) {
    setSettlements(prev => prev.map(s => s.id === updated.id ? updated : s));
    setAction(null);
  }

  async function executeAction(reason: string) {
    const session = getSession();
    if (!session || !action) return;
    const api = new AdminApi(session.apiUrl, session.adminKey);
    let updated: Settlement;
    switch (action.type) {
      case 'submit':  updated = await api.submitSettlement(action.settlementId); break;
      case 'confirm': updated = await api.confirmSettlement(action.settlementId); break;
      case 'fail':    updated = await api.failSettlement(action.settlementId, reason); break;
    }
    updateRow(updated);
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-xl">
      <div className="flex gap-md">
        <input value={merchantId} onChange={e => setMerchantId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && lookup()}
          className="flex-1 h-10 bg-white border border-gray-100 rounded-md px-lg text-sm outline-none focus:ring-2 focus:ring-gray-900/20"
          placeholder="ID do comerciante" />
        <button onClick={lookup} disabled={loading}
          className="h-10 px-lg bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-700 disabled:opacity-60 transition-colors flex items-center gap-sm">
          <Search size={15} /> Pesquisar
        </button>
      </div>

      {loading && <div className="flex justify-center py-xl"><Spinner className="h-6 w-6" /></div>}
      {error   && <p className="text-sm text-error bg-error-bg rounded-lg px-xl py-lg">{error}</p>}

      {settlements.length > 0 && (
        <div className="bg-white rounded-lg shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
                  <th className="px-xl py-md">ID</th>
                  <th className="px-xl py-md">Montante</th>
                  <th className="px-xl py-md">Estado</th>
                  <th className="px-xl py-md">Período</th>
                  <th className="px-xl py-md">Acções</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {settlements.map(s => (
                  <tr key={s.id} className="hover:bg-gray-100/50">
                    <td className="px-xl py-md font-mono text-xs text-gray-400">{s.id.slice(-12)}</td>
                    <td className="px-xl py-md font-semibold font-mono tabular-nums whitespace-nowrap">
                      {formatMinor(s.amount_minor, s.currency)}
                    </td>
                    <td className="px-xl py-md"><Badge label={s.status} /></td>
                    <td className="px-xl py-md text-xs text-gray-400 whitespace-nowrap">
                      {new Date(s.period_from).toLocaleDateString('pt-AO')} → {new Date(s.period_to).toLocaleDateString('pt-AO')}
                    </td>
                    <td className="px-xl py-md">
                      <div className="flex gap-xs flex-wrap">
                        {s.status === 'PENDING' && (
                          <ActionBtn label="Submeter" onClick={() => setAction({ type: 'submit', settlementId: s.id })} />
                        )}
                        {s.status === 'SUBMITTED' && (
                          <ActionBtn label="Confirmar" onClick={() => setAction({ type: 'confirm', settlementId: s.id })} success />
                        )}
                        {(s.status === 'PENDING' || s.status === 'SUBMITTED') && (
                          <ActionBtn label="Falhou" onClick={() => setAction({ type: 'fail', settlementId: s.id })} danger />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && settlements.length === 0 && merchantId && (
        <EmptyState message="Nenhuma liquidação encontrada" />
      )}

      {action?.type === 'submit' && (
        <ConfirmDialog title="Submeter Liquidação" description="A liquidação será submetida ao sistema de pagamentos."
          confirmLabel="Submeter" onConfirm={executeAction} onClose={() => setAction(null)} />
      )}
      {action?.type === 'confirm' && (
        <ConfirmDialog title="Confirmar Liquidação" description="Confirma o registo contabilístico. Esta acção é irreversível."
          confirmLabel="Confirmar" onConfirm={executeAction} onClose={() => setAction(null)} />
      )}
      {action?.type === 'fail' && (
        <ConfirmDialog title="Marcar como Falhada" description="Registe o motivo da falha."
          confirmLabel="Marcar falhada" danger withNotes onConfirm={executeAction} onClose={() => setAction(null)} />
      )}
    </div>
  );
}

function ActionBtn({ label, onClick, danger, success }: { label: string; onClick: () => void; danger?: boolean; success?: boolean }) {
  return (
    <button onClick={onClick}
      className={`h-7 px-sm rounded text-xs font-medium transition-colors ${
        danger   ? 'bg-error-bg text-error hover:bg-red-100' :
        success  ? 'bg-success-bg text-success hover:bg-green-100' :
                   'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}>
      {label}
    </button>
  );
}
