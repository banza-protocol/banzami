'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/client';
import { formatKz } from '@/lib/money';

type Step = 'who' | 'amount' | 'review' | 'done';

export function SendFlow({ selfHandle }: { selfHandle: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('who');
  const [handle, setHandle] = useState('');
  const [recipient, setRecipient] = useState<{ handle: string; display_name: string | null } | null>(null);
  const [amountKz, setAmountKz] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ transfer_id: string; amount_minor: number } | null>(null);
  // One idempotency key per send intent, minted when the amount is set and reused
  // on every retry, so a double-click or a network retry converges on ONE
  // transfer (§64/§65/§127).
  const idemKey = useRef<string>('');

  const amountMinor = useMemo(() => {
    const n = Number(amountKz.replace(/[^\d]/g, ''));
    return Number.isFinite(n) ? n * 100 : 0;
  }, [amountKz]);

  async function resolveRecipient() {
    setErr('');
    const h = handle.trim().toLowerCase().replace(/^@/, '');
    if (!h) return setErr('Indique o @banza do destinatário.');
    if (h === selfHandle) return setErr('Não pode enviar para si próprio.');
    setBusy(true);
    const r = await apiGet<{ handle: string; display_name: string | null; message?: string }>(`/api/consumers/${encodeURIComponent(h)}`);
    setBusy(false);
    if (!r.ok) return setErr(r.status === 404 ? 'Esse @banza não existe.' : (r.data.message ?? 'Não foi possível verificar o @banza.'));
    setRecipient({ handle: r.data.handle, display_name: r.data.display_name });
    setStep('amount');
  }

  function toReview() {
    setErr('');
    if (amountMinor <= 0) return setErr('Indique um valor.');
    idemKey.current = crypto.randomUUID().replace(/-/g, '');
    setStep('review');
  }

  async function confirm() {
    if (busy) return; // hard guard against a double click
    setErr('');
    setBusy(true);
    const r = await apiPost<{ transfer_id?: string; amount_minor?: number; message?: string }>('/api/transfers', {
      recipient: `@${recipient!.handle}`, amount_minor: amountMinor, note: note.trim() || undefined, idempotency_key: idemKey.current,
    });
    setBusy(false);
    if (!r.ok) return setErr(r.data.message ?? 'Não foi possível enviar.');
    setResult({ transfer_id: r.data.transfer_id!, amount_minor: r.data.amount_minor ?? amountMinor });
    setStep('done');
  }

  const field = 'w-full rounded-[14px] border border-[#E7E0E0] bg-white px-4 py-3.5 text-[16px] text-ink outline-none transition focus:border-cherry focus:ring-4 focus:ring-cherry/10';

  return (
    <div className="px-5 pb-8 pt-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => (step === 'who' || step === 'done' ? router.push('/inicio') : setStep(step === 'review' ? 'amount' : 'who'))} aria-label="Voltar" className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-black/5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h1 className="text-[19px] font-black text-ink">{step === 'done' ? 'Enviado' : 'Enviar'}</h1>
      </div>

      {step === 'who' && (
        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="rh" className="mb-1.5 block text-[13px] font-bold text-ink-soft">Para quem?</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-bold text-ink-muted">@</span>
              <input id="rh" className={`${field} pl-8`} value={handle} onChange={(e) => setHandle(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus placeholder="banza do destinatário" onKeyDown={(e) => e.key === 'Enter' && resolveRecipient()} />
            </div>
          </div>
          {err && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13.5px] font-medium text-red-800">{err}</p>}
          <button type="button" onClick={resolveRecipient} disabled={busy} className="w-full rounded-[16px] bg-gradient-to-b from-cherry to-cherry-dark px-5 py-4 text-[16px] font-black text-white disabled:opacity-60">{busy ? 'A verificar…' : 'Continuar'}</button>
        </div>
      )}

      {step === 'amount' && recipient && (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl bg-white p-4 text-center shadow-[0_10px_30px_-24px_rgba(0,0,0,.4)]">
            <div className="text-[12px] font-semibold text-ink-muted">Para</div>
            <div className="text-[16px] font-black text-ink">{recipient.display_name || `@${recipient.handle}`}</div>
            <div className="text-[12.5px] font-medium text-cherry">@{recipient.handle}</div>
          </div>
          <div>
            <label htmlFor="amt" className="mb-1.5 block text-[13px] font-bold text-ink-soft">Valor (Kz)</label>
            <input id="amt" className={`${field} text-[22px] font-black`} value={amountKz} onChange={(e) => setAmountKz(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" autoFocus placeholder="0" />
          </div>
          <div>
            <label htmlFor="note" className="mb-1.5 block text-[13px] font-bold text-ink-soft">Nota (opcional)</label>
            <input id="note" className={field} value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="Ex.: almoço" />
          </div>
          {err && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13.5px] font-medium text-red-800">{err}</p>}
          <button type="button" onClick={toReview} className="w-full rounded-[16px] bg-gradient-to-b from-cherry to-cherry-dark px-5 py-4 text-[16px] font-black text-white">Rever</button>
        </div>
      )}

      {step === 'review' && recipient && (
        <div className="mt-6 space-y-5">
          <div className="rounded-3xl bg-white p-6 text-center shadow-[0_16px_40px_-28px_rgba(0,0,0,.4)]">
            <div className="text-[13px] font-semibold text-ink-muted">Vai enviar</div>
            <div className="mt-1 text-[34px] font-black tracking-[-0.02em] text-ink">{formatKz(amountMinor)}</div>
            <div className="mt-2 text-[14px] font-medium text-ink-soft">para <span className="font-black text-cherry">@{recipient.handle}</span></div>
            {note.trim() && <div className="mt-1 text-[13px] text-ink-muted">“{note.trim()}”</div>}
          </div>
          {err && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13.5px] font-medium text-red-800">{err}</p>}
          <button type="button" onClick={confirm} disabled={busy} className="w-full rounded-[16px] bg-gradient-to-b from-cherry to-cherry-dark px-5 py-4 text-[16px] font-black text-white disabled:opacity-60">{busy ? 'A enviar…' : 'Confirmar e enviar'}</button>
          <p className="text-center text-[12px] font-medium text-ink-muted">Dinheiro fictício — ambiente de testes.</p>
        </div>
      )}

      {step === 'done' && result && recipient && (
        <div className="mt-10 flex flex-col items-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#16a34a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <div className="mt-4 text-[30px] font-black text-ink">{formatKz(result.amount_minor)}</div>
          <div className="mt-1 text-[15px] font-medium text-ink-soft">enviado para <span className="font-black text-cherry">@{recipient.handle}</span></div>
          <div className="mt-8 flex w-full gap-2">
            <button type="button" onClick={() => router.push(`/historico/${result.transfer_id}`)} className="flex-1 rounded-xl border border-[#EBE3E3] bg-white py-3 text-[14px] font-bold text-cherry-dark">Ver comprovativo</button>
            <button type="button" onClick={() => { router.push('/inicio'); router.refresh(); }} className="flex-1 rounded-xl bg-gradient-to-b from-cherry to-cherry-dark py-3 text-[14px] font-black text-white">Concluir</button>
          </div>
        </div>
      )}
    </div>
  );
}
