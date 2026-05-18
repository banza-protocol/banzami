'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, ExternalLink, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { AdminApi, type AcquiringReconRun } from '@/lib/admin-api';
import { Spinner } from '@/components/ui/spinner';

function api() {
  const session = getSession();
  if (!session) throw new Error('Not authenticated');
  return new AdminApi(session.apiUrl, session.adminKey);
}

export default function ReconciliationPage() {
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<Record<string, unknown> | null>(null);
  const [error, setError]       = useState('');

  const [latestRun, setLatestRun]       = useState<AcquiringReconRun | null>(null);
  const [runsLoading, setRunsLoading]   = useState(true);

  useEffect(() => {
    api().listAcquiringReconciliationRuns()
      .then(res => {
        const runs = res.data ?? [];
        if (runs.length > 0) setLatestRun(runs[0]);
      })
      .catch(() => {})
      .finally(() => setRunsLoading(false));
  }, []);

  async function runReconciliation() {
    setLoading(true); setError(''); setResult(null);
    try {
      const r = await api().runReconciliation();
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-xl">

      {/* Settlement reconciliation */}
      <div className="bg-white rounded-lg shadow-card p-xl flex flex-col gap-lg">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Reconciliação de Liquidações</h2>
          <p className="text-xs text-gray-400 mt-xs">
            Verifica a consistência entre o ledger e o estado externo das liquidações.
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

      {/* Latest acquiring recon summary */}
      <div className="bg-white rounded-lg shadow-card overflow-hidden">
        <div className="px-xl py-lg border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Última Reconciliação Acquiring</h2>
          <Link href="/risk" className="flex items-center gap-xs text-xs text-gray-400 hover:text-gray-700 transition-colors">
            Ver tudo <ExternalLink size={12} />
          </Link>
        </div>

        {runsLoading && (
          <div className="flex justify-center py-xl">
            <Spinner className="h-5 w-5" />
          </div>
        )}

        {!runsLoading && !latestRun && (
          <p className="text-xs text-gray-400 text-center py-xl">Nenhum run executado ainda.</p>
        )}

        {latestRun && (
          <div className="divide-y divide-gray-100">
            <div className="grid grid-cols-4 divide-x divide-gray-100">
              {[
                { label: 'Data',      value: latestRun.reconciliation_date },
                { label: 'Status',    value: latestRun.status },
                { label: 'Matched',   value: String(latestRun.matched), ok: true },
                { label: 'Issues',    value: String((latestRun.missing_posting ?? 0) + (latestRun.amount_mismatch ?? 0)),
                  warn: (latestRun.missing_posting + latestRun.amount_mismatch) > 0 },
              ].map(s => (
                <div key={s.label} className="px-xl py-lg text-center">
                  <p className="text-xs text-gray-400">{s.label}</p>
                  <p className={`text-sm font-semibold mt-xs ${
                    s.ok ? 'text-success' : s.warn ? 'text-error' : 'text-gray-900'
                  }`}>{s.value}</p>
                </div>
              ))}
            </div>
            {(latestRun.missing_posting > 0 || latestRun.amount_mismatch > 0) && (
              <div className="px-xl py-lg flex items-center gap-sm">
                <AlertTriangle size={14} className="text-warning" />
                <p className="text-xs text-gray-600">
                  Existem discrepâncias. <Link href="/risk" className="text-gray-900 font-medium hover:underline">Ver detalhes →</Link>
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
