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
  // Dynamic: the bar retreats as the reader moves down the page and returns the
  // moment they move up (or reach the top), so it costs no room while reading
  // but is never more than a small scroll away. It stays in the document the
  // whole time — the disclosure is collapsed, never removed — so the first paint
  // and a reader without JavaScript still carry it.
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
        // At the top it is always open; past a small threshold it follows the
        // direction of travel — away going down, back going up.
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

  // A discrete system bar — thin, sticky, no card/pill/shadow/gradient. Inspired
  // by Stripe/GitHub test-mode banners: a small-caps tag, a hairline middot, and
  // a quiet line of prose. Shown only in SANDBOX. It collapses its own height to
  // retreat, so no gap is left where it was.
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
