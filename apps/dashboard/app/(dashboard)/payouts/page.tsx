'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { getSession } from '@/lib/session';
import { BanzamiApi, type Payout } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';

export default function PayoutsPage() {
  const [rows, setRows]             = useState<Payout[]>([]);
  const [cursor, setCursor]         = useState<string | undefined>();
  const [hasMore, setHasMore]       = useState(false);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [showModal, setShowModal]   = useState(false);

  const load = useCallback(async (nextCursor?: string) => {
    const session = getSession();
    if (!session) return;
    const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
    setLoading(true);
    try {
      const page = await api.listPayouts({ limit: 25, cursor: nextCursor });
      setRows(prev => nextCursor ? [...prev, ...page.data] : page.data);
      setCursor(page.next_cursor);
      setHasMore(!!page.next_cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-lg max-w-4xl mx-auto">
      {/* Header actions */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-sm h-9 px-lg bg-banzami text-white rounded-md text-sm font-medium hover:bg-banzami-dark transition-colors"
        >
          <Plus size={16} />
          Novo pagamento
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-card overflow-hidden">
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
              {rows.map(p => (
                <tr key={p.id} className="hover:bg-gray-100/50 transition-colors">
                  <td className="px-xl py-md font-mono text-xs text-gray-400">{p.id.slice(-12)}</td>
                  <td className="px-xl py-md font-semibold text-gray-900 font-mono tabular-nums whitespace-nowrap">
                    {formatMinor(p.amount_minor, p.currency)}
                  </td>
                  <td className="px-xl py-md"><Badge label={p.status} /></td>
                  <td className="px-xl py-md text-gray-400 whitespace-nowrap">
                    {new Date(p.created_at).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && <div className="flex justify-center py-xl"><Spinner className="h-5 w-5" /></div>}
        {!loading && rows.length === 0 && <EmptyState message="Nenhum pagamento ainda" />}
        {error && <p className="px-xl py-lg text-sm text-error">{error}</p>}

        {hasMore && !loading && (
          <div className="border-t border-gray-100 px-xl py-md">
            <button onClick={() => load(cursor)} className="text-sm font-medium text-banzami hover:underline">
              Carregar mais
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <CreatePayoutModal
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}

function CreatePayoutModal({
  onClose,
  onCreated,
}: {
  onClose:   () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    amount:            '',
    bankAccountNumber: '',
    bankCode:          '',
    accountHolderName: '',
  });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));
  }

  function fillTestData() {
    setForm(prev => ({
      ...prev,
      accountHolderName: 'Loja Teste',
      bankAccountNumber: '0040 0000 0000 0001 010 10',
      bankCode:          'BAIAOLUAXXX',
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const session = getSession();
    if (!session?.walletId) {
      setError('ID de carteira não configurado na sessão.');
      return;
    }
    // Kwanzas in, minor units out. This took the typed number as minor units,
    // so a 50 000 Kz withdrawal was requested as 500 Kz — a hundredth of what
    // the Business asked for (A7-62). The surface is not deployed; the
    // arithmetic is corrected so it cannot ship wrong.
    const amountMinor = Math.round(parseFloat(form.amount) * 100);
    if (!amountMinor || amountMinor <= 0) {
      setError('Introduza um montante válido.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const api = new BanzamiApi(session.gatewayUrl, session.apiKey);
      await api.createPayout({
        walletId:          session.walletId,
        amountMinor,
        bankAccountNumber: form.bankAccountNumber,
        bankCode:          form.bankCode,
        accountHolderName: form.accountHolderName,
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'h-10 bg-gray-100 rounded-md px-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-banzami/30 focus:bg-white transition-colors';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-xl">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-sm p-xl">
        <div className="flex items-center justify-between mb-xl">
          <h2 className="text-base font-semibold text-gray-900">Novo Pagamento</h2>
          <div className="flex items-center gap-md">
            <button
              type="button"
              onClick={fillTestData}
              className="text-xs font-medium text-banzami hover:text-banzami-dark underline underline-offset-2 transition-colors"
            >
              Usar dados de teste
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
              <X size={18} />
            </button>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-lg">
          <Field label="Montante (Kz)">
            <input type="number" min="1" step="1" value={form.amount}
              onChange={set('amount')} className={inputCls} placeholder="ex: 50000" required />
          </Field>
          <Field label="Titular da conta">
            <input type="text" value={form.accountHolderName}
              onChange={set('accountHolderName')} className={inputCls} placeholder="Nome completo" required />
          </Field>
          <Field label="Número de conta bancária">
            <input type="text" value={form.bankAccountNumber}
              onChange={set('bankAccountNumber')} className={inputCls} placeholder="ex: 0040 0000 0000 0000 101 0" required />
          </Field>
          <Field label="Código do banco (BIC/SWIFT)">
            <input type="text" value={form.bankCode}
              onChange={set('bankCode')} className={inputCls} placeholder="ex: BAIAAOLU" required />
          </Field>

          {error && (
            <p className="text-sm text-error bg-error-bg rounded-md px-md py-sm">{error}</p>
          )}

          <div className="flex gap-md">
            <button type="button" onClick={onClose}
              className="flex-1 h-10 border border-gray-100 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-10 bg-banzami text-white rounded-md text-sm font-medium hover:bg-banzami-dark disabled:opacity-60 transition-colors">
              {loading ? 'A processar…' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-xs">
      <label className="text-xs font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}
