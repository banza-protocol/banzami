'use client';

import { useEffect, useState } from 'react';
import { getPlatformMode } from '@/lib/api';

// Global SANDBOX disclosure — a discreet diagonal CORNER RIBBON ("Sandbox") in the
// top-left, shown on EVERY public page whenever the platform is in SANDBOX (driven
// by the central platform mode; hidden only when confirmed LIVE, and kept visible
// on any read failure — never assume production on error).
//
// The ribbon shows the short label; the full disclosure (fictitious money, Financial
// Live unavailable) is kept in the DOM as an sr-only line for assistive tech and
// crawlers, and the homepage also states it visibly in the hero copy.
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

  return (
    <div role="status" className="pointer-events-none fixed left-0 top-0 z-[60] h-[96px] w-[96px] overflow-hidden">
      <span className="sr-only">Ambiente SANDBOX — dinheiro fictício. As operações com dinheiro real estão indisponíveis.</span>
      <div className="absolute left-[-54px] top-[20px] w-[178px] -rotate-45 border-y border-amber-200/80 bg-amber-50 py-[5px] text-center text-[11.5px] font-bold tracking-[0.06em] text-amber-900 shadow-[0_6px_14px_-6px_rgba(0,0,0,0.25)]">
        Sandbox
      </div>
    </div>
  );
}
