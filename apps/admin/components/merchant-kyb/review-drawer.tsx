'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Eye, Download, Link2, Check, AlertTriangle, Clock } from 'lucide-react';
import {
  AdminApi,
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

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING_REVIEW: { label: 'Em análise', cls: 'bg-amber-50 text-amber-700' },
  VALID: { label: 'Válido', cls: 'bg-green-50 text-green-700' },
  REJECTED: { label: 'Rejeitado', cls: 'bg-red-50 text-red-700' },
  EXPIRED: { label: 'Expirado', cls: 'bg-red-50 text-red-700' },
  REPLACED: { label: 'Substituído', cls: 'bg-gray-100 text-gray-500' },
};

// Quick rejection reasons — the chosen reason is merchant-facing (consumed by the
// Business app). "Outro" requires a free-text reason.
const REJECT_REASONS: { label: string; value: string }[] = [
  { label: 'Documento ilegível', value: 'Documento ilegível' },
  { label: 'Documento expirado', value: 'Documento expirado' },
  { label: 'Documento errado', value: 'Documento errado' },
  { label: 'Informação inconsistente', value: 'Informação inconsistente' },
  { label: 'Informação incompleta', value: 'Informação incompleta' },
  { label: 'Outro', value: '__other__' },
];

const EVENT_LABEL: Record<string, string> = {
  'merchant.kyb.document.uploaded': 'Documento enviado',
  'merchant.kyb.document.approved': 'Documento aprovado',
  'merchant.kyb.document.rejected': 'Documento rejeitado',
  'merchant.kyb.verified': 'KYB verificado',
};

function envParam(e: Env): 'SANDBOX' | undefined {
  return e === 'SANDBOX' ? 'SANDBOX' : undefined;
}

