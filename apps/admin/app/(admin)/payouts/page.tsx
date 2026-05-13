'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type Payout } from '@/lib/admin-api';
import { formatMinor } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type ActionType = 'process' | 'sent' | 'confirm' | 'fail' | 'returned';
type Action = { type: ActionType; payoutId: string };

const ACTION_LABELS: Record<ActionType, string> = {
  process:  'Processar',
  sent:     'Marcar Enviado',
  confirm:  'Confirmar',
  fail:     'Falhou',
  returned: 'Devolvido',
};

export default function PayoutsPage() {
  const [merchantId, setMerchantId] = useState('');
  const [payouts, setPayouts]       = useState<Payout[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [action, setAction]         = useState<Action | null>(null);

  async function lookup() {
    const id = merchantId.trim();
    if (!id) return;
    const session = getSession();
    if (!session) return;
    setLoading(true); setError('');
    try {
      const api  = new AdminApi(session.apiUrl, session.adminKey);
      const page = await api.listPayouts(id);
      setPayouts(page.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }

  function updateRow(updated: Payout) {
    setPayouts(prev => prev.map(p => p.id === updated.id ? updated : p));
    setAction(null);
  }

  async function executeAction(notes: string) {
    const session = getSession();
    if (!session || !action) return;
    const api = new AdminApi(session.apiUrl, session.adminKey);
    let updated: Payout;
    switch (action.type) {
      case 'process':  updated = await api.processPayout(action.payoutId); break;
      case 'sent':     updated = await api.markPayoutSent(action.payoutId); break;
      case 'confirm':  updated = await api.confirmPayout(action.payoutId); break;
      case 'fail':     updated = await api.failPayout(action.payoutId, notes); break;
      case 'returned': updated = await api.markPayoutReturned(action.payoutId, notes); break;
    }
    updateRow(updated);
  }

  const needsNotes = action?.type === 'fail' || action?.type === 'returned';
  const isDanger   = action?.type === 'fail' || action?.type === 'returned';

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

      {payouts.length > 0 && (
        <div className="bg-white rounded-lg shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
                  <th className="px-xl py-md">ID</th>
                  <th className="px-xl py-md">Montante</th>
                  <th className="px-xl py-md">Estado</th>
                  <th className="px-xl py-md">Data</th>
                  <th className="px-xl py-md">Acções</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payouts.map(p => (
                  <tr key={p.id} className="hover:bg-gray-100/50">
                    <td className="px-xl py-md font-mono text-xs text-gray-400">{p.id.slice(-12)}</td>
                    <td className="px-xl py-md font-semibold font-mono tabular-nums whitespace-nowrap">
                      {formatMinor(p.amount_minor, p.currency)}
                    </td>
                    <td className="px-xl py-md"><Badge label={p.status} /></td>
                    <td className="px-xl py-md text-xs text-gray-400 whitespace-nowrap">
                      {new Date(p.created_at).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-xl py-md">
                      <div className="flex gap-xs flex-wrap">
                        {p.status === 'PENDING'    && <ActionBtn label="Processar"  onClick={() => setAction({ type: 'process',  payoutId: p.id })} />}
                        {p.status === 'PROCESSING' && <ActionBtn label="Enviado"    onClick={() => setAction({ type: 'sent',     payoutId: p.id })} />}
                        {p.status === 'SENT'       && <ActionBtn label="Confirmar"  onClick={() => setAction({ type: 'confirm',  payoutId: p.id })} success />}
                        {p.status === 'SENT'       && <ActionBtn label="Devolvido"  onClick={() => setAction({ type: 'returned', payoutId: p.id })} danger />}
                        {(p.status === 'PENDING' || p.status === 'PROCESSING') && (
                          <ActionBtn label="Falhou" onClick={() => setAction({ type: 'fail', payoutId: p.id })} danger />
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

      {!loading && payouts.length === 0 && merchantId && (
        <EmptyState message="Nenhum pagamento encontrado" />
      )}

      {action && (
        <ConfirmDialog
          title={ACTION_LABELS[action.type]}
          description={`Esta acção irá actualizar o estado do pagamento.`}
          confirmLabel={ACTION_LABELS[action.type]}
          danger={isDanger}
          withNotes={needsNotes}
          onConfirm={executeAction}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  );
}

function ActionBtn({ label, onClick, danger, success }: { label: string; onClick: () => void; danger?: boolean; success?: boolean }) {
  return (
    <button onClick={onClick}
      className={`h-7 px-sm rounded text-xs font-medium transition-colors ${
        danger  ? 'bg-error-bg text-error hover:bg-red-100' :
        success ? 'bg-success-bg text-success hover:bg-green-100' :
                  'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}>
      {label}
    </button>
  );
}
