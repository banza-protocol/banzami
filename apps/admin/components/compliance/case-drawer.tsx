'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { X, AlertTriangle, ExternalLink, Send } from 'lucide-react';
import { AdminApi, type ComplianceCase, type ComplianceNote } from '@/lib/admin-api';
import { useToast } from '@/components/ui/toast';
import { formatDate, timeAgo, slaBucket } from '@/lib/format';

type Env = 'LIVE' | 'SANDBOX';

export const CASE_TYPE_LABEL: Record<string, string> = {
  MERCHANT_APPLICATION: 'Candidatura Business',
  KYB_MERCHANT: 'KYB Comerciante',
  KYC_CONSUMER: 'KYC Consumidor',
  DISPUTE: 'Disputa',
  SETTLEMENT_FAILURE: 'Liquidação falhada',
  MANUAL_REVIEW: 'Revisão manual',
  FRAUD_REVIEW: 'Revisão de fraude',
  RISK_ALERT: 'Alerta de risco',
  AML_REVIEW: 'Revisão AML',
};

export const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  UNASSIGNED: { label: 'Por atribuir', cls: 'bg-gray-100 text-gray-600' },
  ASSIGNED: { label: 'Atribuído', cls: 'bg-blue-50 text-blue-700' },
  ESCALATED: { label: 'Escalado', cls: 'bg-orange-50 text-orange-700' },
  RESOLVED: { label: 'Resolvido', cls: 'bg-green-50 text-green-700' },
};
export const PRIORITY_LABEL: Record<string, { label: string; cls: string }> = {
  LOW: { label: 'Baixa', cls: 'bg-gray-100 text-gray-500' },
  NORMAL: { label: 'Normal', cls: 'bg-blue-50 text-blue-700' },
  HIGH: { label: 'Alta', cls: 'bg-amber-50 text-amber-700' },
  CRITICAL: { label: 'Crítica', cls: 'bg-red-50 text-red-700' },
};
export const RISK_LABEL: Record<string, { label: string; cls: string }> = {
  LOW: { label: 'Baixo', cls: 'bg-gray-100 text-gray-500' },
  MEDIUM: { label: 'Médio', cls: 'bg-amber-50 text-amber-700' },
  HIGH: { label: 'Alto', cls: 'bg-orange-50 text-orange-700' },
  CRITICAL: { label: 'Crítico', cls: 'bg-red-50 text-red-700' },
};

// Deep-link to the full module review for a case type (docs/timeline/decisions).
function moduleHref(c: ComplianceCase): { href: string; label: string } | null {
  switch (c.case_type) {
    case 'KYB_MERCHANT': return { href: '/merchant-kyb', label: 'Abrir revisão KYB completa' };
    case 'KYC_CONSUMER': return { href: '/consumer-kyc', label: 'Abrir revisão KYC completa' };
    case 'MERCHANT_APPLICATION': return { href: `/merchants/${c.entity_id}`, label: 'Abrir candidatura' };
    case 'SETTLEMENT_FAILURE': return { href: '/application-settlements', label: 'Abrir liquidações' };
    default: return null;
  }
}

