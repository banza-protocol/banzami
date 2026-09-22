'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getPlatformMode } from '@/lib/api';

// Global SANDBOX disclosure. Two presentations of the SAME truth (from the
// central platform mode; hidden only when confirmed LIVE, shown on any read
// failure — never assume production on error):
//   • Homepage ("/"): a discreet diagonal CORNER RIBBON ("Sandbox"). The full
//     disclosure (fictitious money, Financial Live unavailable) is carried
//     visibly by the hero copy there, plus an sr-only line here for assistive
//     tech — so nothing is lost.
//   • Every other page: the horizontal top bar carrying the full disclosure,
//     since those pages do not repeat it in copy.
export function PlatformBanner() {
  const pathname = usePathname();
  const [show, setShow] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let active = true;
    void getPlatformMode().then((m) => {
      if (!active) return;
      // Production is silent — only show in SANDBOX.
      setShow(m.public_banner || m.mode !== 'LIVE');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        if (y < 12) setCollapsed(false);
        else if (y > last + 4) setCollapsed(true);
        else if (y < last - 4) setCollapsed(false);
        last = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, []);

  if (!show) return null;

  // Homepage — corner ribbon (the visible full disclosure lives in the hero copy).
  if (pathname === '/') {
    return (
      <div role="status" className="pointer-events-none fixed left-0 top-0 z-[60] h-[96px] w-[96px] overflow-hidden">
        <span className="sr-only">Sandbox — dinheiro fictício. O Financial Live está indisponível.</span>
        <div className="absolute left-[-54px] top-[20px] w-[178px] -rotate-45 border-y border-amber-200/80 bg-amber-50 py-[5px] text-center text-[11.5px] font-bold tracking-[0.06em] text-amber-900 shadow-[0_6px_14px_-6px_rgba(0,0,0,0.25)]">
          Sandbox
        </div>
      </div>
    );
  }

  // Every other page — the horizontal disclosure bar (retreats on scroll down).
  return (
    <div
      role="status"
      style={{
        maxHeight: collapsed ? 0 : '2rem',
        opacity: collapsed ? 0 : 1,
        paddingTop: collapsed ? 0 : undefined,
        paddingBottom: collapsed ? 0 : undefined,
        borderBottomWidth: collapsed ? 0 : undefined,
      }}
      className="sticky top-0 z-50 flex items-center justify-center gap-2 overflow-hidden border-b border-amber-200/80 bg-amber-50 px-4 py-[3px] leading-none transition-[max-height,opacity,padding] duration-200 ease-out"
    >
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500/90" />
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-900">SANDBOX</span>
      <span aria-hidden="true" className="text-amber-300 max-[440px]:hidden">·</span>
      <span className="text-[11.5px] font-medium text-amber-800/90 max-[440px]:hidden">Dinheiro fictício — o Financial Live está indisponível.</span>
    </div>
  );
}
