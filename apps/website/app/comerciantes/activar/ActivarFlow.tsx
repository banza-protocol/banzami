'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  validateActivation,
  completeActivation,
  isValidPin,
  type ActivationStatus,
} from '@/lib/api';

type Phase =
  | { kind: 'loading' }
  | { kind: 'valid'; businessName?: string; handle?: string }
  | { kind: 'expired' }
  | { kind: 'used' }
  | { kind: 'invalid' }
  | { kind: 'network' }
  // No answer about the link: the gateway failed, or asked us to slow down.
  // Neither says anything about the link, so neither may call it invalid.
  | { kind: 'unavailable' }
  | { kind: 'rate_limited' }
  | { kind: 'done' };

const cardCls = 'rounded-[20px] border border-[#e5e7eb] bg-white p-8';

/** The gateway's answer, as a phase. Only a verdict about the link may say invalid. */
export function phaseFor(r: ActivationStatus): Phase {
  if (r.valid) return { kind: 'valid', businessName: r.business_name, handle: r.handle };
  switch (r.reason) {
    case 'EXPIRED': return { kind: 'expired' };
    case 'USED': return { kind: 'used' };
    case 'RATE_LIMITED': return { kind: 'rate_limited' };
    case 'UNAVAILABLE': return { kind: 'unavailable' };
    default: return { kind: 'invalid' };
  }
}

/** What each non-valid phase tells the owner, and whether retrying can help. */
export function unavailableCopy(kind: Exclude<Phase['kind'], 'valid' | 'loading' | 'done'>): { title: string; message: string; retry: boolean } {
  switch (kind) {
    case 'expired':
      return { title: 'Link indisponível', message: 'Este link de ativação expirou. Contacte o suporte para receber um novo.', retry: false };
    case 'used':
      return { title: 'Link indisponível', message: 'Este link de ativação já foi utilizado. Se ainda não definiu o seu PIN, contacte o suporte.', retry: false };
    case 'network':
      return { title: 'Sem ligação', message: 'Não foi possível ligar ao servidor. Verifique a ligação e tente novamente.', retry: true };
    case 'unavailable':
      return { title: 'Ativação indisponível de momento', message: 'Não foi possível validar o seu link neste momento. O link não foi usado — tente novamente dentro de instantes.', retry: true };
    case 'rate_limited':
      return { title: 'Demasiadas tentativas', message: 'Recebemos muitos pedidos seguidos. Aguarde um momento e tente novamente.', retry: true };
    case 'invalid':
    default:
      return { title: 'Link indisponível', message: 'Este link de ativação é inválido.', retry: false };
  }
}

// Best-effort open of the installed Banzami Business app via its registered URL
// scheme. There is no Business-specific deep link or public store URL yet, so
// this is a progressive enhancement — the on-screen fallback guides the user if
// it no-ops (app not installed / opened on desktop). No broken https link.
const BUSINESS_APP_SCHEME = 'banzami://';

function openBusinessApp() {
  window.location.href = BUSINESS_APP_SCHEME;
}

