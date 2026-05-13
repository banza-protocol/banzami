'use client';

import { useState } from 'react';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi } from '@/lib/admin-api';
import { Spinner } from '@/components/ui/spinner';

export default function ReconciliationPage() {
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<Record<string, unknown> | null>(null);
  const [error, setError]       = useState('');

  async function runReconciliation() {
    const session = getSession();
    if (!session) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const api = new AdminApi(session.apiUrl, session.adminKey);
      const r   = await api.runReconciliation();
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-xl">
      <div className="bg-white rounded-lg shadow-card p-xl flex flex-col gap-lg">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Reconciliação Manual</h2>
          <p className="text-xs text-gray-400 mt-xs">
            Executa o job de reconciliação imediatamente, verificando consistência entre
            o ledger e o estado externo das transacções.
          </p>
        </div>

        <div className="bg-warning-bg rounded-lg p-lg">
          <p className="text-xs font-medium text-warning">
            A reconciliação é executada automaticamente em produção. Use esta opção apenas
            para verificações urgentes ou após incidentes.
          </p>
        </div>

        <button
          onClick={runReconciliation}
          disabled={loading}
          className="h-10 px-xl bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-sm self-start"
        >
          {loading ? (
            <><Spinner className="h-4 w-4 text-white" /> A reconciliar…</>
          ) : (
            <><RefreshCw size={15} /> Executar reconciliação</>
          )}
        </button>
      </div>

      {error && (
        <p className="text-sm text-error bg-error-bg rounded-lg px-xl py-lg">{error}</p>
      )}

      {result && (
        <div className="bg-white rounded-lg shadow-card overflow-hidden">
          <div className="flex items-center gap-md px-xl py-lg border-b border-gray-100">
            <CheckCircle2 size={18} className="text-success" />
            <h3 className="text-sm font-semibold text-gray-900">Resultado</h3>
          </div>
          <div className="p-xl">
            <pre className="text-xs font-mono text-gray-700 bg-gray-100 rounded-md p-lg overflow-auto max-h-64">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
