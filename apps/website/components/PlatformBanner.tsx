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

  // A discrete system bar — thin, sticky, no card/pill/shadow/gradient. Inspired
  // by Stripe/GitHub test-mode banners. Shown only in SANDBOX.
  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-[7px] text-[12.5px] leading-none"
    >
      <span className="font-extrabold text-amber-900">🟡 SANDBOX</span>
      <span className="font-semibold text-amber-800 max-[440px]:hidden">Esta plataforma encontra-se em ambiente de testes.</span>
    </div>
  );
}