function envParam(e: Env): 'SANDBOX' | undefined {
  return e === 'SANDBOX' ? 'SANDBOX' : undefined;
}

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  const v = (value ?? '').toString().trim();
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-[#9a8a8e]">{label}</span>
      <span className={`text-[13.5px] font-semibold text-[#2a2024] ${mono ? 'font-mono break-all' : ''}`}>{v || '—'}</span>
    </div>
  );
}

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;
const RISKS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export function CaseDrawer({
  api, caseId, env, onClose, onChanged,
}: {
  api: AdminApi;
  caseId: string;
  env: Env;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [c, setC] = useState<ComplianceCase | null>(null);
  const [notes, setNotes] = useState<ComplianceNote[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadErr(false);
    try {
      const [cc, nn] = await Promise.all([
        api.getComplianceCase(caseId, envParam(env)),
        api.listCaseNotes(caseId, envParam(env)),
      ]);
      setC(cc);
      setNotes(nn.notes ?? []);
    } catch {
      setLoadErr(true);
      setNotes([]);
    }
  }, [api, caseId, env]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function act(fn: () => Promise<void>, okMsg: string) {
    setBusy(true);
    try {
      await fn();
      toast('success', okMsg);
      await load();
      onChanged();
    } catch {
      toast('danger', 'Não foi possível concluir a ação.');
    } finally {
      setBusy(false);
    }
  }

  async function submitNote(e: React.FormEvent) {
    e.preventDefault();
    const body = noteBody.trim();
    if (!body) return;
    setBusy(true);
    try {
      await api.addCaseNote(caseId, body, envParam(env));
      setNoteBody('');
      const nn = await api.listCaseNotes(caseId, envParam(env));
      setNotes(nn.notes ?? []);
      onChanged();
    } catch {
      toast('danger', 'Não foi possível adicionar a nota.');
    } finally {
      setBusy(false);
    }
  }

  const st = c ? STATUS_LABEL[c.status] : null;
  const link = c ? moduleHref(c) : null;
  const resolved = c?.status === 'RESOLVED';

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-[600px] flex-col bg-white shadow-[0_0_80px_-20px_rgba(0,0,0,0.5)]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Caso de compliance">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[17px] font-black text-[#1a1a1a]">{c?.entity_name || 'Caso'}</h2>
              {c?.entity_handle && <span className="font-mono text-xs text-[#7a6a6e]">@{c.entity_handle}</span>}
              {c && <span className="rounded-md bg-[#f3e9e9] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#7a6a6e]">{c.environment}</span>}
            </div>
            {c && <div className="mt-1 text-[12.5px] font-bold text-[#B5101F]">{CASE_TYPE_LABEL[c.case_type] ?? c.case_type}</div>}
          </div>
          <button onClick={onClose} aria-label="Fechar" className="flex-none text-[#9a8a8e] hover:text-[#2a2024]"><X size={22} strokeWidth={1.8} /></button>
        </div>

        <div className="flex-1 overflow-y-auto pb-6">
          {loadErr ? (
            <div className="mx-5 mt-3 rounded-lg bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">Não foi possível carregar o caso.</div>
          ) : !c ? (
            <div className="space-y-4 px-5 py-4">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded bg-[#f3e9e9]" />)}</div>
          ) : (
            <>
              {/* Resumo */}
              <div className="border-t border-[#f1e3e3] px-5 py-4">
                <h3 className="mb-3 text-[12px] font-extrabold uppercase tracking-wide text-[#7a6a6e]">Resumo</h3>
                <div className="mb-3 flex flex-wrap gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${st?.cls}`}>{st?.label}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${PRIORITY_LABEL[c.priority].cls}`}>Prioridade {PRIORITY_LABEL[c.priority].label}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${RISK_LABEL[c.risk_level].cls}`}>Risco {RISK_LABEL[c.risk_level].label}</span>
                  {!resolved && <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${slaBucket(c.age_seconds).cls}`}>SLA {slaBucket(c.age_seconds).label}</span>}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field label="Tipo" value={CASE_TYPE_LABEL[c.case_type] ?? c.case_type} />
                  <Field label="Ambiente" value={c.environment} />
                  <Field label="Operador responsável" value={c.assigned_operator_name || 'Por atribuir'} />
                  <Field label="Criado" value={formatDate(c.created_at)} />
                  <Field label="Última atividade" value={timeAgo(c.last_activity)} />
                  {c.resolved_at && <Field label="Resolvido" value={formatDate(c.resolved_at)} />}
                </div>
              </div>

              {/* Dados */}
              <div className="border-t border-[#f1e3e3] px-5 py-4">
                <h3 className="mb-3 text-[12px] font-extrabold uppercase tracking-wide text-[#7a6a6e]">Dados</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field label="Nome" value={c.entity_name} />
                  <Field label="Handle" value={c.entity_handle ? `@${c.entity_handle}` : ''} />
                  <Field label={`${c.entity_type} id`} value={c.entity_id} mono />
                  {c.metadata?.email != null && <Field label="Email" value={String(c.metadata.email)} />}
                  {c.metadata?.phone != null && <Field label="Telefone" value={String(c.metadata.phone)} />}
                  {c.metadata?.nif != null && <Field label="NIF" value={String(c.metadata.nif)} mono />}
                  {c.metadata?.country != null && <Field label="País" value={String(c.metadata.country)} />}
                  {c.metadata?.pending_documents != null && <Field label="Documentos pendentes" value={String(c.metadata.pending_documents)} />}
                  {c.metadata?.currency != null && <Field label="Moeda" value={String(c.metadata.currency)} />}
                </div>
                {link && (
                  <Link href={link.href} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[#eaddde] px-3 py-2 text-[13px] font-bold text-[#B5101F] hover:bg-[#FFF7F6]">
                    <ExternalLink size={15} /> {link.label}
                  </Link>
                )}
              </div>

              {/* Notas internas */}
              <div className="border-t border-[#f1e3e3] px-5 py-4">
                <h3 className="mb-3 text-[12px] font-extrabold uppercase tracking-wide text-[#7a6a6e]">Notas internas</h3>
                <p className="mb-3 text-[12px] font-semibold text-[#9a8a8e]">Comentários entre operadores — nunca enviados ao cliente.</p>
                {notes === null ? (
                  <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-[#f3e9e9]" />)}</div>
                ) : notes.length === 0 ? (
                  <p className="text-[13px] font-semibold text-[#9a8a8e]">Sem notas ainda.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {notes.map((n) => (
                      <li key={n.id} className="rounded-lg border border-gray-100 px-3.5 py-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[12.5px] font-extrabold text-[#2a2024]">{n.author_name || 'Operador'}</span>
                          <span className="text-[11px] font-semibold text-[#9a8a8e]">{timeAgo(n.created_at)}</span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-[13px] font-medium text-[#3a2e32]">{n.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <form onSubmit={submitNote} className="mt-3 flex items-start gap-2">
                  <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={2} placeholder="Adicionar nota interna…" className="flex-1 resize-y rounded-[12px] border-[1.5px] border-[#f1e3e3] bg-[#FFF7F6] px-3 py-2 text-[13.5px] font-semibold text-[#2a2024] outline-none focus:border-[#B5101F]" />
                  <button type="submit" disabled={busy || !noteBody.trim()} className="inline-flex items-center gap-1.5 rounded-[12px] bg-[#1a1416] px-3.5 py-2.5 text-[13px] font-extrabold text-white hover:bg-black disabled:opacity-50">
                    <Send size={14} /> Enviar
                  </button>
                </form>
              </div>
            </>
          )}
        </div>

        {/* Sticky action bar — triage (Part H/I/J/K/L) */}
        {c && (
          <div className="border-t border-[#f1e3e3] bg-[#FFF7F6] px-5 py-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase text-[#9a8a8e]">Prioridade:</span>
              {PRIORITIES.map((p) => (
                <button key={p} disabled={busy || c.priority === p} onClick={() => act(() => api.setCasePriority(c.id, p, envParam(env)), 'Prioridade atualizada.')}
                  className={`rounded px-2 py-0.5 text-[11px] font-bold ${c.priority === p ? PRIORITY_LABEL[p].cls : 'border border-[#eaddde] text-[#5a4a4e]'}`}>{PRIORITY_LABEL[p].label}</button>
              ))}
              <span className="ml-2 text-[11px] font-bold uppercase text-[#9a8a8e]">Risco:</span>
              {RISKS.map((rk) => (
                <button key={rk} disabled={busy || c.risk_level === rk} onClick={() => act(() => api.setCaseRisk(c.id, rk, envParam(env)), 'Risco atualizado.')}
                  className={`rounded px-2 py-0.5 text-[11px] font-bold ${c.risk_level === rk ? RISK_LABEL[rk].cls : 'border border-[#eaddde] text-[#5a4a4e]'}`}>{RISK_LABEL[rk].label}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {c.status === 'UNASSIGNED'
                ? <button disabled={busy} onClick={() => act(() => api.assignCase(c.id, envParam(env)), 'Caso atribuído a si.')} className="rounded-[12px] bg-blue-600 px-4 py-2 text-[13.5px] font-extrabold text-white hover:bg-blue-700 disabled:opacity-50">Assumir</button>
                : <button disabled={busy || resolved} onClick={() => act(() => api.releaseCase(c.id, envParam(env)), 'Caso libertado.')} className="rounded-[12px] border-[1.5px] border-[#eaddde] bg-white px-4 py-2 text-[13.5px] font-extrabold text-[#5a4a4e] hover:bg-white disabled:opacity-50">Libertar</button>}
              <button disabled={busy || resolved || c.status === 'ESCALATED'} onClick={() => act(() => api.escalateCase(c.id, envParam(env)), 'Caso escalado.')} className="rounded-[12px] bg-orange-500 px-4 py-2 text-[13.5px] font-extrabold text-white hover:bg-orange-600 disabled:opacity-50">Escalar</button>
              <button disabled={busy || resolved} onClick={() => act(() => api.resolveCase(c.id, envParam(env)), 'Caso resolvido.')} className="rounded-[12px] bg-green-600 px-4 py-2 text-[13.5px] font-extrabold text-white hover:bg-green-700 disabled:opacity-50">Resolver</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
