'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert, Snowflake, Flag, BookOpen, RefreshCw,
  Play, ChevronRight, CheckCircle2, AlertTriangle, Check, X,
} from 'lucide-react';
import { getSession } from '@/lib/session';
import {
  AdminApi,
  type RiskFlag,
  type AuditEntry,
  type AcquiringReconRun,
} from '@/lib/admin-api';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

type Tab = 'freezes' | 'flags' | 'audit' | 'acquiring';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SeverityBadge({ s }: { s: RiskFlag['severity'] }) {
  const cls = {
    LOW:      'bg-gray-100 text-gray-600',
    MEDIUM:   'bg-yellow-50 text-yellow-700',
    HIGH:     'bg-orange-50 text-orange-700',
    CRITICAL: 'bg-red-50 text-red-700 font-semibold',
  }[s] ?? 'bg-gray-100 text-gray-600';
  return <span className={`text-xs px-sm py-xs rounded-md ${cls}`}>{s}</span>;
}

function StatusBadge({ s }: { s: AcquiringReconRun['status'] }) {
  const cls = {
    RUNNING:   'bg-blue-50 text-blue-700',
    COMPLETED: 'bg-green-50 text-green-700',
    FAILED:    'bg-red-50 text-red-700',
  }[s] ?? 'bg-gray-100 text-gray-600';
  return <span className={`text-xs px-sm py-xs rounded-md font-medium ${cls}`}>{s}</span>;
}

function fmt(dt: string) {
  return new Date(dt).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' });
}

function api() {
  const session = getSession();
  if (!session) throw new Error('Not authenticated');
  return new AdminApi(session.apiUrl, session.adminKey);
}

// ---------------------------------------------------------------------------
// Tab: Freezes
// ---------------------------------------------------------------------------

