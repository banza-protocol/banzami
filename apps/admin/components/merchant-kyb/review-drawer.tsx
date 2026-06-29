'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Eye, Download, Link2, Check, AlertTriangle, Clock, FileText } from 'lucide-react';
import {
  AdminApi,
  type MerchantKybSummary,
  type MerchantKybDoc,
  type MerchantKybContext,
  type KybTimelineEvent,
} from '@/lib/admin-api';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/format';

type Env = 'LIVE' | 'SANDBOX';

const TYPE_LABEL: Record<string, string> = {
  COMMERCIAL_REGISTRATION: 'Registo Comercial',
  COMPANY_TAX_ID: 'NIF da empresa',
  REPRESENTATIVE_ID: 'Documento do representante',
};

const DOC_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING_REVIEW: { label: 'Em análise', cls: 'bg-amber-50 text-amber-700' },
  VALID: { label: 'Válido', cls: 'bg-green-50 text-green-700' },
  REJECTED: { label: 'Rejeitado', cls: 'bg-red-50 text-red-700' },
  EXPIRED: { label: 'Expirado', cls: 'bg-red-50 text-red-700' },
  REPLACED: { label: 'Substituído', cls: 'bg-gray-100 text-gray-500' },
};

// Quick rejection reasons — consumed by the Business app (merchant-facing).
const REJECT_REASONS: { label: string; value: string }[] = [
  { label: 'Documento ilegível', value: 'Documento ilegível' },
  { label: 'Documento expirado', value: 'Documento expirado' },
  { label: 'Documento errado', value: 'Documento errado' },
  { label: 'Informação inconsistente', value: 'Informação inconsistente' },
  { label: 'Documento incompleto', value: 'Documento incompleto' },
  { label: 'Suspeita de fraude', value: 'Suspeita de fraude' },
  { label: 'Outro', value: '__other__' },
];

