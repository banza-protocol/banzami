'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Eye, Download, Link2, Check, AlertTriangle, Clock, FileImage } from 'lucide-react';
import {
  AdminApi,
  type KycCaseSummary,
  type KycCaseDetail,
  type KycEvidence,
  type KycTimelineEvent,
} from '@/lib/admin-api';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/format';
import { KYC_STATUS, KYC_DOC_LABEL } from '@/components/consumer-kyc/labels';

type Env = 'LIVE' | 'SANDBOX';

const EVIDENCE_LABEL: Record<string, string> = {
  DOCUMENT_IMAGE: 'Imagem do documento',
  SELFIE: 'Selfie',
  LIVENESS_VIDEO: 'Vídeo de vivacidade',
  PROOF_OF_ADDRESS: 'Comprovativo de morada',
};
const SIDE_LABEL: Record<string, string> = {
  FRONT: 'Frente', BACK: 'Verso', MAIN_PAGE: 'Página principal', LAST_PAGE: 'Última página', SELFIE: 'Selfie',
};
const EVIDENCE_STATUS: Record<string, { label: string; cls: string }> = {
  UPLOADED: { label: 'Enviado', cls: 'bg-green-50 text-green-700' },
  PENDING: { label: 'Pendente', cls: 'bg-amber-50 text-amber-700' },
  FAILED: { label: 'Falhou', cls: 'bg-red-50 text-red-700' },
};

const GRANTED_LEVELS = ['BASIC', 'ENHANCED', 'FULL'] as const;

// Quick rejection reasons (consumer-facing, surfaced by the Consumer app).
const REJECT_REASONS: { label: string; value: string }[] = [
  { label: 'Documento ilegível', value: 'Documento ilegível' },
  { label: 'Documento expirado', value: 'Documento expirado' },
  { label: 'Documento errado', value: 'Documento errado' },
  { label: 'Selfie inválida', value: 'Selfie inválida' },
  { label: 'Dados inconsistentes', value: 'Dados inconsistentes' },
  { label: 'Suspeita de fraude', value: 'Suspeita de fraude' },
  { label: 'Outro', value: '__other__' },
];

const EVENT_LABEL: Record<string, string> = {
  'kyc.case.created': 'Caso criado',
  'kyc.case.submitted': 'Caso submetido',
  'kyc.review.completed': 'Revisão concluída',
  'kyc.approved': 'KYC aprovado',
  'kyc.rejected': 'KYC rejeitado',
};

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[#f1e3e3] px-5 py-4">
      <h3 className="mb-3 text-[12px] font-extrabold uppercase tracking-wide text-[#7a6a6e]">{title}</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </div>
  );
}

