'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/client';

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    await apiPost('/api/auth/logout', {});
    // Replace history so the back button cannot resurrect authenticated screens
    // (§61), then hard-navigate to clear any client state.
    window.location.replace('/');
  }
  return (
    <button type="button" onClick={logout} disabled={busy} className="w-full rounded-[16px] border border-[#EBE3E3] bg-white px-5 py-4 text-[15px] font-black text-cherry-dark transition active:scale-[0.99] disabled:opacity-60">
      {busy ? 'A terminar…' : 'Terminar sessão'}
    </button>
  );
}