const EVENT_LABEL: Record<string, string> = {
  'merchant.kyb.application.received': 'Candidatura recebida',
  'merchant.kyb.document.uploaded': 'Documento enviado',
  'merchant.kyb.document.replaced': 'Documento substituído',
  'merchant.kyb.document.approved': 'Documento aprovado',
  'merchant.kyb.document.rejected': 'Documento rejeitado',
  'merchant.kyb.document.expired': 'Documento expirado',
  'merchant.kyb.verified': 'KYB aprovado',
  'merchant.kyb.rejected': 'KYB rejeitado',
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

export function MerchantKybDrawer({
  api, merchant, env, onClose, onChanged,
}: {
  api: AdminApi;
  merchant: MerchantKybSummary;
  env: Env;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [ctx, setCtx] = useState<MerchantKybContext | null>(null);
  const [docs, setDocs] = useState<MerchantKybDoc[] | null>(null);
  const [events, setEvents] = useState<KybTimelineEvent[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [accessBusy, setAccessBusy] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ kind: 'approve' | 'reject'; doc: MerchantKybDoc } | null>(null);

  const exists = merchant.merchant_exists;

  const load = useCallback(async () => {
    setCtx(null); setDocs(null); setEvents(null); setLoadErr(false);
    try {
      const [c, d, t] = await Promise.all([
        api.getMerchantKybContext(merchant.merchant_id, envParam(env)),
        api.getMerchantKybDocuments(merchant.merchant_id, envParam(env)),
        api.getMerchantKybTimeline(merchant.merchant_id, envParam(env)),
      ]);
      setCtx(c);
      setDocs(d.documents ?? []);
      setEvents(t.events ?? []);
    } catch {
      setLoadErr(true);
      setDocs([]); setEvents([]);
    }
  }, [api, merchant.merchant_id, env]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function access(doc: MerchantKybDoc, intent: 'view' | 'download' | 'copy') {
    setAccessBusy(doc.id + intent);
    try {
      const { download_url } = await api.mintMerchantKybReadUrl(doc.id, intent, envParam(env));
      if (!download_url) { toast('warning', 'Documento indisponível.'); return; }
      if (intent === 'copy') {
        try { await navigator.clipboard.writeText(download_url); } catch { /* clipboard blocked */ }
        toast('success', 'URL temporária copiada (expira em breve).');
      } else {
        window.open(download_url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      toast('danger', 'Não foi possível abrir o documento.');
    } finally {
      setAccessBusy(null);
    }
  }

  function afterDecision() {
    setDecision(null);
    void load();   // refresh the drawer's documents + timeline
    onChanged();   // refresh the parent merchant list aggregates
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-[600px] flex-col bg-white shadow-[0_0_80px_-20px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Revisão de comerciante KYB"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[17px] font-black text-[#1a1a1a]">{merchant.name || 'Comerciante'}</h2>
              {merchant.handle && <span className="font-mono text-xs text-[#7a6a6e]">@{merchant.handle}</span>}
              {merchant.environment && <span className="rounded-md bg-[#f3e9e9] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#7a6a6e]">{merchant.environment}</span>}
            </div>
            {!exists && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-extrabold text-amber-900">
                <AlertTriangle size={13} /> Comerciante inexistente — apenas consulta
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Fechar" className="flex-none text-[#9a8a8e] hover:text-[#2a2024]">
            <X size={22} strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pb-6">
          {loadErr && (
            <div className="mx-5 mt-3 rounded-lg bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">
              Não foi possível carregar os dados do comerciante.
            </div>
          )}

          {ctx === null && !loadErr ? (
            <DrawerSkeleton />
          ) : (
            <>
              {/* 1. Resumo */}
              <Section title="Resumo do comerciante">
                <Field label="Nome comercial" value={ctx?.name || merchant.name} />
                <Field label="Nome legal" value={ctx?.legal_name} />
                <Field label="Handle" value={ctx?.handle ? `@${ctx.handle}` : (merchant.handle ? `@${merchant.handle}` : '')} />
                <Field label="Merchant ID" value={merchant.merchant_id} mono />
                <Field label="Ambiente" value={merchant.environment} />
                <Field label="Estado da conta" value={ctx?.status || merchant.status} />
                <Field label="Estado KYB" value={ctx?.kyb_status || merchant.kyb_status} />
                <Field label="Data de criação" value={ctx?.created_at ? formatDate(ctx.created_at) : ''} />
                <Field label="País" value={ctx?.country || merchant.country} />
              </Section>

              {/* 2. Candidatura */}
              <Section title="Dados da candidatura">
                <Field label="Nome do negócio" value={ctx?.name} />
                <Field label="Categoria" value={ctx?.category || ctx?.business_activity} />
                <Field label="Telefone" value={ctx?.representative_phone} />
                <Field label="Email" value={ctx?.email || merchant.contact} />
                <Field label="NIF" value={ctx?.nif} mono />
                <Field label="Cidade" value={ctx?.city} />
                <Field label="Endereço" value={ctx?.address} />
                <Field label="Representante legal" value={ctx?.representative_name} />
                <Field label="Email do representante" value={ctx?.representative_email} />
                {/* Subcategoria / província / município / referência / registo comercial (nº):
                    sem ligação de dados atual — limitação real, mostrada como — */}
                <Field label="Registo Comercial (nº)" value="" />
                <Field label="Província / Município" value="" />
              </Section>

              {/* 3. Documentos */}
              <div className="border-t border-[#f1e3e3] px-5 py-4">
                <h3 className="mb-3 text-[12px] font-extrabold uppercase tracking-wide text-[#7a6a6e]">
                  Documentos KYB {docs ? `(${docs.length})` : ''}
                </h3>
                {!docs?.length ? (
                  <p className="text-[13px] font-semibold text-[#9a8a8e]">Nenhum documento submetido.</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {docs.map((d) => {
                      const dst = DOC_STATUS[d.status] ?? { label: d.status, cls: 'bg-gray-100 text-gray-500' };
                      const canDecide = d.status === 'PENDING_REVIEW' && exists;
                      return (
                        <div key={d.id} className="rounded-lg border border-gray-100 px-3.5 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <FileText size={16} className="text-[#B5101F]" />
                            <span className="text-[13.5px] font-bold text-[#2a2024]">{TYPE_LABEL[d.document_type] ?? d.document_type}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${dst.cls}`}>{dst.label}</span>
                          </div>
                          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11.5px] font-semibold text-[#9a8a8e]">
                            <span>Submetido: {d.submitted_at ? formatDate(d.submitted_at) : '—'}</span>
                            <span>Atualizado: {d.reviewed_at ? formatDate(d.reviewed_at) : '—'}</span>
                            <span>Validade: {d.valid_until ? formatDate(d.valid_until) : '—'}</span>
                            <span>Revisor: {d.reviewed_by || '—'}</span>
                            {d.rejection_reason && <span className="col-span-2 text-red-700">Motivo: {d.rejection_reason}</span>}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button onClick={() => access(d, 'view')} disabled={accessBusy !== null}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#eaddde] px-2.5 py-1 text-[12.5px] font-bold text-[#5a4a4e] hover:bg-[#FFF7F6] disabled:opacity-50">
                              <Eye size={14} /> Ver
                            </button>
                            <button onClick={() => access(d, 'download')} disabled={accessBusy !== null}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#eaddde] px-2.5 py-1 text-[12.5px] font-bold text-[#5a4a4e] hover:bg-[#FFF7F6] disabled:opacity-50">
                              <Download size={14} /> Download
                            </button>
                            <button onClick={() => access(d, 'copy')} disabled={accessBusy !== null}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#eaddde] px-2.5 py-1 text-[12.5px] font-bold text-[#5a4a4e] hover:bg-[#FFF7F6] disabled:opacity-50">
                              <Link2 size={14} /> Copiar URL
                            </button>
                            {canDecide && (
                              <>
                                <button onClick={() => setDecision({ kind: 'approve', doc: d })}
                                  className="ml-auto inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1 text-[12.5px] font-bold text-white hover:bg-green-700">
                                  Aprovar
                                </button>
                                <button onClick={() => setDecision({ kind: 'reject', doc: d })}
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#B5101F] px-3 py-1 text-[12.5px] font-bold text-white hover:bg-[#9A1B22]">
                                  Rejeitar
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 4. Histórico */}
              <div className="border-t border-[#f1e3e3] px-5 py-4">
                <h3 className="mb-3 text-[12px] font-extrabold uppercase tracking-wide text-[#7a6a6e]">Histórico KYB</h3>
                <Timeline events={events} />
              </div>
            </>
          )}
        </div>
      </div>

      {decision?.kind === 'approve' && (
        <ApproveModal api={api} doc={decision.doc} env={env} onClose={() => setDecision(null)} onDone={afterDecision} />
      )}
      {decision?.kind === 'reject' && (
        <RejectModal api={api} doc={decision.doc} env={env} onClose={() => setDecision(null)} onDone={afterDecision} />
      )}
    </div>
  );
}

function Timeline({ events }: { events: KybTimelineEvent[] | null }) {
  if (events === null) {
    return <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-9 animate-pulse rounded bg-[#f3e9e9]" />)}</div>;
  }
  if (events.length === 0) {
    return <p className="text-[13px] font-semibold text-[#9a8a8e]">Sem eventos registados.</p>;
  }
  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const notes = typeof e.payload?.notes === 'string' ? (e.payload.notes as string) : '';
        const reason = typeof e.payload?.rejection_reason === 'string' ? (e.payload.rejection_reason as string) : '';
        const actor = typeof e.payload?.reviewed_by === 'string' ? (e.payload.reviewed_by as string) : '';
        return (
          <li key={e.id} className="flex gap-3">
            <div className="mt-0.5 flex-none text-[#B5101F]"><Clock size={15} /></div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-[#2a2024]">{EVENT_LABEL[e.event_type] ?? e.event_type}</div>
              <div className="text-[11.5px] font-semibold text-[#9a8a8e]">{formatDate(e.created_at)}{actor ? ` · ${actor}` : ''}</div>
              {reason && <div className="mt-0.5 text-[12.5px] font-semibold text-red-700">Motivo: {reason}</div>}
              {notes && <div className="mt-0.5 text-[12.5px] font-medium italic text-[#5a4a4e]">Nota: {notes}</div>}
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

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-[460px] rounded-[20px] border border-[#f1e3e3] bg-white p-7 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.4)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="m-0 text-[18px] font-black tracking-[-0.01em]">{title}</h2>
            {subtitle && <p className="m-0 mt-1 text-[13px] font-semibold text-[#9a8a8e]">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-[#9a8a8e] hover:text-[#2a2024]"><X size={20} strokeWidth={1.8} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ApproveModal({
  api, doc, env, onClose, onDone,
}: { api: AdminApi; doc: MerchantKybDoc; env: Env; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [validity, setValidity] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    let validUntil: string | undefined;
    const t = validity.trim();
    if (t) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) { toast('warning', 'Data inválida. Use AAAA-MM-DD.'); return; }
      validUntil = `${t}T00:00:00Z`;
    }
    setBusy(true);
    try {
      await api.approveMerchantKybDocument(doc.id, { validUntil, notes: notes.trim() || undefined }, envParam(env));
      toast('success', 'Documento aprovado.');
      onDone();
    } catch {
      toast('danger', 'Não foi possível aprovar o documento.');
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Aprovar documento" subtitle={TYPE_LABEL[doc.document_type] ?? doc.document_type} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="mb-1.5 block text-[13px] font-extrabold">Validade (opcional) — AAAA-MM-DD</label>
        <input autoFocus value={validity} onChange={(e) => setValidity(e.target.value)} placeholder="ex.: 2027-12-31" className={modalInput} />
        <label className="mb-1.5 mt-4 block text-[13px] font-extrabold">Notas internas (opcional)</label>
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

function RejectModal({
  api, doc, env, onClose, onDone,
}: { api: AdminApi; doc: MerchantKybDoc; env: Env; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [choice, setChoice] = useState('');
  const [other, setOther] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const reason = choice === '__other__' ? other.trim() : choice;
  const valid = choice !== '' && (choice !== '__other__' || other.trim().length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await api.rejectMerchantKybDocument(doc.id, reason, { notes: notes.trim() || undefined }, envParam(env));
      toast('success', 'Documento rejeitado.');
      onDone();
    } catch {
      toast('danger', 'Não foi possível rejeitar o documento.');
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Rejeitar documento" subtitle="O motivo é visível para o comerciante na app Business." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="flex flex-col gap-2">
          {REJECT_REASONS.map((r) => (
            <label key={r.value} className={`flex cursor-pointer items-center gap-2.5 rounded-[12px] border-[1.5px] px-3.5 py-2.5 text-[14px] font-bold ${choice === r.value ? 'border-[#B5101F] bg-[#FFF7F6] text-[#B5101F]' : 'border-[#f1e3e3] text-[#5a4a4e]'}`}>
              <input type="radio" name="kyb-reject-reason" value={r.value} checked={choice === r.value} onChange={() => setChoice(r.value)} className="accent-[#B5101F]" />
              {r.label}
            </label>
          ))}
        </div>
        {choice === '__other__' && (
          <input autoFocus value={other} onChange={(e) => setOther(e.target.value)} placeholder="Descreva o motivo" className={`${modalInput} mt-3`} />
        )}
        <label className="mb-1.5 mt-4 block text-[13px] font-extrabold">Observações internas (opcional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Visível apenas para operadores" className={`${modalInput} resize-y`} />
        <div className="mt-6 flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className={`${modalBtn} border-[1.5px] border-[#f1e3e3] bg-white text-[#5a4a4e] hover:bg-[#FFF7F6]`}>Cancelar</button>
          <button type="submit" disabled={busy || !valid} className={`${modalBtn} bg-[#B5101F] text-white hover:bg-[#9A1B22]`}>Confirmar rejeição</button>
        </div>
      </form>
    </ModalShell>
  );
}
