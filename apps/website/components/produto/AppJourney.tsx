'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// README §A app: horizontal auto-scroll journey that PAUSES on hover.
// Honors prefers-reduced-motion (no auto-scroll; manual scroll still works).
export function AppJourney({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const paused = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    let raf = 0;
    let last = 0;
    const SPEED = 0.04; // px per ms (~40px/s)
    const tick = (t: number) => {
      if (!last) last = t;
      const dt = t - last;
      last = t;
      if (!paused.current && el.scrollWidth > el.clientWidth) {
        const max = el.scrollWidth - el.clientWidth;
        let next = el.scrollLeft + dt * SPEED;
        if (next >= max - 0.5) next = 0; // loop back to the start
        el.scrollLeft = next;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={ref}
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onTouchStart={() => (paused.current = true)}
      className="mx-auto flex max-w-container gap-[26px] overflow-x-auto px-6 pb-7 pt-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(90deg,#000,#000_94%,transparent)] [-webkit-mask-image:linear-gradient(90deg,#000,#000_94%,transparent)]"
    >
      {children}
    </div>
  );
}
