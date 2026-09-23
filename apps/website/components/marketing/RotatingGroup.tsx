'use client';

import { useEffect, useRef } from 'react';
import { Icon, type IconName } from './kit';

export type RotItem = { icon: IconName; title: string; desc: string; tag?: string };

/**
 * Rotating highlight (handoff site-kit rotList/rotCards + initRot). One active
 * item at a time, 6s each, with a progress bar; hover pins and pauses. Honors
 * prefers-reduced-motion (no rotation).
 */
export function RotatingGroup({
  items,
  mode = 'list',
  cols = 3,
  panel,
  mt,
  mw,
}: {
  items: RotItem[];
  mode?: 'list' | 'card';
  cols?: number;
  panel?: boolean;
  mt?: number;
  mw?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const idle = panel ? '#FFF8F7' : mode === 'card' ? 'rgba(255,255,255,.55)' : 'transparent';
    const idleBd = mode === 'card' ? 'rgba(181,16,31,.06)' : 'transparent';
    const its = Array.from(g.querySelectorAll<HTMLElement>('[data-ri]'));
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
        const icn = it.querySelector<HTMLElement>('[data-ri-ic]');
        if (icn) {
          icn.style.background = on ? 'linear-gradient(150deg,#D8121F,#8E1620)' : '#FFF1F0';
          icn.style.color = on ? '#fff' : '#B5101F';
          icn.style.boxShadow = on ? '0 10px 20px -8px rgba(181,16,31,.6)' : 'none';
        }
        const tag = it.querySelector<HTMLElement>('[data-ri-tag]');
        if (tag) tag.style.opacity = on ? '1' : '0';
        const bw = it.querySelector<HTMLElement>('[data-ri-bar]');
        const b = bw && (bw.firstElementChild as HTMLElement | null);
        if (bw) bw.style.opacity = on ? '1' : '0';
        if (b) {
          b.style.transition = 'none';
          b.style.width = '0';
          if (on && !st.h && !reduced) {
            void b.offsetWidth;
            b.style.transition = 'width 6s linear';
            b.style.width = '100%';
          } else if (on) b.style.width = '100%';
        }
      });
    };

    its.forEach((it, k) => {
      it.addEventListener('mouseenter', () => { st.h = true; set(k); });
      it.addEventListener('mouseleave', () => { st.h = false; set(k); });
    });
    set(0);
    if (!reduced) timer = setInterval(() => { if (!st.h) set((st.i + 1) % its.length); }, 6000);
    return () => { if (timer) clearInterval(timer); };
  }, [items, mode, panel]);

  const bar = (
    <span data-ri-bar style={{ position: 'absolute', left: '16px', right: '16px', bottom: 0, height: '2px', borderRadius: '2px', background: 'rgba(181,16,31,.08)', overflow: 'hidden', opacity: 0, transition: 'opacity .6s' }}>
      <span style={{ display: 'block', height: '100%', width: 0, background: 'linear-gradient(90deg,#D8121F,#9A1B22)' }} />
    </span>
  );

  const iconSpan = (name: IconName) => (
    <span data-ri-ic style={{ flex: 'none', width: '42px', height: '42px', borderRadius: '13px', background: '#FFF1F0', color: '#B5101F', border: '1px solid rgba(181,16,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .6s,color .6s,box-shadow .6s' }}>
      <Icon name={name} color="currentColor" size={19} />
    </span>
  );

  if (mode === 'list') {
    return (
      <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: mt != null ? `${mt}px` : '26px', maxWidth: mw ? `${mw}px` : undefined }}>
        {items.map((it, i) => (
          <div key={i} data-ri style={{ position: 'relative', overflow: 'hidden', display: 'flex', gap: '14px', alignItems: 'center', padding: '13px 16px 13px 13px', borderRadius: '18px', border: '1px solid transparent', transition: 'background .6s,border-color .6s,box-shadow .6s,transform .6s cubic-bezier(.16,1,.3,1)' }}>
            {iconSpan(it.icon)}
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: '#141014' }}>{it.title}</p>
              <p style={{ margin: '3px 0 0', fontSize: '13px', lineHeight: 1.45, fontWeight: 600, color: '#8a7a7e', textWrap: 'pretty' }}>{it.desc}</p>
            </div>
            {bar}
          </div>
        ))}
      </div>
    );
  }

  const gcls = cols >= 4 ? 'bz-g4' : cols === 3 ? 'bz-g3' : 'bz-g2s';
  return (
    <div ref={ref} className={gcls} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, gap: '14px', marginTop: `${mt != null ? mt : 44}px` }}>
      {items.map((it, i) => (
        <div key={i} data-ri style={{ position: 'relative', overflow: 'hidden', padding: '20px 20px 22px', borderRadius: '22px', border: '1px solid rgba(181,16,31,.06)', background: panel ? '#FFF8F7' : 'rgba(255,255,255,.55)', transition: 'background .6s,border-color .6s,box-shadow .6s,transform .6s cubic-bezier(.16,1,.3,1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            {iconSpan(it.icon)}
            <span data-ri-tag style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', fontWeight: 600, letterSpacing: '.06em', color: '#B5101F', opacity: 0, transition: 'opacity .6s' }}>{it.tag || String(i + 1).padStart(2, '0')}</span>
          </div>
          <p style={{ margin: '16px 0 0', fontSize: '16px', fontWeight: 900, letterSpacing: '-.01em', color: '#141014' }}>{it.title}</p>
          <p style={{ margin: '6px 0 0', fontSize: '13.5px', lineHeight: 1.5, fontWeight: 600, color: '#8a7a7e', textWrap: 'pretty' }}>{it.desc}</p>
          {bar}
        </div>
      ))}
    </div>
  );
}
