'use client';

import { useEffect, useState } from 'react';
import { getPlatformMode } from '@/lib/api';

// Global SANDBOX banner — a horizontal yellow card shown across the public site
// whenever the platform is in SANDBOX. Driven by the central platform mode (no
// rebuild needed to flip it). Hidden only when the mode is confirmed LIVE; on any
// read failure it stays visible (never assume production on error).
//
// It starts shown, not hidden. Starting hidden meant the first paint of every
// public page — and the whole of it for a reader whose JavaScript never runs —
// carried no disclosure at all, and only grew one after hydration. On a platform
// where no money is real, the disclosure is the first thing a reader is owed, so
// it is present from the first byte and withdrawn only when the mode comes back
// confirmed LIVE.
export function PlatformBanner() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    let active = true;
    void getPlatformMode().then((m) => {
      if (!active) return;
      // Production is silent — only show in SANDBOX.
      setShow(m.public_banner || m.mode !== 'LIVE');
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