function FreezesTab() {
  const [entityType, setEntityType] = useState<'MERCHANT' | 'CONSUMER'>('MERCHANT');
  const [entityId, setEntityId]     = useState('');
  const [reason, setReason]         = useState('');
  const [action, setAction]         = useState<'freeze' | 'unfreeze'>('freeze');
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<Record<string, unknown> | null>(null);
  const [error, setError]           = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(''); setResult(null);
    try {
      const a = api();
      const r = action === 'freeze'
        ? await a.freezeAccount(entityType, entityId.trim(), reason.trim())
        : await a.unfreezeAccount(entityType, entityId.trim(), reason.trim());
      setResult(r);
      setEntityId(''); setReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-xl">
      <div className="bg-white rounded-lg shadow-card p-xl flex flex-col gap-lg">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-sm">
            <Snowflake size={15} className="text-blue-500" /> Congelar / Descongelar Conta
          </h3>
          <p className="text-xs text-gray-400 mt-xs">
            Congela ou descongela transacções de um comerciante ou consumidor imediatamente.
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-md">
          {/* Action toggle */}
          <div className="flex gap-sm">
            {(['freeze', 'unfreeze'] as const).map(a => (
              <button key={a} type="button"
                onClick={() => setAction(a)}
                className={`px-lg py-sm text-xs font-medium rounded-md transition-colors ${
                  action === a
                    ? a === 'freeze' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {a === 'freeze' ? 'Congelar' : 'Descongelar'}
              </button>
            ))}
          </div>

          <div className="flex gap-md">
            <div className="flex flex-col gap-xs flex-1">
              <label className="text-xs font-medium text-gray-700">Tipo de entidade</label>
              <select
                value={entityType}
                onChange={e => setEntityType(e.target.value as 'MERCHANT' | 'CONSUMER')}
                className="h-9 bg-white border border-gray-200 rounded-md px-md text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20"
              >
                <option value="MERCHANT">MERCHANT</option>
                <option value="CONSUMER">CONSUMER</option>
              </select>
            </div>

            <div className="flex flex-col gap-xs flex-[2]">
              <label className="text-xs font-medium text-gray-700">ID da entidade</label>
              <input
                value={entityId}
                onChange={e => setEntityId(e.target.value)}
                placeholder="UUID do comerciante ou consumidor"
                required
                className="h-9 bg-white border border-gray-200 rounded-md px-md text-sm text-gray-900 font-mono outline-none focus:ring-2 focus:ring-gray-900/20"
              />
            </div>
          </div>

          <div className="flex flex-col gap-xs">
            <label className="text-xs font-medium text-gray-700">Motivo (obrigatório)</label>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Motivo da acção…"
              required
              className="h-9 bg-white border border-gray-200 rounded-md px-md text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20"
            />
          </div>

          {error && <p className="text-xs text-error bg-error-bg rounded-md px-lg py-sm">{error}</p>}

          <button type="submit" disabled={loading || !entityId.trim() || !reason.trim()}
            className={`h-9 px-xl text-white rounded-md text-sm font-medium disabled:opacity-60 transition-colors flex items-center gap-sm self-start ${
              action === 'freeze' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'
            }`}>
            {loading ? <Spinner className="h-4 w-4 text-white" /> : <Snowflake size={14} />}
            {action === 'freeze' ? 'Congelar conta' : 'Descongelar conta'}
          </button>
        </form>
      </div>

      {result && (
        <div className="bg-white rounded-lg shadow-card overflow-hidden">
          <div className="flex items-center gap-md px-xl py-lg border-b border-gray-100">
            <CheckCircle2 size={16} className="text-success" />
            <span className="text-sm font-semibold text-gray-900">Acção concluída</span>
          </div>
          <div className="p-xl">
            <pre className="text-xs font-mono text-gray-700 bg-gray-50 rounded-md p-lg overflow-auto max-h-48">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Risk Flags
// ---------------------------------------------------------------------------

function FlagsTab() {
  const [flags, setFlags]         = useState<RiskFlag[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async (resolved: boolean) => {
    setLoading(true); setError('');
    try {
      const res = await api().listRiskFlags(resolved);
      setFlags(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(showResolved); }, [load, showResolved]);

  async function resolve(id: string, resolution: 'APPROVED' | 'REJECTED') {
    setResolving(id); setError('');
    try {
      await api().resolveRiskFlag(id, resolution, 'ADMIN');
      // Drop it from the active list immediately.
      setFlags(prev => prev.filter(f => f.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao resolver.');
    } finally {
      setResolving(null);
    }
  }

  function resolutionTime(secs?: number | null): string {
    if (secs == null) return '—';
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.round(secs / 60)}m`;
    if (secs < 86400) return `${Math.round(secs / 3600)}h`;
    return `${Math.round(secs / 86400)}d`;
  }

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex items-center justify-between">
        <div className="flex gap-sm">
          {[false, true].map(r => (
            <button key={String(r)} type="button"
              onClick={() => setShowResolved(r)}
              className={`px-lg py-sm text-xs font-medium rounded-md transition-colors ${
                showResolved === r ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {r ? 'Resolvidos' : 'Activos'}
            </button>
          ))}
        </div>
        <button onClick={() => load(showResolved)} disabled={loading}
          className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin text-gray-400' : 'text-gray-400'} />
        </button>
      </div>

      {error && <p className="text-sm text-error bg-error-bg rounded-lg px-xl py-lg">{error}</p>}

      {loading && <div className="flex justify-center py-xl"><Spinner className="h-6 w-6" /></div>}

      {!loading && flags.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-xl">Nenhum flag de risco encontrado.</p>
      )}

      {flags.length > 0 && (
        <div className="bg-white rounded-lg shadow-card overflow-hidden divide-y divide-gray-100">
          {flags.map(f => (
            <div key={f.id} className="px-xl py-lg">
              <div className="flex items-start justify-between gap-md">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-sm flex-wrap">
                    <span className="text-xs font-semibold text-gray-900">{f.flag_type}</span>
                    <SeverityBadge s={f.severity} />
                    <Badge label={f.entity_type} />
                    {f.resolution && (
                      <span className={`text-xs px-sm py-xs rounded-md font-medium ${
                        f.resolution === 'APPROVED' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {f.resolution === 'APPROVED' ? 'Aprovado' : 'Rejeitado'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-xs">{f.description}</p>
                  <p className="text-xs font-mono text-gray-400 mt-xs">{f.entity_id}</p>
                  {f.resolved && (
                    <p className="text-xs text-gray-400 mt-xs">
                      Resolvido por <strong className="text-gray-600">{f.resolved_by ?? '—'}</strong>
                      {' · '}tempo de resolução <strong className="text-gray-600">{resolutionTime(f.resolution_seconds)}</strong>
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-sm shrink-0">
                  <span className="text-xs text-gray-400 whitespace-nowrap">{fmt(f.created_at)}</span>
                  {!f.resolved && (
                    <div className="flex gap-sm">
                      <button onClick={() => resolve(f.id, 'APPROVED')} disabled={resolving === f.id}
                        className="h-7 px-md flex items-center gap-xs text-xs font-medium rounded-md bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-60 transition-colors">
                        <Check size={13} /> Aprovar
                      </button>
                      <button onClick={() => resolve(f.id, 'REJECTED')} disabled={resolving === f.id}
                        className="h-7 px-md flex items-center gap-xs text-xs font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60 transition-colors">
                        <X size={13} /> Rejeitar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Audit Log
// ---------------------------------------------------------------------------

function AuditTab() {
  const [entries, setEntries]   = useState<AuditEntry[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [subject, setSubject]   = useState('');
  const [actor, setActor]       = useState('');
  const [action, setAction]     = useState('');
  const [limit, setLimit]       = useState(50);
  const [detail, setDetail]     = useState<AuditEntry | null>(null);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await api().queryAuditLog({
        subject: subject.trim() || undefined,
        actor:   actor.trim()   || undefined,
        action:  action.trim()  || undefined,
        limit,
      });
      setEntries(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-xl">
      {detail ? (
        <>
          <button onClick={() => setDetail(null)}
            className="flex items-center gap-sm text-sm text-gray-400 hover:text-gray-900 transition-colors self-start">
            ← Voltar
          </button>
          <div className="bg-white rounded-lg shadow-card overflow-hidden">
            <div className="px-xl py-lg border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">{detail.action}</p>
              <p className="text-xs font-mono text-gray-400 mt-xs">{detail.id}</p>
            </div>
            <div className="divide-y divide-gray-100">
              <Row label="Actor"   value={detail.actor} />
              <Row label="Subject" value={detail.subject} />
              <Row label="Data"    value={fmt(detail.created_at)} />
              {detail.request_id && <Row label="Request ID" value={detail.request_id} />}
            </div>
            {Object.keys(detail.metadata).length > 0 && (
              <div className="p-xl border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-sm">Metadata</p>
                <pre className="text-xs font-mono text-gray-700 bg-gray-50 rounded-md p-lg overflow-auto max-h-64">
                  {JSON.stringify(detail.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <form onSubmit={search} className="bg-white rounded-lg shadow-card p-xl flex flex-col gap-md">
            <div className="grid grid-cols-3 gap-md">
              <div className="flex flex-col gap-xs">
                <label className="text-xs font-medium text-gray-700">Subject</label>
                <input value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder="merchant:uuid ou wallet:uuid"
                  className="h-8 text-xs bg-white border border-gray-200 rounded-md px-md font-mono text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20" />
              </div>
              <div className="flex flex-col gap-xs">
                <label className="text-xs font-medium text-gray-700">Actor</label>
                <input value={actor} onChange={e => setActor(e.target.value)}
                  placeholder="ADMIN ou system"
                  className="h-8 text-xs bg-white border border-gray-200 rounded-md px-md text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20" />
              </div>
              <div className="flex flex-col gap-xs">
                <label className="text-xs font-medium text-gray-700">Action</label>
                <input value={action} onChange={e => setAction(e.target.value)}
                  placeholder="PAYMENT_SETTLED, ACCOUNT_FROZEN…"
                  className="h-8 text-xs bg-white border border-gray-200 rounded-md px-md text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20" />
              </div>
            </div>
            <div className="flex items-center gap-md">
              <div className="flex flex-col gap-xs">
                <label className="text-xs font-medium text-gray-700">Limite</label>
                <select value={limit} onChange={e => setLimit(Number(e.target.value))}
                  className="h-8 text-xs bg-white border border-gray-200 rounded-md px-md text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20">
                  {[25, 50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <button type="submit" disabled={loading}
                className="mt-md h-8 px-xl bg-gray-900 text-white rounded-md text-xs font-medium hover:bg-gray-700 disabled:opacity-60 transition-colors flex items-center gap-sm">
                {loading ? <Spinner className="h-3 w-3 text-white" /> : <BookOpen size={13} />}
                Pesquisar
              </button>
            </div>
          </form>

          {error && <p className="text-sm text-error bg-error-bg rounded-lg px-xl py-lg">{error}</p>}

          {!loading && entries.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-xl">Nenhuma entrada encontrada.</p>
          )}

          {entries.length > 0 && (
            <div className="bg-white rounded-lg shadow-card overflow-hidden divide-y divide-gray-100">
              {entries.map(e => (
                <button key={e.id} onClick={() => setDetail(e)}
                  className="w-full flex items-center justify-between px-xl py-lg hover:bg-gray-50 transition-colors text-left">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-md">
                      <span className="text-xs font-semibold text-gray-900">{e.action}</span>
                      <span className="text-xs text-gray-400">{e.actor}</span>
                    </div>
                    <p className="text-xs font-mono text-gray-400 truncate mt-xs">{e.subject}</p>
                  </div>
                  <div className="flex items-center gap-md shrink-0">
                    <span className="text-xs text-gray-400">{fmt(e.created_at)}</span>
                    <ChevronRight size={14} className="text-gray-300" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Acquiring Reconciliation
// ---------------------------------------------------------------------------

function AcquiringTab() {
  const [runs, setRuns]       = useState<AcquiringReconRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState('');
  const [runError, setRunError] = useState('');
  const [date, setDate]       = useState('');
  const [detail, setDetail]   = useState<AcquiringReconRun | null>(null);

  const loadRuns = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await api().listAcquiringReconciliationRuns();
      setRuns(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  async function triggerRun() {
    setRunning(true); setRunError('');
    try {
      const run = await api().runAcquiringReconciliation(date.trim() || undefined);
      setRuns(prev => [run, ...prev]);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Erro ao executar.');
    } finally {
      setRunning(false);
    }
  }

  if (detail) {
    const matched   = detail.matched ?? 0;
    const missing   = detail.missing_posting ?? 0;
    const mismatch  = detail.amount_mismatch ?? 0;
    const total     = detail.total_callbacks ?? 0;

    return (
      <div className="flex flex-col gap-xl">
        <button onClick={() => setDetail(null)}
          className="flex items-center gap-sm text-sm text-gray-400 hover:text-gray-900 transition-colors self-start">
          ← Voltar à lista
        </button>

        <div className="bg-white rounded-lg shadow-card overflow-hidden">
          <div className="px-xl py-lg border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Run: {detail.reconciliation_date}</p>
              <p className="text-xs font-mono text-gray-400 mt-xs">{detail.id}</p>
            </div>
            <StatusBadge s={detail.status} />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100">
            {[
              { label: 'Total', value: total },
              { label: 'Matched', value: matched, ok: true },
              { label: 'Missing', value: missing, warn: missing > 0 },
              { label: 'Mismatch', value: mismatch, warn: mismatch > 0 },
            ].map(s => (
              <div key={s.label} className="px-xl py-lg text-center">
                <p className="text-xs text-gray-400">{s.label}</p>
                <p className={`text-xl font-bold mt-xs ${
                  s.ok ? 'text-success' : s.warn ? 'text-error' : 'text-gray-900'
                }`}>{s.value}</p>
              </div>
            ))}
          </div>

          {detail.total_discrepancy_minor !== undefined && detail.total_discrepancy_minor !== 0 && (
            <div className="px-xl py-lg border-b border-gray-100 flex items-center gap-sm">
              <AlertTriangle size={14} className="text-warning" />
              <p className="text-xs text-gray-700">
                Discrepância total: <strong>{(detail.total_discrepancy_minor / 100).toFixed(2)} AOA</strong>
              </p>
            </div>
          )}

          {/* Items */}
          {detail.items && detail.items.length > 0 && (
            <div className="divide-y divide-gray-100">
              <div className="px-xl py-md bg-gray-50 grid grid-cols-4 gap-md text-xs font-medium text-gray-500 uppercase tracking-wide">
                <span>Callback ID</span><span>Status</span><span>CB Amount</span><span>Ledger Amount</span>
              </div>
              {detail.items.map(item => (
                <div key={item.id} className="px-xl py-md grid grid-cols-4 gap-md items-center">
                  <span className="text-xs font-mono text-gray-400 truncate">{item.callback_id.slice(0, 8)}…</span>
                  <span className={`text-xs font-medium ${
                    item.status === 'MATCHED' ? 'text-success' : 'text-error'
                  }`}>{item.status}</span>
                  <span className="text-xs text-gray-700">
                    {item.callback_amount_minor != null ? (item.callback_amount_minor / 100).toFixed(2) : '—'}
                  </span>
                  <span className="text-xs text-gray-700">
                    {item.ledger_amount_minor != null ? (item.ledger_amount_minor / 100).toFixed(2) : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-xl">
      {/* Trigger */}
      <div className="bg-white rounded-lg shadow-card p-xl flex flex-col gap-lg">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-sm">
            <Play size={14} className="text-gray-400" /> Executar Reconciliação Acquiring
          </h3>
          <p className="text-xs text-gray-400 mt-xs">
            Compara os callbacks EMIS processados com as entradas do ledger para a data seleccionada.
          </p>
        </div>
        <div className="flex items-end gap-md">
          <div className="flex flex-col gap-xs">
            <label className="text-xs font-medium text-gray-700">Data (opcional, padrão: ontem)</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="h-9 bg-white border border-gray-200 rounded-md px-md text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/20" />
          </div>
          <button onClick={triggerRun} disabled={running}
            className="h-9 px-xl bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-700 disabled:opacity-60 transition-colors flex items-center gap-sm">
            {running ? <Spinner className="h-4 w-4 text-white" /> : <Play size={14} />}
            Executar
          </button>
        </div>
        {runError && <p className="text-xs text-error bg-error-bg rounded-md px-lg py-sm">{runError}</p>}
      </div>

      {/* History */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Histórico de runs</h3>
        <button onClick={loadRuns} disabled={loading}
          className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin text-gray-400' : 'text-gray-400'} />
        </button>
      </div>

      {error && <p className="text-sm text-error bg-error-bg rounded-lg px-xl py-lg">{error}</p>}
      {loading && <div className="flex justify-center py-xl"><Spinner className="h-6 w-6" /></div>}

      {!loading && runs.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-xl">Nenhum run executado ainda.</p>
      )}

      {runs.length > 0 && (
        <div className="bg-white rounded-lg shadow-card overflow-hidden divide-y divide-gray-100">
          {runs.map(run => (
            <button key={run.id} onClick={async () => {
              try {
                const full = await api().getAcquiringReconciliationRun(run.id);
                setDetail(full);
              } catch { setDetail(run); }
            }}
              className="w-full flex items-center justify-between px-xl py-lg hover:bg-gray-50 transition-colors text-left">
              <div>
                <div className="flex items-center gap-md">
                  <p className="text-sm font-medium text-gray-900">{run.reconciliation_date}</p>
                  <StatusBadge s={run.status} />
                </div>
                <div className="flex items-center gap-xl mt-xs">
                  <span className="text-xs text-gray-400">
                    Total: <strong className="text-gray-600">{run.total_callbacks}</strong>
                  </span>
                  <span className="text-xs text-success">
                    Matched: <strong>{run.matched}</strong>
                  </span>
                  {run.missing_posting > 0 && (
                    <span className="text-xs text-error">
                      Missing: <strong>{run.missing_posting}</strong>
                    </span>
                  )}
                  {run.amount_mismatch > 0 && (
                    <span className="text-xs text-error">
                      Mismatch: <strong>{run.amount_mismatch}</strong>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-md shrink-0">
                <span className="text-xs text-gray-400">{fmt(run.started_at)}</span>
                <ChevronRight size={14} className="text-gray-300" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'freezes',   label: 'Congelamentos',   icon: Snowflake    },
  { id: 'flags',     label: 'Risk Flags',       icon: Flag         },
  { id: 'audit',     label: 'Audit Log',        icon: BookOpen     },
  { id: 'acquiring', label: 'Reconciliação Acq.',icon: RefreshCw   },
];

export default function RiskPage() {
  const [tab, setTab] = useState<Tab>('flags');

  return (
    <div className="flex flex-col gap-xl">
      {/* Header */}
      <div className="flex items-center gap-md">
        <ShieldAlert size={20} className="text-gray-400" />
        <div>
          <h1 className="text-base font-semibold text-gray-900">Risco &amp; Auditoria</h1>
          <p className="text-xs text-gray-400">Gestão de risco, flags, audit log e reconciliação acquiring</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-sm border-b border-gray-100 pb-micro -mb-micro">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-xs px-lg py-sm text-sm font-medium rounded-t-md border-b-2 transition-colors ${
              tab === id
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'freezes'   && <FreezesTab />}
      {tab === 'flags'     && <FlagsTab />}
      {tab === 'audit'     && <AuditTab />}
      {tab === 'acquiring' && <AcquiringTab />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-xl py-md gap-md">
      <span className="text-sm text-gray-400 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 font-mono text-right break-all">{value}</span>
    </div>
  );
}
