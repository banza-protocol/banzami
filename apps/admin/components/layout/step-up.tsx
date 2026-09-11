'use client';

// The step-up prompt (A5-08).
//
// The highest-risk actions — creating an operator, changing a role, resetting
// someone else's access, pricing, settlements, payouts, freezes, Business
// credentials, the platform mode — answer 403 STEP_UP_REQUIRED unless the
// operator proved a code from their authenticator in the last five minutes.
// The API client (lib/admin-api.ts) catches that, calls the prompt registered
// here, sends the code to /auth/step-up and retries the action once. The page
// that started the action sees either its normal result or, if the operator
// cancels, the refusal.
//
// Its own portal, above every other modal: the action that needs the code is
// often confirmed from inside another dialog that is still open.

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck } from 'lucide-react';
import { setStepUpPrompt } from '@/lib/admin-api';

type Pending = { error?: string; resolve: (code: string | null) => void };

const btnBase = 'rounded-[12px] px-5 py-2.5 text-[14px] font-extrabold transition disabled:opacity-50';
const inputCls =
  'w-full rounded-[14px] border-[1.5px] border-[#f1e3e3] bg-[#FFF7F6] px-4 py-3 text-center font-mono text-[20px] font-semibold tracking-[0.3em] text-[#2a2024] outline-none transition focus:border-[#B5101F] focus:ring-4 focus:ring-[#B5101F]/10';

export function StepUpProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const prompt = useCallback(
    (opts: { error?: string }) => new Promise<string | null>((resolve) => setPending({ error: opts.error, resolve })),
    [],
  );

  useEffect(() => {
    setStepUpPrompt(prompt);
    return () => setStepUpPrompt(null);
  }, [prompt]);

  return (
    <>
      {children}
      {pending && (
        <StepUpDialog
          key={pending.error ?? 'first'}
          error={pending.error}
          onDone={(code) => { pending.resolve(code); setPending(null); }}
        />
      )}
    </>
  );
}

export function StepUpDialog({ error, onDone }: { error?: string; onDone: (code: string | null) => void }) {
  const [code, setCode] = useState('');
  const ready = code.trim().length >= 6;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ready) onDone(code.trim());
  };
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="step-up-title">
      <form
        onSubmit={submit}
        className="w-full max-w-[420px] rounded-[20px] border border-[#f1e3e3] bg-white p-7 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.4)]"
      >
        <div className="mb-3 flex items-center gap-2.5">
          <ShieldCheck size={22} strokeWidth={1.8} color="#B5101F" />
          <h2 id="step-up-title" className="m-0 text-[18px] font-black tracking-[-0.01em]">Confirmar com o autenticador</h2>
        </div>
        <p className="m-0 text-[14px] font-semibold leading-[1.5] text-[#5a4a4e]">
          Esta ação é sensível. Introduza o código de 6 dígitos da sua app autenticadora — fica válido para
          ações sensíveis durante 5 minutos.
        </p>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          aria-label="Código do autenticador"
          className={`${inputCls} mt-5`}
        />
        {error && <p role="alert" className="m-0 mt-3 text-[13px] font-bold text-[#B5101F]">{error}</p>}
        <p className="m-0 mt-3 text-[12px] font-semibold text-[#9a8a8e]">
          Sem acesso à app? Um código de recuperação também serve — e deixa de valer depois de usado.
        </p>
        <div className="mt-6 flex justify-end gap-2.5">
          <button type="button" onClick={() => onDone(null)} className={`${btnBase} border-[1.5px] border-[#f1e3e3] bg-white text-[#5a4a4e] hover:bg-[#FFF7F6]`}>
            Cancelar
          </button>
          <button type="submit" disabled={!ready} className={`${btnBase} bg-[#B5101F] text-white hover:bg-[#9A1B22]`}>
            Confirmar
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
