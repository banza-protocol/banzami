'use client';

import { useEffect, useState } from 'react';
import { getPlatformMode } from '@/lib/api';

// Global SANDBOX banner — a horizontal yellow card shown across the public site
// whenever the platform is in SANDBOX. Driven by the central platform mode (no
// rebuild needed to flip it). Hidden only when the mode is confirmed LIVE; on any
// read failure it stays visible (never assume production on error).
export function PlatformBanner() {
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState('Ambiente de testes. A plataforma ainda não está em produção real.');

  useEffect(() => {
    let active = true;
    void getPlatformMode().then((m) => {
      if (!active) return;
      setShow(m.public_banner || m.mode === 'SANDBOX');
      if (m.message) setMessage(m.message);
    });
    return () => { active = false; };
  }, []);

  if (!show) return null;

  return (
    <div role="status" className="flex items-center justify-center gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2.5 text-center">
      <span className="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-amber-500 text-[12px] font-black text-white">!</span>
      <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-white">Sandbox</span>
      <span className="text-[13px] font-bold text-amber-900">{message}</span>
    </div>
  );
}
