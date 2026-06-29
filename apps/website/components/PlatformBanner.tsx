'use client';

import { useEffect, useState } from 'react';
import { getPlatformMode } from '@/lib/api';

// Global SANDBOX banner — a horizontal yellow card shown across the public site
// whenever the platform is in SANDBOX. Driven by the central platform mode (no
// rebuild needed to flip it). Hidden only when the mode is confirmed LIVE; on any
// read failure it stays visible (never assume production on error).
export function PlatformBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let active = true;
    void getPlatformMode().then((m) => {
      if (!active) return;
      // Production is silent — only show in SANDBOX.
      setShow(m.public_banner || m.mode === 'SANDBOX');
    });
    return () => { active = false; };
  }, []);

  if (!show) return null;

  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-300 bg-amber-100 px-4 py-2.5 text-center">
      <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-white">🟨 Sandbox</span>
      <span className="text-[13px] font-bold text-amber-900">
        Esta plataforma encontra-se atualmente em ambiente de testes. Os dados e operações efetuados não representam produção.
      </span>
    </div>
  );
}
