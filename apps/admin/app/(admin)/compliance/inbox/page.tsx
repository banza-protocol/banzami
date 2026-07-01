'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Inbox as InboxIcon } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type ComplianceCase } from '@/lib/admin-api';
import { Card, EmptyMsg, ErrorState } from '@/components/ui/table';
import { CaseDrawer, CASE_TYPE_LABEL, STATUS_LABEL, PRIORITY_LABEL, RISK_LABEL } from '@/components/compliance/case-drawer';
import { timeAgo, slaBucket } from '@/lib/format';
import { useAdminEnv } from '@/lib/admin-env';
import { EnvToggle } from '@/components/layout/env-toggle';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

const PAGE_SIZE = 25;

const TYPE_CHIPS = [
  { label: 'Todos', value: '' },
  { label: 'Candidaturas', value: 'MERCHANT_APPLICATION' },
  { label: 'KYB', value: 'KYB_MERCHANT' },
  { label: 'KYC', value: 'KYC_CONSUMER' },
  { label: 'Liquidações', value: 'SETTLEMENT_FAILURE' },
];
const STATUS_OPTS = ['', 'UNASSIGNED', 'ASSIGNED', 'ESCALATED', 'RESOLVED'];
const PRIORITY_OPTS = ['', 'CRITICAL', 'HIGH', 'NORMAL', 'LOW'];

