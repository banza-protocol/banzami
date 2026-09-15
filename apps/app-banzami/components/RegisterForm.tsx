'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/client';

const field = 'w-full rounded-[14px] border border-[#E7E0E0] bg-white px-4 py-3.5 text-[16px] text-ink outline-none transition focus:border-cherry focus:ring-4 focus:ring-cherry/10';
const label = 'mb-1.5 block text-[13px] font-bold text-ink-soft';

export function RegisterForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const h = handle.trim().toLowerCase().replace(/^@/, '');
    if (h.length < 3 || h.length > 30) return setErr('O @banza deve ter entre 3 e 30 caracteres.');
    if (!/^[a-z0-9_]+$/.test(h)) return setErr('O @banza só pode ter letras, números e _.');
    if (!/^[0-9]{4,8}$/.test(pin)) return setErr('O PIN deve ter entre 4 e 8 dígitos.');
    if (pin !== pin2) return setErr('Os PINs não coincidem.');
    setBusy(true);
    const r = await apiPost<{ code?: string; message?: string }>('/api/auth/register', {
      handle: h, pin, display_name: displayName.trim() || undefined,
    });
    setBusy(false);
    if (r.ok) { router.replace('/inicio'); router.refresh(); return; }
    setErr(r.data.message ?? 'Não foi possível criar a conta.');
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4">
      <div>
        <label htmlFor="dn" className={label}>Nome</label>
        <input id="dn" className={field} value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" placeholder="O seu nome" />
      </div>
      <div>
        <label htmlFor="h" className={label}>O seu @banza</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-bold text-ink-muted">@</span>
          <input id="h" className={`${field} pl-8`} value={handle} onChange={(e) => setHandle(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="ana" />
        </div>
        <p className="mt-1 text-[12px] text-ink-muted">É como as pessoas o pagam — sem IBAN.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="p1" className={label}>PIN</label>
          <input id="p1" className={field} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" autoComplete="new-password" maxLength={8} placeholder="••••" />
        </div>
        <div>
          <label htmlFor="p2" className={label}>Confirmar PIN</label>
          <input id="p2" className={field} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" autoComplete="new-password" maxLength={8} placeholder="••••" />
        </div>
      </div>
      {err && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13.5px] font-medium text-red-800">{err}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-[16px] bg-gradient-to-b from-cherry to-cherry-dark px-5 py-4 text-[16px] font-black text-white transition active:scale-[0.99] disabled:opacity-60">
        {busy ? 'A criar…' : 'Criar conta'}
      </button>
    </form>
  );
}
