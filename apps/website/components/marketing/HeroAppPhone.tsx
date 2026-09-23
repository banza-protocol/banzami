'use client';

import { useState } from 'react';
import type { Lang } from '@/lib/marketing/nav';

const APP_URL = 'https://app.banzami.com/';

/**
 * Hero phone (handoff "Banza App Demo"): shows the intro screen and, on tap,
 * opens the REAL web app (app.banzami.com) INSIDE the same phone (embedded),
 * not in a new tab. No inline demo — the app web is real.
 */
export function HeroAppPhone({ lang }: { lang: Lang }) {
  const [opened, setOpened] = useState(false);
  const t = {
    l1: lang === 'en' ? 'Try the' : 'Experimente a',
    l2: lang === 'en' ? 'Banzami app' : 'app Banzami',
    sub: lang === 'en'
      ? 'Create an account, send money and see the receipt on Beta Web.'
      : 'Crie conta, envie dinheiro e veja o comprovativo na Beta Web.',
    cta: lang === 'en' ? 'Tap to open the app' : 'Toca para abrir a app',
    aria: lang === 'en' ? 'Open the Banzami web app' : 'Abrir a app web do Banzami',
    title: lang === 'en' ? 'Banzami web app' : 'App web do Banzami',
  };
  return (
    <div style={{ position: 'relative', filter: 'drop-shadow(0 50px 60px rgba(60,0,8,.45))' }}>
      <div style={{ position: 'relative', width: '300px', height: '540px', borderRadius: '48px', background: '#160a0c', padding: '9px', boxShadow: '0 40px 80px -30px rgba(122,16,22,.45),0 0 0 1px rgba(122,16,22,.08)', animation: 'floaty 6.5s ease-in-out infinite' }}>
        <div aria-hidden="true" style={{ position: 'absolute', top: '18px', left: '50%', transform: 'translateX(-50%)', width: '98px', height: '27px', borderRadius: '15px', background: '#160a0c', zIndex: 40 }} />
        <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '40px', overflow: 'hidden' }}>
          {opened ? (
            // Render the app at a real phone width (390px) and scale it down to
            // fit the frame, so the layout is a proper phone layout (no overflow).
            // Inner screen ≈ 282×602; 390 × (282/390) = 282, 833 × 0.7231 ≈ 602.
            <iframe
              src={APP_URL}
              title={t.title}
              style={{ position: 'absolute', top: 0, left: 0, width: '390px', height: '722px', transform: 'scale(0.72308)', transformOrigin: 'top left', border: 'none', background: '#9A1B22' }}
              allow="clipboard-write; camera"
            />
          ) : (
            <button
              type="button"
              onClick={() => setOpened(true)}
              aria-label={t.aria}
              style={{ position: 'absolute', inset: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '34px', background: 'radial-gradient(circle at 50% 28%,#C81824,#9A1B22 58%,#6E0E14)', border: 'none', fontFamily: 'inherit' }}
            >
              <span style={{ width: '72px', height: '72px', borderRadius: '21px', background: 'linear-gradient(150deg,#E8434B,#9A1B22)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 16px 32px -10px rgba(0,0,0,.5)' }}>
                <svg width="38" height="38" viewBox="0 0 100 100" fill="none"><rect x="6" y="6" width="42" height="42" rx="13" fill="#fff" /><rect x="56" y="10" width="32" height="32" rx="10" fill="#FBD2D0" /><rect x="10" y="56" width="38" height="38" rx="11" fill="#FBD2D0" /><rect x="58" y="60" width="28" height="28" rx="9" fill="#fff" /></svg>
              </span>
              <span style={{ margin: '24px 0 0', fontSize: '30px', fontWeight: 900, letterSpacing: '-.02em', color: '#fff', lineHeight: 1.05 }}>{t.l1}<br />{t.l2}</span>
              <span style={{ margin: '14px 0 0', fontSize: '15px', fontWeight: 600, lineHeight: 1.45, color: 'rgba(255,255,255,.8)' }}>{t.sub}</span>
              <span style={{ marginTop: '34px', width: '66px', height: '66px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'bzpulse 2.2s ease-in-out infinite' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7-11-7z" fill="#9A1B22" /></svg>
              </span>
              <span style={{ margin: '18px 0 0', fontSize: '13px', fontWeight: 800, color: '#fff' }}>{t.cta}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