// A labelled value row. Falls back to an explicit "—" so empty fields read as
// "no data" rather than a broken layout.
function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  const v = (value ?? '').toString().trim();
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-[#9a8a8e]">{label}</span>
      <span className={`text-[13.5px] font-semibold text-[#2a2024] ${mono ? 'font-mono break-all' : ''}`}>
        {v || '—'}
      </span>
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

export function KybReviewDrawer({
  api, doc, env, onClose, onDecided,
}: {
  api: AdminApi;
  doc: MerchantKybDoc;
  env: Env;
  onClose: () => void;
  onDecided: () => void;
}) {
  const toast = useToast();
  const [ctx, setCtx] = useState<MerchantKybContext | null>(null);
  const [events, setEvents] = useState<KybTimelineEvent[] | null>(null);
  const [ctxErr, setCtxErr] = useState(false);
  const [accessBusy, setAccessBusy] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);

  const st = STATUS[doc.status] ?? { label: doc.status, cls: 'bg-gray-100 text-gray-500' };
  const canDecide = doc.status === 'PENDING_REVIEW' && doc.merchant_exists;

  const load = useCallback(async () => {
    setCtx(null); setEvents(null); setCtxErr(false);
    try {
      const [c, t] = await Promise.all([
        api.getMerchantKybContext(doc.merchant_id, envParam(env)),
        api.getMerchantKybTimeline(doc.merchant_id, envParam(env)),
      ]);
      setCtx(c);
      setEvents(t.events ?? []);
    } catch {
      setCtxErr(true);
      setEvents([]);
    }
  }, [api, doc.merchant_id, env]);

  useEffect(() => { void load(); }, [load]);

  // Esc closes the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Mints a fresh signed URL on demand for each access. The URL is never stored;
  // the access is audited server-side as VIEW/DOWNLOAD/COPY.
  async function access(intent: 'view' | 'download' | 'copy') {
    setAccessBusy(intent);
    try {
      const { download_url } = await api.mintMerchantKybReadUrl(doc.id, intent, envParam(env));
      if (!download_url) { toast('warning', 'Documento indisponível.'); return; }
      if (intent === 'copy') {
        try { await navigator.clipboard.writeText(download_url); }
        catch { /* clipboard blocked — fall through to the toast */ }
        toast('success', 'URL temporária copiada (expira em breve).');
      } else {
        // view + download both open the signed GET; download adds the attachment hint.
        window.open(download_url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      toast('danger', 'Não foi possível gerar a ligação ao documento.');
    } finally {
      setAccessBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-[560px] flex-col bg-white shadow-[0_0_80px_-20px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Revisão de documento KYB"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[17px] font-black text-[#1a1a1a]">{TYPE_LABEL[doc.document_type] ?? doc.document_type}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
              {doc.environment && (
                <span className="rounded-md bg-[#f3e9e9] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#7a6a6e]">{doc.environment}</span>
              )}
            </div>
            {!doc.merchant_exists && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-extrabold text-amber-900">
                <AlertTriangle size={13} /> Comerciante inexistente — apenas consulta
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Fechar" className="flex-none text-[#9a8a8e] hover:text-[#2a2024]">
            <X size={22} strokeWidth={1.8} />
          </button>
        </div>

        {/* Access actions */}
        <div className="flex flex-wrap gap-2 px-5 pb-3">
          <button onClick={() => access('view')} disabled={accessBusy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#eaddde] px-3 py-1.5 text-[13px] font-bold text-[#5a4a4e] hover:bg-[#FFF7F6] disabled:opacity-50">
            <Eye size={15} /> Ver
          </button>
          <button onClick={() => access('download')} disabled={accessBusy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#eaddde] px-3 py-1.5 text-[13px] font-bold text-[#5a4a4e] hover:bg-[#FFF7F6] disabled:opacity-50">
            <Download size={15} /> Download original
          </button>
          <button onClick={() => access('copy')} disabled={accessBusy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#eaddde] px-3 py-1.5 text-[13px] font-bold text-[#5a4a4e] hover:bg-[#FFF7F6] disabled:opacity-50">
            <Link2 size={15} /> Copiar URL temporária
          </button>
        </div>

        {/* Scroll body */}
        <div className="flex-1 overflow-y-auto pb-4">
          {ctxErr && (
            <div className="mx-5 mt-3 rounded-lg bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">
              Não foi possível carregar os dados do comerciante.
            </div>
          )}

          {/* Comerciante */}
          {ctx === null && !ctxErr ? (
            <DrawerSkeleton />
          ) : (
            <>
              <Section title="Comerciante">
                <Field label="Nome" value={ctx?.name || doc.merchant_name} />
                <Field label="Merchant ID" value={doc.merchant_id} mono />
                <Field label="Handle" value={ctx?.handle ? `@${ctx.handle}` : ''} />
                <Field label="Ambiente" value={doc.environment} />
                <Field label="País" value={ctx?.country} />
                <Field label="Estado da conta" value={ctx?.status || doc.merchant_status} />
                <Field label="Estado KYB" value={ctx?.kyb_status || doc.kyb_status} />
                <Field label="Data de criação" value={ctx?.created_at ? formatDate(ctx.created_at) : ''} />
              </Section>

              {/* Representante */}
              <Section title="Representante">
                <Field label="Nome" value={ctx?.representative_name} />
                <Field label="Email" value={ctx?.representative_email} />
                <Field label="Telefone" value={ctx?.representative_phone} />
                {/* Estado KYC do representante: sem ligação de dados atual (limitação real) */}
                <Field label="Estado KYC do representante" value="" />
              </Section>

              {/* Empresa */}
              <Section title="Empresa">
                <Field label="Nome legal" value={ctx?.legal_name} />
                <Field label="NIF" value={ctx?.nif} mono />
                {/* Registo Comercial (nº) e Tipo de empresa: sem ligação de dados atual */}
                <Field label="Registo Comercial" value="" />
                <Field label="Tipo de empresa" value="" />
                <Field label="Categoria" value={ctx?.category || ctx?.business_activity} />
                <Field label="Morada" value={ctx?.address} />
                <Field label="Cidade" value={ctx?.city} />
                <Field label="País" value={ctx?.country} />
              </Section>

              {/* Documento */}
              <Section title="Documento">
                <Field label="Tipo" value={TYPE_LABEL[doc.document_type] ?? doc.document_type} />
                <Field label="Estado" value={st.label} />
                <Field label="Data submissão" value={doc.submitted_at ? formatDate(doc.submitted_at) : ''} />
                <Field label="Última atualização" value={doc.reviewed_at ? formatDate(doc.reviewed_at) : ''} />
                <Field label="Data validade" value={doc.valid_until ? formatDate(doc.valid_until) : ''} />
                <Field label="Motivo rejeição" value={doc.rejection_reason} />
              </Section>

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
              {doc.status !== 'PENDING_REVIEW'
                ? 'Documento já decidido — apenas consulta.'
                : 'Revisão bloqueada (comerciante inexistente).'}
            </span>
          ) : (
            <>
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
        <ApproveModal
          api={api} doc={doc} env={env}
          onClose={() => setDecision(null)}
          onDone={() => { setDecision(null); onDecided(); }}
        />
      )}
      {decision === 'reject' && (
        <RejectModal
          api={api} doc={doc} env={env}
          onClose={() => setDecision(null)}
          onDone={() => { setDecision(null); onDecided(); }}
        />
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
              <div className="text-[11.5px] font-semibold text-[#9a8a8e]">
                {formatDate(e.created_at)}{actor ? ` · ${actor}` : ''}
              </div>
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
    <ModalShell title="Aprovar documento" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="m-0 mb-4 text-[13.5px] font-semibold text-[#5a4a4e]">
          {TYPE_LABEL[doc.document_type] ?? doc.document_type} · {doc.merchant_name || doc.merchant_id.slice(0, 8)}
        </p>
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
    <ModalShell title="Rejeitar documento" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="m-0 mb-3 text-[13.5px] font-semibold text-[#5a4a4e]">
          O motivo é visível para o comerciante na app Business.
        </p>
        <div className="flex flex-col gap-2">
          {REJECT_REASONS.map((r) => (
            <label key={r.value} className={`flex cursor-pointer items-center gap-2.5 rounded-[12px] border-[1.5px] px-3.5 py-2.5 text-[14px] font-bold ${choice === r.value ? 'border-[#B5101F] bg-[#FFF7F6] text-[#B5101F]' : 'border-[#f1e3e3] text-[#5a4a4e]'}`}>
              <input type="radio" name="reject-reason" value={r.value} checked={choice === r.value} onChange={() => setChoice(r.value)} className="accent-[#B5101F]" />
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
