'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { saveSession } from '@/lib/session';
import { adminLogin, AdminApiError } from '@/lib/admin-api';
import { BanzamiLogo } from '@/components/ui/brand';

const inputCls =
  'w-full rounded-[14px] border-[1.5px] border-[#f1e3e3] bg-[#FFF7F6] px-4 py-[14px] text-[15px] font-semibold text-[#2a2024] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#B5101F] focus:ring-4 focus:ring-[#B5101F]/10';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Email ou palavra-passe inválidos.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const r = await adminLogin(email.trim(), password);
      saveSession({ token: r.token, user: r.user });
      router.replace('/');
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 429) {
        setError('Muitas tentativas. Tente novamente mais tarde.');
      } else {
        // Always generic — never reveal whether the email exists.
        setError('Email ou palavra-passe inválidos.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: 'radial-gradient(1200px 600px at 50% -10%, #fff, #FFF7F6 60%)' }}
    >
      <div className="w-full max-w-[430px] rounded-[26px] border border-[#f1e3e3] bg-white px-[34px] py-[38px] shadow-[0_40px_90px_-50px_rgba(181,16,31,0.45)]">
        <div className="mb-[26px] flex items-center gap-[11px]">
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] bg-[#B5101F] shadow-[0_6px_14px_-4px_rgba(181,16,31,0.5)]">
            <BanzamiLogo size={21} />
          </span>
          <span className="text-[13px] font-black tracking-[0.16em] text-[#B5101F]">BANZADMIN</span>
        </div>
        <h1 className="m-0 text-[27px] font-black tracking-[-0.02em]">Painel de Operações</h1>
        <p className="m-0 mb-[26px] mt-2 text-[15px] font-semibold text-[#9a8a8e]">
          Acesso reservado aos operadores autorizados.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="mb-2 block text-[13px] font-extrabold">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            placeholder="operador@banzami.com"
            className={`${inputCls} mb-[18px]`}
            required
          />

          <label className="mb-2 block text-[13px] font-extrabold">Palavra-passe</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••••••••••"
            className={inputCls}
            style={error ? { borderColor: '#f0a9a9' } : undefined}
            required
          />

          {error && (
            <div className="mt-[14px] flex items-center gap-[9px] rounded-[12px] border border-[#f6d3d1] bg-[#FFF1F0] px-[14px] py-3 text-[13.5px] font-bold text-[#B5101F]">
              <AlertCircle size={16} strokeWidth={1.8} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-[14px] bg-[#1a1416] py-4 text-[15.5px] font-extrabold text-white transition-[background,transform] duration-150 hover:-translate-y-px hover:bg-black disabled:opacity-60"
          >
            {loading ? 'A entrar…' : 'Entrar'}
          </button>
        </form>
        <p className="m-0 mt-[18px] text-center text-[12.5px] font-semibold text-[#b09498]">
          Todas as acções são auditadas.
        </p>
      </div>
    </div>
  );
}
