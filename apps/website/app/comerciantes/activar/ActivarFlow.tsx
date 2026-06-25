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
  | { kind: 'done' };

const cardCls = 'rounded-[20px] border border-[#e5e7eb] bg-white p-8';

export function ActivarFlow() {
  const params = useSearchParams();
  const token = params.get('token') || '';

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setPhase({ kind: 'invalid' });
      return;
    }
    (async () => {
      try {
        const r: ActivationStatus = await validateActivation(token);
        if (cancelled) return;
        if (r.valid) setPhase({ kind: 'valid', businessName: r.business_name, handle: r.handle });
        else if (r.reason === 'EXPIRED') setPhase({ kind: 'expired' });
        else if (r.reason === 'USED') setPhase({ kind: 'used' });
        else setPhase({ kind: 'invalid' });
      } catch {
        if (!cancelled) setPhase({ kind: 'network' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

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
    const r = await completeActivation(token, pin);
    setBusy(false);
    if (r.ok) {
      setPin('');
      setConfirm('');
      setPhase({ kind: 'done' });
    } else if (r.status === 410) {
      setPhase(r.error === 'TOKEN_USED' ? { kind: 'used' } : { kind: 'expired' });
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
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cherry/10 text-[26px]">✓</div>
        <h2 className="m-0 text-[22px] font-black text-ink">Conta Business ativada</h2>
        <p className="mx-auto mt-3 max-w-[420px] text-[15px] leading-relaxed text-ink-secondary">
          Já pode entrar na app Banzami Business com o seu @negócio e PIN.
        </p>
        <a
          href="#"
          className="mt-6 inline-flex items-center justify-center rounded-[40px] bg-cherry px-8 py-4 text-[16px] font-extrabold text-white no-underline transition hover:bg-cherry-dark"
        >
          Abrir Banzami Business
        </a>
      </div>
    );
  }

  if (phase.kind !== 'valid') {
    const msg =
      phase.kind === 'expired'
        ? 'Este link de ativação expirou. Contacte o suporte para receber um novo.'
        : phase.kind === 'used'
          ? 'Este link de ativação já foi utilizado. Se ainda não definiu o seu PIN, contacte o suporte.'
          : phase.kind === 'network'
            ? 'Não foi possível ligar ao servidor. Verifique a ligação e tente novamente.'
            : 'Este link de ativação é inválido.';
    return (
      <div className={`${cardCls} text-center`}>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cherry/10 text-[24px] text-cherry">!</div>
        <h2 className="m-0 text-[20px] font-black text-ink">Link indisponível</h2>
        <p className="mx-auto mt-3 max-w-[420px] text-[15px] leading-relaxed text-ink-secondary">{msg}</p>
        <a href="mailto:contact@banzami.com" className="mt-5 inline-block text-[14px] font-bold text-cherry">Contactar suporte</a>
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
