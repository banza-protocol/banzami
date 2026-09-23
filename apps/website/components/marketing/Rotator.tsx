'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Rotating-highlight wrapper (handoff site-kit initRot). Animates the direct
 * [data-ri] descendants: one active at a time, 6s each, progress bar filling,
 * hover pins/pauses. Honors prefers-reduced-motion. Children carry the exact
 * dossier markup with data-ri / data-ri-ic / data-ri-tag / data-ri-bar (+ the
 * step variant data-ri-num for numbered pills).
 */
export function Rotator({ mode = 'list', idle, className, style, children }: {
  mode?: 'list' | 'card';
  /** Idle (non-active) card background, mirrors the dossier data-rot-idle attribute. */
  idle?: string;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const its = Array.from(g.querySelectorAll<HTMLElement>('[data-ri]'));
    if (!its.length) return;
    const idle = g.getAttribute('data-idle') || (mode === 'card' ? 'rgba(255,255,255,.45)' : 'transparent');
    const idleBd = mode === 'card' ? 'rgba(181,16,31,.06)' : 'transparent';
    const st = { i: 0, h: false };
    let timer: ReturnType<typeof setInterval> | undefined;

    const set = (n: number) => {
      st.i = n;
      its.forEach((it, k) => {
        const on = k === n;
        it.style.background = on ? '#fff' : idle;
        it.style.borderColor = on ? 'rgba(181,16,31,.12)' : idleBd;
        it.style.boxShadow = on ? '0 22px 44px -26px rgba(122,16,22,.5)' : 'none';
        it.style.transform = on ? (mode === 'card' ? 'translateY(-4px)' : 'translateX(6px)') : 'none';
        const ic = it.querySelector<HTMLElement>('[data-ri-ic]');
        if (ic) { ic.style.background = on ? 'linear-gradient(150deg,#D8121F,#8E1620)' : '#FFF1F0'; ic.style.color = on ? '#fff' : '#B5101F'; ic.style.boxShadow = on ? '0 10px 20px -8px rgba(181,16,31,.6)' : 'none'; }
        const num = it.querySelector<HTMLElement>('[data-ri-num]');
        if (num) { num.style.background = on ? 'linear-gradient(150deg,#D8121F,#8E1620)' : '#FFF1F0'; num.style.color = on ? '#fff' : '#B5101F'; num.style.boxShadow = on ? '0 10px 20px -8px rgba(181,16,31,.6)' : 'none'; }
        const tag = it.querySelector<HTMLElement>('[data-ri-tag]');
        if (tag) tag.style.opacity = on ? '1' : '0';
        const bw = it.querySelector<HTMLElement>('[data-ri-bar]');
        const b = bw && (bw.firstElementChild as HTMLElement | null);
        if (bw) bw.style.opacity = on ? '1' : '0';
        if (b) { b.style.transition = 'none'; b.style.width = '0'; if (on && !st.h && !reduced) { void b.offsetWidth; b.style.transition = 'width 6s linear'; b.style.width = '100%'; } else if (on) b.style.width = '100%'; }
      });
    };
    its.forEach((it, k) => {
      it.addEventListener('mouseenter', () => { st.h = true; set(k); });
      it.addEventListener('mouseleave', () => { st.h = false; set(k); });
    });
    set(0);
    if (!reduced) timer = setInterval(() => { if (!st.h) set((st.i + 1) % its.length); }, 6000);
    return () => { if (timer) clearInterval(timer); };
  }, [mode, idle]);

  return <div ref={ref} className={className} style={style} data-idle={idle}>{children}</div>;
}
