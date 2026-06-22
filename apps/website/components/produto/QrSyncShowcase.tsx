'use client';

import { useEffect, useState } from 'react';
import { PhoneFrame } from '@/components/app/PhoneFrame';
import { AppScreen, type FrameName } from '@/components/app/AppScreen';

// README §Solução: the mini-phone is SYNCED to the 3 chips, cycling
// Scan → Confirmar → Comprovativo. Honors prefers-reduced-motion (static).
const STEPS: { chip: string; frame: FrameName }[] = [
  { chip: 'Scan simples', frame: 'scan' },
  { chip: 'Confirmação clara', frame: 'confpag' },
  { chip: 'Comprovativo imediato', frame: 'comprovativo' },
];
const PHONE_W = 210;
const SCALE = PHONE_W / 300;

export function QrSyncShowcase() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return; // stay on the first step
    const t = setInterval(() => setI((v) => (v + 1) % STEPS.length), 2400);
    return () => clearInterval(t);
  }, []);

  const active = STEPS[i];

  return (
    <>
      <div>
        <p className="m-0 mb-[10px] text-[12px] font-black tracking-[0.06em] text-cherry">PAGAMENTO POR QR</p>
        <h3 className="m-0 text-[clamp(24px,3vw,34px)] font-black leading-[1.05] tracking-[-0.02em] text-ink">
          Pague por QR em segundos
        </h3>
        <p className="m-0 mb-5 mt-[14px] text-[16px] font-semibold leading-[1.55] text-ink-secondary">
          Escaneie, confirme e conclua o pagamento sem troco, sem terminal complexo e sem esperar por
          validações confusas.
        </p>
        <div className="flex flex-wrap gap-[10px]">
          {STEPS.map((s, idx) => {
            const on = idx === i;
            return (
              <span
                key={s.chip}
                className={`inline-flex items-center gap-[7px] rounded-pill border px-[14px] py-2 text-[13px] font-extrabold transition-colors duration-300 ${
                  on ? 'border-cherry bg-cherry text-white' : 'border-border-soft bg-white text-ink'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M5 13l4 4L19 7"
                    stroke={on ? '#fff' : '#B5101F'}
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {s.chip}
              </span>
            );
          })}
        </div>
      </div>

      <div className="flex justify-center">
        <div style={{ width: PHONE_W, height: 620 * SCALE, overflow: 'hidden' }}>
          <div style={{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width: 300, height: 620 }}>
            <PhoneFrame>
              {/* key → re-mount per step so the screen crossfades in (anim-bzfade) */}
              <div key={i} className="anim-bzfade absolute inset-0">
                <AppScreen
                  frame={active.frame}
                  valor="1 500"
                  para="@cantina-alex"
                  nota="1 Kg de Arroz"
                />
              </div>
            </PhoneFrame>
          </div>
        </div>
      </div>
    </>
  );
}