export function KycReviewDrawer({
  api, summary, env, onClose, onDecided,
}: {
  api: AdminApi;
  summary: KycCaseSummary;
  env: Env;
  onClose: () => void;
  onDecided: () => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<KycCaseDetail | null>(null);
  const [events, setEvents] = useState<KycTimelineEvent[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [accessBusy, setAccessBusy] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject' | 'more-info' | null>(null);

  const st = KYC_STATUS[summary.status] ?? { label: summary.status, cls: 'bg-gray-100 text-gray-500' };
  const canDecide = summary.status === 'UNDER_REVIEW' && summary.consumer_exists;
  const lastReviewer = detail?.reviews?.length ? detail.reviews[detail.reviews.length - 1].reviewer_id : '';

  const load = useCallback(async () => {
    setDetail(null); setEvents(null); setLoadErr(false);
    try {
      const [d, t] = await Promise.all([
        api.getKycCase(summary.id, envParam(env)),
        api.getKycTimeline(summary.id, envParam(env)),
      ]);
      setDetail(d);
      setEvents(t.events ?? []);
    } catch {
      setLoadErr(true);
      setEvents([]);
    }
  }, [api, summary.id, env]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Mints a fresh signed URL per access; never stored, audited as VIEW/DOWNLOAD/COPY.
  async function access(ev: KycEvidence, intent: 'view' | 'download' | 'copy') {
    setAccessBusy(ev.id + intent);
    try {
      const { download_url } = await api.mintKycEvidenceReadUrl(ev.id, intent, envParam(env));
      if (!download_url) { toast('warning', 'Evidência indisponível.'); return; }
      if (intent === 'copy') {
        try { await navigator.clipboard.writeText(download_url); } catch { /* clipboard blocked */ }
        toast('success', 'URL temporária copiada (expira em breve).');
      } else {
        window.open(download_url, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      const code = (e as { code?: string })?.code;
      toast('danger', code === 'OBJECT_NOT_UPLOADED' ? 'Evidência ainda não foi enviada.' : 'Não foi possível abrir a evidência.');
    } finally {
      setAccessBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-[580px] flex-col bg-white shadow-[0_0_80px_-20px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Revisão de caso KYC"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[17px] font-black text-[#1a1a1a]">{summary.consumer_name || 'Consumidor'}</h2>
              {summary.consumer_handle && <span className="font-mono text-xs text-[#7a6a6e]">@{summary.consumer_handle}</span>}
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
              <span className="rounded-md bg-[#f3e9e9] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#7a6a6e]">{summary.environment}</span>
            </div>
            {!summary.consumer_exists && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-extrabold text-amber-900">
                <AlertTriangle size={13} /> Consumidor inexistente — apenas consulta
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Fechar" className="flex-none text-[#9a8a8e] hover:text-[#2a2024]">
            <X size={22} strokeWidth={1.8} />
          </button>
        </div>

        {/* Scroll body */}
        <div className="flex-1 overflow-y-auto pb-4">
          {loadErr && (
            <div className="mx-5 mt-3 rounded-lg bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">
              Não foi possível carregar os dados do caso.
            </div>
          )}

          {detail === null && !loadErr ? (
            <DrawerSkeleton />
          ) : (
            <>
              <Section title="Consumidor">
                <Field label="Nome" value={detail?.consumer_name || summary.consumer_name} />
                <Field label="Consumer ID" value={summary.subject_id} mono />
                <Field label="Handle" value={summary.consumer_handle ? `@${summary.consumer_handle}` : ''} />
                <Field label="Telefone" value={detail?.consumer_phone || summary.consumer_phone} />
                <Field label="Estado da conta" value={detail?.consumer_status || summary.consumer_status} />
                <Field label="Nível KYC atual" value={detail?.kyc_level || summary.kyc_level} />
                <Field label="Estado compliance" value={detail?.compliance_status || summary.compliance_status} />
                {/* País/email do consumidor: sem ligação de dados atual (limitação real) */}
                <Field label="País (consumidor)" value="" />
              </Section>

              <Section title="Caso">
                <Field label="Case ID" value={summary.id} mono />
                <Field label="Estado" value={st.label} />
                <Field label="Tipo de documento" value={KYC_DOC_LABEL[summary.document_type ?? ''] ?? summary.document_type} />
                <Field label="País do documento" value={summary.document_country} />
                <Field label="Criado" value={formatDate(summary.created_at)} />
                <Field label="Submetido" value={summary.submitted_at ? formatDate(summary.submitted_at) : ''} />
                <Field label="Revisto" value={summary.reviewed_at ? formatDate(summary.reviewed_at) : ''} />
                <Field label="Motivo (reason_code)" value={summary.reason_code} />
                <Field label="Revisor" value={lastReviewer} />
              </Section>

              {/* Evidências */}
              <div className="border-t border-[#f1e3e3] px-5 py-4">
                <h3 className="mb-3 text-[12px] font-extrabold uppercase tracking-wide text-[#7a6a6e]">
                  Documentos e evidências {detail ? `(${detail.evidence?.length ?? 0})` : ''}
                </h3>
                {!detail?.evidence?.length ? (
                  <p className="text-[13px] font-semibold text-[#9a8a8e]">Nenhuma evidência carregada ainda.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {detail.evidence.map((ev) => {
                      const evst = EVIDENCE_STATUS[ev.status] ?? { label: ev.status, cls: 'bg-gray-100 text-gray-500' };
                      const uploaded = ev.status === 'UPLOADED';
                      return (
                        <div key={ev.id} className="rounded-lg border border-gray-100 px-3.5 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <FileImage size={16} className="text-[#B5101F]" />
                            <span className="text-[13.5px] font-bold text-[#2a2024]">{EVIDENCE_LABEL[ev.evidence_type] ?? ev.evidence_type}</span>
                            {ev.side && <span className="rounded-md bg-[#f3e9e9] px-1.5 py-0.5 text-[10px] font-bold text-[#7a6a6e]">{SIDE_LABEL[ev.side] ?? ev.side}</span>}
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${evst.cls}`}>{evst.label}</span>
                          </div>
                          <div className="mt-1 text-[11.5px] font-semibold text-[#9a8a8e]">
                            {ev.mime_type ?? '—'}
                            {ev.size_bytes ? ` · ${(ev.size_bytes / 1024).toFixed(0)} KB` : ''}
                            {ev.uploaded_at ? ` · ${formatDate(ev.uploaded_at)}` : ''}
                          </div>
                          {uploaded && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button onClick={() => access(ev, 'view')} disabled={accessBusy !== null}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#eaddde] px-2.5 py-1 text-[12.5px] font-bold text-[#5a4a4e] hover:bg-[#FFF7F6] disabled:opacity-50">
                                <Eye size={14} /> Ver
                              </button>
                              <button onClick={() => access(ev, 'download')} disabled={accessBusy !== null}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#eaddde] px-2.5 py-1 text-[12.5px] font-bold text-[#5a4a4e] hover:bg-[#FFF7F6] disabled:opacity-50">
                                <Download size={14} /> Download
                              </button>
                              <button onClick={() => access(ev, 'copy')} disabled={accessBusy !== null}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#eaddde] px-2.5 py-1 text-[12.5px] font-bold text-[#5a4a4e] hover:bg-[#FFF7F6] disabled:opacity-50">
                                <Link2 size={14} /> Copiar URL
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div className="border-t border-[#f1e3e3] px-5 py-4">
                <h3 className="mb-3 text-[12px] font-extrabold uppercase tracking-wide text-[#7a6a6e]">Histórico</h3>
                <Timeline events={events} />
              </div>
            </>
          )}
        </div>

        {/* Sticky action bar */}
        <div className="flex items-center justify-end gap-2.5 border-t border-[#f1e3e3] bg-[#FFF7F6] px-5 py-3.5">
          {!canDecide ? (
            <span className="text-[12.5px] font-semibold text-[#9a8a8e]">
              {!summary.consumer_exists
                ? 'Revisão bloqueada (consumidor inexistente).'
                : summary.status === 'WAITING_DOCUMENTS'
                  ? 'Aguarda documentos do consumidor — decisão indisponível.'
                  : 'Caso já decidido — apenas consulta.'}
            </span>
          ) : (
            <>
              <button onClick={() => setDecision('more-info')}
                className="rounded-[12px] border-[1.5px] border-[#eaddde] bg-white px-4 py-2.5 text-[14px] font-extrabold text-[#5a4a4e] hover:bg-[#FFF7F6]">
                Pedir mais informação
              </button>
              <button onClick={() => setDecision('reject')}
                className="rounded-[12px] bg-[#B5101F] px-5 py-2.5 text-[14px] font-extrabold text-white hover:bg-[#9A1B22]">
                Rejeitar
              </button>
              <button onClick={() => setDecision('approve')}
                className="rounded-[12px] bg-green-600 px-5 py-2.5 text-[14px] font-extrabold text-white hover:bg-green-700">
                Aprovar
              </button>
            </>
          )}
        </div>
      </div>

      {decision === 'approve' && (
        <ApproveModal api={api} c={summary} env={env} onClose={() => setDecision(null)} onDone={() => { setDecision(null); onDecided(); }} />
      )}
      {decision === 'reject' && (
        <ReasonModal kind="reject" api={api} c={summary} env={env} onClose={() => setDecision(null)} onDone={() => { setDecision(null); onDecided(); }} />
      )}
      {decision === 'more-info' && (
        <ReasonModal kind="more-info" api={api} c={summary} env={env} onClose={() => setDecision(null)} onDone={() => { setDecision(null); onDecided(); }} />
      )}
    </div>
  );
}

function Timeline({ events }: { events: KycTimelineEvent[] | null }) {
  if (events === null) {
    return <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-9 animate-pulse rounded bg-[#f3e9e9]" />)}</div>;
  }
  if (events.length === 0) {
    return <p className="text-[13px] font-semibold text-[#9a8a8e]">Sem eventos registados.</p>;
  }
  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const decision = typeof e.payload?.decision === 'string' ? (e.payload.decision as string) : '';
        const level = typeof e.payload?.granted_level === 'string' ? (e.payload.granted_level as string) : '';
        const reason = typeof e.payload?.reason_code === 'string' ? (e.payload.reason_code as string) : '';
        return (
          <li key={e.id} className="flex gap-3">
            <div className="mt-0.5 flex-none text-[#B5101F]"><Clock size={15} /></div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-[#2a2024]">{EVENT_LABEL[e.event_type] ?? e.event_type}</div>
              <div className="text-[11.5px] font-semibold text-[#9a8a8e]">{formatDate(e.created_at)}</div>
              {decision && <div className="mt-0.5 text-[12.5px] font-semibold text-[#5a4a4e]">Decisão: {decision}{level ? ` · ${level}` : ''}</div>}
              {reason && <div className="mt-0.5 text-[12.5px] font-semibold text-red-700">Motivo: {reason}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-4 px-5 py-4">
      {[0, 1, 2].map((s) => (
        <div key={s} className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-[#f3e9e9]" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-9 animate-pulse rounded bg-[#faf0f0]" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

const modalBtn = 'rounded-[12px] px-5 py-2.5 text-[14px] font-extrabold transition disabled:opacity-50';
const modalInput =
  'w-full rounded-[14px] border-[1.5px] border-[#f1e3e3] bg-[#FFF7F6] px-4 py-3 text-[15px] font-semibold text-[#2a2024] outline-none transition focus:border-[#B5101F] focus:ring-4 focus:ring-[#B5101F]/10';

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-[460px] rounded-[20px] border border-[#f1e3e3] bg-white p-7 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.4)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 text-[18px] font-black tracking-[-0.01em]">{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-[#9a8a8e] hover:text-[#2a2024]"><X size={20} strokeWidth={1.8} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ApproveModal({
  api, c, env, onClose, onDone,
}: { api: AdminApi; c: KycCaseSummary; env: Env; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [level, setLevel] = useState<string>('BASIC');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.approveKycCase(c.id, level, notes.trim() || undefined, envParam(env));
      toast('success', 'KYC aprovado.');
      onDone();
    } catch {
      toast('danger', 'Não foi possível aprovar o caso.');
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Aprovar KYC" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="m-0 mb-4 text-[13.5px] font-semibold text-[#5a4a4e]">
          {c.consumer_name || c.subject_id.slice(0, 8)} — o nível é decidido pelo operador conforme política interna.
        </p>
        <label className="mb-1.5 block text-[13px] font-extrabold">Nível concedido</label>
        <div className="flex gap-2">
          {GRANTED_LEVELS.map((l) => (
            <button type="button" key={l} onClick={() => setLevel(l)}
              className={`flex-1 rounded-[12px] border-[1.5px] px-3 py-2.5 text-[13.5px] font-bold ${level === l ? 'border-green-600 bg-green-50 text-green-700' : 'border-[#f1e3e3] text-[#5a4a4e]'}`}>
              {l}
            </button>
          ))}
        </div>
        <label className="mb-1.5 mt-4 block text-[13px] font-extrabold">Observações internas (opcional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Visível apenas para operadores" className={`${modalInput} resize-y`} />
        <div className="mt-6 flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className={`${modalBtn} border-[1.5px] border-[#f1e3e3] bg-white text-[#5a4a4e] hover:bg-[#FFF7F6]`}>Cancelar</button>
          <button type="submit" disabled={busy} className={`${modalBtn} inline-flex items-center gap-1.5 bg-green-600 text-white hover:bg-green-700`}>
            <Check size={16} strokeWidth={2.4} /> Confirmar aprovação
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ReasonModal({
  kind, api, c, env, onClose, onDone,
}: { kind: 'reject' | 'more-info'; api: AdminApi; c: KycCaseSummary; env: Env; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [choice, setChoice] = useState('');
  const [other, setOther] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const reject = kind === 'reject';
  // request-more-info uses a free-text reason; reject uses quick reasons + Outro.
  const reason = reject ? (choice === '__other__' ? other.trim() : choice) : other.trim();
  const valid = reject ? (choice !== '' && (choice !== '__other__' || other.trim().length > 0)) : other.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      if (reject) await api.rejectKycCase(c.id, reason, notes.trim() || undefined, envParam(env));
      else await api.requestKycMoreInfo(c.id, reason, notes.trim() || undefined, envParam(env));
      toast('success', reject ? 'KYC rejeitado.' : 'Pedido de mais informação enviado.');
      onDone();
    } catch {
      toast('danger', reject ? 'Não foi possível rejeitar o caso.' : 'Não foi possível enviar o pedido.');
      setBusy(false);
    }
  }

  return (
    <ModalShell title={reject ? 'Rejeitar KYC' : 'Pedir mais informação'} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="m-0 mb-3 text-[13.5px] font-semibold text-[#5a4a4e]">
          O motivo é visível para o consumidor na app.
        </p>
        {reject ? (
          <>
            <div className="flex flex-col gap-2">
              {REJECT_REASONS.map((r) => (
                <label key={r.value} className={`flex cursor-pointer items-center gap-2.5 rounded-[12px] border-[1.5px] px-3.5 py-2.5 text-[14px] font-bold ${choice === r.value ? 'border-[#B5101F] bg-[#FFF7F6] text-[#B5101F]' : 'border-[#f1e3e3] text-[#5a4a4e]'}`}>
                  <input type="radio" name="kyc-reject-reason" value={r.value} checked={choice === r.value} onChange={() => setChoice(r.value)} className="accent-[#B5101F]" />
                  {r.label}
                </label>
              ))}
            </div>
            {choice === '__other__' && (
              <input autoFocus value={other} onChange={(e) => setOther(e.target.value)} placeholder="Descreva o motivo" className={`${modalInput} mt-3`} />
            )}
          </>
        ) : (
          <>
            <label className="mb-1.5 block text-[13px] font-extrabold">O que falta? (visível para o consumidor)</label>
            <textarea autoFocus value={other} onChange={(e) => setOther(e.target.value)} rows={2} placeholder="ex.: enviar o verso do BI e uma selfie nítida" className={`${modalInput} resize-y`} />
          </>
        )}
        <label className="mb-1.5 mt-4 block text-[13px] font-extrabold">Observações internas (opcional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Visível apenas para operadores" className={`${modalInput} resize-y`} />
        <div className="mt-6 flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className={`${modalBtn} border-[1.5px] border-[#f1e3e3] bg-white text-[#5a4a4e] hover:bg-[#FFF7F6]`}>Cancelar</button>
          <button type="submit" disabled={busy || !valid} className={`${modalBtn} ${reject ? 'bg-[#B5101F] hover:bg-[#9A1B22]' : 'bg-[#1a1416] hover:bg-black'} text-white`}>
            {reject ? 'Confirmar rejeição' : 'Enviar pedido'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