export default function ComplianceInboxPage() {
  const params = useSearchParams();
  const [cases, setCases] = useState<ComplianceCase[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const { env, setEnv, liveAvailable } = useAdminEnv();
  const [caseType, setCaseType] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setCases(null);
    setError('');
    try {
      const r = await api.listComplianceCases({
        environment: env === 'SANDBOX' ? 'SANDBOX' : undefined,
        caseType: caseType || undefined, status: status || undefined, priority: priority || undefined,
        q: search.trim() || undefined, page, pageSize: PAGE_SIZE,
      });
      setCases(r.cases ?? []);
      setTotal(r.total ?? 0);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setError(code === 'UNAVAILABLE' ? `A Inbox em ${env === 'LIVE' ? 'Produção' : 'Sandbox'} não está disponível.` : 'Não foi possível carregar a inbox.');
      setCases([]);
    }
  }, [env, caseType, status, priority, search, page]);

  useEffect(() => { void load(); }, [load]);

  // Notification deep-link (Part M): ?focus=<entity_id> opens the matching case.
  useEffect(() => {
    const focus = params.get('focus');
    if (!focus || !cases) return;
    const hit = cases.find((c) => c.entity_id === focus || c.id === focus);
    if (hit) setSelected(hit.id);
  }, [params, cases]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const api = getApi();

  return (
    <div className="p-[26px]">
      <div className="mb-[22px] flex items-center justify-between border-b border-[#f1e3e3]">
        <h1 className="flex items-center gap-2 pb-[14px] text-[26px] font-extrabold text-[#1a1a1a]"><InboxIcon size={24} className="text-[#B5101F]" /> Compliance Inbox</h1>
        <div className="mb-3">
          <EnvToggle env={env} setEnv={(e) => { const ok = setEnv(e); if (ok) setPage(1); return ok; }} liveAvailable={liveAvailable} />
        </div>
      </div>
      <p className="mb-4 text-[14px] text-[#9a8a8e]">Todos os casos de compliance num só lugar — candidaturas, KYB, KYC e liquidações. Trabalhe por caso, não por módulo.</p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TYPE_CHIPS.map((c) => (
          <button key={c.value || 'all'} onClick={() => { setCaseType(c.value); setPage(1); }} className={`rounded-full px-4 py-2 text-sm font-bold ${caseType === c.value ? 'bg-[#1a1a1a] text-white' : 'border border-[#eaddde] text-[#5a4a4e]'}`}>{c.label}</button>
        ))}
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Procurar nome, @handle, id, email, NIF…" className="ml-auto w-[300px] max-w-full rounded-full border border-[#eaddde] px-4 py-2 text-sm font-semibold text-[#3a2e32] outline-none focus:border-[#B5101F]" />
      </div>
      <div className="mb-[18px] flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[13px] font-bold text-[#5a4a4e]">Estado
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-lg border border-[#eaddde] px-2 py-1 text-[13px] font-semibold">
            {STATUS_OPTS.map((s) => <option key={s} value={s}>{s === '' ? 'Todos' : (STATUS_LABEL[s]?.label ?? s)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[13px] font-bold text-[#5a4a4e]">Prioridade
          <select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} className="rounded-lg border border-[#eaddde] px-2 py-1 text-[13px] font-semibold">
            {PRIORITY_OPTS.map((p) => <option key={p} value={p}>{p === '' ? 'Todas' : (PRIORITY_LABEL[p]?.label ?? p)}</option>)}
          </select>
        </label>
        <span className="ml-auto text-[13px] font-semibold text-[#9a8a8e]">{total} caso{total === 1 ? '' : 's'}</span>
      </div>

      <Card>
        {error ? (
          <ErrorState message={error} />
        ) : cases === null ? (
          <div className="px-6 py-[60px] text-center text-[15px] text-[#9a8a8e]">A carregar…</div>
        ) : cases.length === 0 ? (
          <EmptyMsg title="Inbox vazia." hint="Não há casos para os filtros atuais. Novos casos aparecem automaticamente." />
        ) : (
          <div className="flex flex-col gap-2 p-4">
            {cases.map((c) => {
              const st = STATUS_LABEL[c.status] ?? { label: c.status, cls: 'bg-gray-100 text-gray-500' };
              const resolved = c.status === 'RESOLVED';
              return (
                <button key={c.id} onClick={() => setSelected(c.id)} className="flex w-full flex-wrap items-center gap-3 rounded-lg border border-gray-100 px-4 py-3 text-left transition hover:border-[#B5101F]/40 hover:bg-[#FFF7F6]">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">
                      <span className="rounded bg-[#f3e9e9] px-1.5 py-0.5 text-[10px] font-bold text-[#7a6a6e]">{CASE_TYPE_LABEL[c.case_type] ?? c.case_type}</span>
                      <span className="font-bold text-gray-800">{c.entity_name || 'Caso'}</span>
                      {c.entity_handle && <span className="font-mono text-xs text-[#7a6a6e]">@{c.entity_handle}</span>}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-gray-500">
                      <span className="font-mono text-gray-400">{c.entity_id.slice(0, 8)}…</span>
                      {c.assigned_operator_name ? ` · ${c.assigned_operator_name}` : ' · por atribuir'}
                      {` · ${timeAgo(c.last_activity)}`}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PRIORITY_LABEL[c.priority].cls}`}>{PRIORITY_LABEL[c.priority].label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${RISK_LABEL[c.risk_level].cls}`}>Risco {RISK_LABEL[c.risk_level].label}</span>
                  {!resolved && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${slaBucket(c.age_seconds).cls}`}>{slaBucket(c.age_seconds).label}</span>}
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${st.cls}`}>{st.label}</span>
                  <span className="rounded-lg border border-[#eaddde] px-3 py-1.5 text-sm font-semibold text-[#5a4a4e]">Abrir</span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-[#eaddde] px-3 py-1.5 text-sm font-bold text-[#5a4a4e] disabled:opacity-40">Anterior</button>
          <span className="text-[13px] font-semibold text-[#9a8a8e]">Página {page} de {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-[#eaddde] px-3 py-1.5 text-sm font-bold text-[#5a4a4e] disabled:opacity-40">Seguinte</button>
        </div>
      )}

      {selected && api && (
        <CaseDrawer api={api} caseId={selected} env={env} onClose={() => setSelected(null)} onChanged={() => { void load(); }} />
      )}
    </div>
  );
}
