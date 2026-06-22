'use client';

import { useEffect, useState } from 'react';

// README §Interações: "etapas do ecossistema — todas suaves (~0.55s) e em loop,
// com destaque em rosa suave (não bordô agressivo)."
// BANZA → Banzami → Utilizador/Comerciante, lighting up in sequence.
const STEPS = [
  { tag: 'BANZA', sub: 'regras e conformidade' },
  { tag: 'Banzami', sub: 'produto e experiência' },
  { tag: 'Utilizador / Comerciante', sub: 'paga, recebe e opera com simplicidade' },
];

function Arrow({ active }: { active: boolean }) {
  return (
    <div
      className="flex items-center transition-colors duration-[550ms]"
      style={{ color: active ? '#B5101F' : '#d9b9b6' }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function EcosystemFlow() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return; // stay static
    const t = setInterval(() => setActive((v) => (v + 1) % STEPS.length), 1100);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {STEPS.map((s, i) => {
        const on = i === active;
        return (
          <div key={s.tag} className="contents">
            {i > 0 && <Arrow active={active >= i} />}
            <div
              className="min-w-[180px] flex-1 rounded-[18px] border px-[18px] py-4 transition-[background,border-color,transform,box-shadow] duration-[550ms]"
              style={{
                background: on ? '#FFF1F0' : '#fff',
                borderColor: on ? '#FBD2D0' : '#F3E3E1',
                transform: on ? 'translateY(-2px)' : 'none',
                boxShadow: on ? '0 16px 34px -24px rgba(181,16,31,.4)' : 'none',
              }}
            >
              <p className="m-0 text-[15px] font-black text-cherry">{s.tag}</p>
              <p className="m-0 mt-[5px] text-[13px] font-semibold text-ink-soft">{s.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
