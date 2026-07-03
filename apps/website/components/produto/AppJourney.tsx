'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// README §A app: horizontal auto-scroll journey that PAUSES while the user
// interacts with it — hover, touch, OR keyboard focus of anything inside — and
// resumes when the interaction ends. Honors prefers-reduced-motion (no
// auto-scroll; native/manual scroll still works). Shared by the produto "A APP"
// screens rail and the homepage merchant marquee, so both behave identically.
const DEFAULT_CLASS =
  'mx-auto flex max-w-container gap-[26px] overflow-x-auto px-6 pb-7 pt-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(90deg,#000,#000_94%,transparent)] [-webkit-mask-image:linear-gradient(90deg,#000,#000_94%,transparent)]';

export function AppJourney({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const paused = useRef(false);

  // Single place to flip the pause flag; also mirrors it to a DOM attribute so
  // the state is observable (and unit-testable) without forcing a re-render.
  const setPaused = (v: boolean) => {
    paused.current = v;
    if (ref.current) ref.current.dataset.paused = String(v);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return; // no auto-scroll; the container is still natively scrollable

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
      data-paused="false"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      // Keyboard focus into any child (a chip/link) pauses; focus leaving the
      // whole rail resumes. This is the focus-within equivalent.
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
      className={className ?? DEFAULT_CLASS}
    >
      {children}
    </div>
  );
}