export function ActivarFlow() {
  const params = useSearchParams();
  const token = params.get('token') || '';

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setPhase({ kind: 'invalid' });
      return;
    }
    setPhase({ kind: 'loading' });
    (async () => {
      try {
        const r: ActivationStatus = await validateActivation(token);
        if (cancelled) return;
        setPhase(phaseFor(r));
      } catch {
        if (!cancelled) setPhase({ kind: 'network' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  async function onComplete(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidPin(pin)) {
      setError('O PIN deve ter 4 a 8 dígitos.');
      return;
    }
    if (pin !== confirm) {
      setError('Os PINs não coincidem.');
      return;
    }
    setBusy(true);
    let r: Awaited<ReturnType<typeof completeActivation>>;
    try {
      r = await completeActivation(token, pin);
    } catch {
      setBusy(false);
      setError('Não foi possível ligar ao servidor. Verifique a ligação e tente novamente.');
      return;
    }
    setBusy(false);
    if (r.ok) {
      setPin('');
      setConfirm('');
      setPhase({ kind: 'done' });
    } else if (r.status === 410) {
      setPhase(r.error === 'TOKEN_USED' ? { kind: 'used' } : { kind: 'expired' });
    } else if (r.status === 429) {
      setError('Demasiadas tentativas. Aguarde um momento e tente novamente.');
    } else {
      setError('Não foi possível ativar. Tente novamente.');
    }
  }

  if (phase.kind === 'loading') {
    return <div className={cardCls}><p className="m-0 text-center text-ink-secondary">A validar o seu link…</p></div>;
  }

  if (phase.kind === 'done') {
    return (
      <div className={`${cardCls} text-center`}>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#e7f7ee] text-[26px] font-black text-[#1f9d57]">✓</div>
        <h2 className="m-0 text-[22px] font-black text-ink">Conta Business ativada</h2>
        <p className="mx-auto mt-3 max-w-[420px] text-[15px] leading-relaxed text-ink-secondary">
          Já pode entrar na app Banzami Business com o seu @negócio e PIN.
        </p>
        <button
          type="button"
          onClick={openBusinessApp}
          className="mt-6 inline-flex items-center justify-center rounded-[40px] bg-cherry px-8 py-4 text-[16px] font-extrabold text-white transition hover:bg-cherry-dark"
        >
          Abrir Banzami Business
        </button>
        <p className="mx-auto mt-4 max-w-[420px] text-[13px] leading-relaxed text-ink-secondary">
          Se a app não abrir, abra manualmente a app Banzami Business e entre com o seu @negócio.
        </p>
      </div>
    );
  }

  if (phase.kind !== 'valid') {
    const { title, message, retry } = unavailableCopy(phase.kind);
    return (
      <div className={`${cardCls} text-center`}>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cherry/10 text-[24px] text-cherry">!</div>
        <h2 className="m-0 text-[20px] font-black text-ink">{title}</h2>
        <p className="mx-auto mt-3 max-w-[420px] text-[15px] leading-relaxed text-ink-secondary">{message}</p>
        {retry && (
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-5 inline-flex items-center justify-center rounded-[40px] bg-cherry px-7 py-3 text-[15px] font-extrabold text-white transition hover:bg-cherry-dark"
          >
            Tentar novamente
          </button>
        )}
        <a href="mailto:contact@banzami.com" className="mt-5 block text-[14px] font-bold text-cherry">Contactar suporte</a>
      </div>
    );
  }

  return (
    <form onSubmit={onComplete} className={cardCls}>
      <h2 className="m-0 text-[22px] font-black text-ink">Definir o seu PIN</h2>
      <p className="m-0 mt-2 text-[15px] leading-relaxed text-ink-secondary">
        {phase.businessName ? <strong>{phase.businessName}</strong> : 'A sua conta'}
        {phase.handle ? <> — @{phase.handle}</> : null}
      </p>
      <p className="m-0 mt-1 text-[13px] text-ink-secondary">Escolha um PIN de 4 a 8 dígitos para entrar na app.</p>

      <div className="mt-6 grid grid-cols-1 gap-4">
        <input
          className="w-full rounded-[14px] border border-[#e5e7eb] bg-white px-4 py-3 text-[15px] text-ink outline-none transition focus:border-cherry focus:ring-2 focus:ring-cherry/20"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          placeholder="Novo PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
        />
        <input
          className="w-full rounded-[14px] border border-[#e5e7eb] bg-white px-4 py-3 text-[15px] text-ink outline-none transition focus:border-cherry focus:ring-2 focus:ring-cherry/20"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          placeholder="Confirmar PIN"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
        />
      </div>

      {error && <p className="mt-3 text-[14px] text-cherry">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="mt-6 inline-flex w-full items-center justify-center rounded-[40px] bg-cherry px-8 py-4 text-[16px] font-extrabold text-white transition hover:bg-cherry-dark disabled:opacity-40"
      >
        {busy ? 'A ativar…' : 'Ativar conta'}
      </button>
    </form>
  );
}
