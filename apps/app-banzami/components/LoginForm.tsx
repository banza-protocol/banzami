'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiPost } from '@/lib/client';

const field = 'w-full rounded-[14px] border border-[#E7E0E0] bg-white px-4 py-3.5 text-[16px] text-ink outline-none transition focus:border-cherry focus:ring-4 focus:ring-cherry/10';
const label = 'mb-1.5 block text-[13px] font-bold text-ink-soft';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [handle, setHandle] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const h = handle.trim().toLowerCase().replace(/^@/, '');
    if (!h || !pin) return setErr('Indique o @banza e o PIN.');
    setBusy(true);
    const r = await apiPost<{ message?: string }>('/api/auth/login', { handle: h, pin });
    setBusy(false);
    if (r.ok) {
      const next = params.get('next');
      router.replace(next && next.startsWith('/') ? next : '/inicio');
      router.refresh();
      return;
    }
    setErr(r.data.message ?? '@banza ou PIN incorretos.');
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4">
      <div>
        <label htmlFor="h" className={label}>O seu @banza</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-bold text-ink-muted">@</span>
          <input id="h" className={`${field} pl-8`} value={handle} onChange={(e) => setHandle(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus placeholder="ana" />
        </div>
      </div>
      <div>
        <label htmlFor="p" className={label}>PIN</label>
        <input id="p" className={field} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" autoComplete="current-password" maxLength={8} placeholder="••••" />
      </div>
      {err && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13.5px] font-medium text-red-800">{err}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-[16px] bg-gradient-to-b from-cherry to-cherry-dark px-5 py-4 text-[16px] font-black text-white transition active:scale-[0.99] disabled:opacity-60">
        {busy ? 'A entrar…' : 'Entrar'}
      </button>
    </form>
  );
}
