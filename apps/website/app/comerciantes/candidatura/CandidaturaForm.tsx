'use client';

import { useEffect, useState } from 'react';
import {
  checkHandle,
  submitApplication,
  normalizeHandle,
  isValidHandleFormat,
  handleReasonMessage,
  type ApplicationInput,
} from '@/lib/api';

const CATEGORIES = [
  ['RETAIL', 'Retalho'],
  ['FOOD', 'Alimentação'],
  ['TRANSPORT', 'Transporte'],
  ['SERVICES', 'Serviços'],
  ['HEALTH', 'Saúde'],
  ['EDUCATION', 'Educação'],
  ['ENTERTAINMENT', 'Entretenimento'],
  ['OTHER', 'Outro'],
] as const;

type HandleState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; message: string };

const inputCls =
  'w-full rounded-[14px] border border-[#e5e7eb] bg-white px-4 py-3 text-[15px] text-ink outline-none transition focus:border-cherry focus:ring-2 focus:ring-cherry/20';
const labelCls = 'mb-1.5 block text-[13px] font-bold text-ink';

export function CandidaturaForm() {
  const [form, setForm] = useState({
    business_name: '',
    handle: '',
    category: '',
    email: '',
    phone: '',
    nif: '',
    country: 'Angola',
    city: '',
    address: '',
    legal_representative: '',
    business_activity: '',
    estimated_volume: '',
    terms: false,
  });
  const [handleState, setHandleState] = useState<HandleState>({ status: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handle = normalizeHandle(form.handle);

  // Debounced live availability check.
  useEffect(() => {
    if (handle === '') {
      setHandleState({ status: 'idle' });
      return;
    }
    if (!isValidHandleFormat(handle)) {
      setHandleState({ status: 'unavailable', message: handleReasonMessage('INVALID') });
      return;
    }
    setHandleState({ status: 'checking' });
    const t = setTimeout(async () => {
      try {
        const r = await checkHandle(handle);
        setHandleState(
          r.available
            ? { status: 'available' }
            : { status: 'unavailable', message: handleReasonMessage(r.reason) },
        );
      } catch {
        setHandleState({ status: 'unavailable', message: 'Não foi possível verificar. Tente novamente.' });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [handle]);

  const requiredOk =
    form.business_name.trim() !== '' && form.email.trim() !== '' && form.terms;
  const canSubmit = requiredOk && handleState.status === 'available' && !submitting;

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    const input: ApplicationInput = {
      desired_handle: handle,
      business_name: form.business_name.trim(),
      category: form.category || undefined,
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      nif: form.nif.trim() || undefined,
      country: form.country.trim() || undefined,
      city: form.city.trim() || undefined,
      address: form.address.trim() || undefined,
      legal_representative: form.legal_representative.trim() || undefined,
      business_activity: form.business_activity.trim() || undefined,
      estimated_volume: form.estimated_volume.trim() || undefined,
      terms_accepted: form.terms,
    };
    const r = await submitApplication(input);
    setSubmitting(false);
    if (r.ok) {
      setSubmitted(true);
    } else if (r.status === 409) {
      setHandleState({ status: 'unavailable', message: 'Este @negócio já não está disponível.' });
      setSubmitError('O @negócio escolhido já não está disponível. Escolha outro.');
    } else {
      setSubmitError('Não foi possível enviar a candidatura. Verifique os dados e tente novamente.');
    }
  }

  if (submitted) {
    return (
      <div className="mt-8 rounded-[20px] border border-[#e5e7eb] bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cherry/10 text-[26px]">✓</div>
        <h2 className="m-0 text-[22px] font-black text-ink">Candidatura recebida</h2>
        <p className="mx-auto mt-3 max-w-[420px] text-[15px] leading-relaxed text-ink-secondary">
          A sua candidatura foi recebida e será analisada pela equipa Banzami. Receberá um email
          assim que a sua conta for aprovada, com um link para ativar e definir o seu PIN.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 grid grid-cols-1 gap-5">
      <div>
        <label className={labelCls}>Nome do negócio *</label>
        <input className={inputCls} value={form.business_name} onChange={(e) => set('business_name', e.target.value)} placeholder="Cantina do Alex" required />
      </div>

      <div>
        <label className={labelCls}>@negócio desejado *</label>
        <div className="flex items-center rounded-[14px] border border-[#e5e7eb] bg-white px-4 focus-within:border-cherry focus-within:ring-2 focus-within:ring-cherry/20">
          <span className="text-[15px] font-bold text-ink-secondary">@</span>
          <input
            className="w-full border-0 bg-transparent px-2 py-3 text-[15px] text-ink outline-none"
            value={form.handle}
            onChange={(e) => set('handle', e.target.value)}
            placeholder="cantina_alex"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <HandleBadge state={handleState} />
        </div>
        <HandleHint state={handleState} />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Categoria</label>
          <select className={inputCls} value={form.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">Selecione…</option>
            {CATEGORIES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Email *</label>
          <input className={inputCls} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="negocio@email.com" required />
        </div>
        <div>
          <label className={labelCls}>Telefone</label>
          <input className={inputCls} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+244 ..." />
        </div>
        <div>
          <label className={labelCls}>NIF</label>
          <input className={inputCls} value={form.nif} onChange={(e) => set('nif', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>País</label>
          <input className={inputCls} value={form.country} onChange={(e) => set('country', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Cidade</label>
          <input className={inputCls} value={form.city} onChange={(e) => set('city', e.target.value)} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Endereço</label>
        <input className={inputCls} value={form.address} onChange={(e) => set('address', e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>Representante legal</label>
        <input className={inputCls} value={form.legal_representative} onChange={(e) => set('legal_representative', e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>Atividade do negócio</label>
        <input className={inputCls} value={form.business_activity} onChange={(e) => set('business_activity', e.target.value)} placeholder="Ex: restauração, retalho alimentar…" />
      </div>
      <div>
        <label className={labelCls}>Volume mensal estimado</label>
        <input className={inputCls} value={form.estimated_volume} onChange={(e) => set('estimated_volume', e.target.value)} placeholder="Ex: 500.000 Kz" />
      </div>

      {/* KYB documents — informational only; no upload in this version. */}
      <div className="rounded-[14px] border border-dashed border-[#e5e7eb] bg-cream-100 p-4">
        <p className="m-0 text-[13px] font-bold text-ink">Documentos KYB</p>
        <p className="m-0 mt-1 text-[13px] leading-relaxed text-ink-secondary">
          Na próxima etapa, a equipa Banzami poderá solicitar documentos de verificação do negócio.
        </p>
      </div>

      <label className="flex items-start gap-3 text-[14px] text-ink-secondary">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-cherry" checked={form.terms} onChange={(e) => set('terms', e.target.checked)} />
        <span>Li e aceito os termos e condições do Banzami Business. *</span>
      </label>

      {submitError && (
        <div className="rounded-[14px] border border-cherry/30 bg-cherry/[0.06] px-4 py-3 text-[14px] text-cherry">{submitError}</div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-1 inline-flex items-center justify-center rounded-[40px] bg-cherry px-8 py-4 text-[16px] font-extrabold text-white no-underline transition hover:bg-cherry-dark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? 'A enviar…' : 'Enviar candidatura'}
      </button>
    </form>
  );
}

function HandleBadge({ state }: { state: HandleState }) {
  if (state.status === 'checking') return <span className="text-[13px] text-ink-secondary">A verificar…</span>;
  if (state.status === 'available') return <span className="text-[15px] text-green-600">✓</span>;
  if (state.status === 'unavailable') return <span className="text-[15px] text-cherry">✕</span>;
  return null;
}

function HandleHint({ state }: { state: HandleState }) {
  if (state.status === 'available') return <p className="mt-1.5 text-[13px] text-green-600">Disponível</p>;
  if (state.status === 'unavailable') return <p className="mt-1.5 text-[13px] text-cherry">{state.message}</p>;
  return null;
}
