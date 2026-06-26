'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { adminValidateResetToken, adminCompleteReset, AdminApiError } from '@/lib/admin-api';
import { BanzamiLogo } from '@/components/ui/brand';

const inputCls =
  'w-full rounded-[14px] border-[1.5px] border-[#f1e3e3] bg-[#FFF7F6] px-4 py-[14px] text-[15px] font-semibold text-[#2a2024] outline-none transition focus:border-[#B5101F] focus:ring-4 focus:ring-[#B5101F]/10';

type Phase =
  | { kind: 'loading' }
  | { kind: 'valid'; fullName?: string }
  | { kind: 'expired' }
  | { kind: 'used' }
  | { kind: 'invalid' }
  | { kind: 'done' };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ background: 'radial-gradient(1200px 600px at 50% -10%, #fff, #FFF7F6 60%)' }}>
      <div className="w-full max-w-[430px] rounded-[26px] border border-[#f1e3e3] bg-white px-[34px] py-[38px] shadow-[0_40px_90px_-50px_rgba(181,16,31,0.45)]">
        <div className="mb-[26px] flex items-center gap-[11px]">
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] bg-[#B5101F] shadow-[0_6px_14px_-4px_rgba(181,16,31,0.5)]">
            <BanzamiLogo size={21} />
          </span>
          <span className="text-[13px] font-black tracking-[0.16em] text-[#B5101F]">BANZADMIN</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorView({ title, hint }: { title: string; hint: string }) {
  return (
    <>
      <h1 className="m-0 text-[24px] font-black tracking-[-0.02em]">{title}</h1>
      <p className="m-0 mt-2 text-[14.5px] font-semibold leading-[1.5] text-[#7a6a6e]">{hint}</p>
      <Link href="/login" className="mt-6 inline-block text-[14px] font-extrabold text-[#B5101F]">← Ir para o login</Link>
    </>
  );
}

function ResetInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setPhase({ kind: 'invalid' });
      return;
    }
    adminValidateResetToken(token)
      .then((r) => {
        if (r.reason === 'VALID') setPhase({ kind: 'valid', fullName: r.full_name });
        else if (r.reason === 'EXPIRED') setPhase({ kind: 'expired' });
        else if (r.reason === 'USED') setPhase({ kind: 'used' });
        else setPhase({ kind: 'invalid' });
      })
      .catch(() => setPhase({ kind: 'invalid' }));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 12) {
      setError('A palavra-passe deve ter pelo menos 12 caracteres.');
      return;
    }
    if (next !== confirm) {
      setError('As palavras-passe não coincidem.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await adminCompleteReset(token, next);
      setPhase({ kind: 'done' });
    } catch (err) {
      if (err instanceof AdminApiError && err.code === 'WEAK_PASSWORD') setError('A palavra-passe deve ter pelo menos 12 caracteres.');
      else setError('O link já não é válido. Peça um novo ao administrador.');
    } finally {
      setLoading(false);
    }
  }

  if (phase.kind === 'loading') return <Shell><p className="m-0 text-[15px] font-semibold text-[#9a8a8e]">A validar o link…</p></Shell>;
  if (phase.kind === 'expired') return <Shell><ErrorView title="Link expirado" hint="Este link de palavra-passe já expirou. Peça um novo ao administrador." /></Shell>;
  if (phase.kind === 'used') return <Shell><ErrorView title="Link já utilizado" hint="Este link já foi usado. Peça um novo ao administrador." /></Shell>;
  if (phase.kind === 'invalid') return <Shell><ErrorView title="Link inválido" hint="Este link de palavra-passe não é válido. Peça um novo ao administrador." /></Shell>;

  if (phase.kind === 'done') {
    return (
      <Shell>
        <div className="flex items-center gap-2.5">
          <CheckCircle2 size={22} color="#1f9d57" strokeWidth={2} />
          <h1 className="m-0 text-[22px] font-black tracking-[-0.02em]">Palavra-passe definida</h1>
        </div>
        <p className="m-0 mt-2 text-[14.5px] font-semibold leading-[1.5] text-[#7a6a6e]">
          Palavra-passe definida com sucesso. Já pode entrar no BANZADMIN.
        </p>
        <Link href="/login" className="mt-6 inline-flex rounded-[14px] bg-[#1a1416] px-6 py-3.5 text-[15px] font-extrabold text-white">Entrar</Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="m-0 text-[24px] font-black tracking-[-0.02em]">Definir palavra-passe</h1>
      <p className="m-0 mb-5 mt-2 text-[14.5px] font-semibold text-[#9a8a8e]">
        {phase.fullName ? `Olá ${phase.fullName}. ` : ''}Escolha uma palavra-passe (mín. 12 caracteres).
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1.5 block text-[13px] font-extrabold">Nova palavra-passe</label>
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} required />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-extrabold">Confirmar palavra-passe</label>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} required />
        </div>
        {error && (
          <div className="flex items-center gap-[9px] rounded-[12px] border border-[#f6d3d1] bg-[#FFF1F0] px-[14px] py-3 text-[13.5px] font-bold text-[#B5101F]">
            <AlertCircle size={16} strokeWidth={1.8} /> {error}
          </div>
        )}
        <button type="submit" disabled={loading} className="mt-2 w-full rounded-[14px] bg-[#1a1416] py-4 text-[15.5px] font-extrabold text-white transition hover:bg-black disabled:opacity-60">
          {loading ? 'A guardar…' : 'Guardar palavra-passe'}
        </button>
      </form>
    </Shell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Shell><p className="m-0 text-[15px] font-semibold text-[#9a8a8e]">A carregar…</p></Shell>}>
      <ResetInner />
    </Suspense>
  );
}
