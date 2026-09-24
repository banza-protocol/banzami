'use client';

import { useState } from 'react';
import type { Lang } from '@/lib/marketing/nav';

// The app draws the whole phone in embed mode — bezel, Dynamic Island, status
// bar and content, correctly spaced ("one geometry, no drift", per the app's
// web_desktop_shell). So the hero must load ?embed=phone and NOT draw its own
// frame/notch (that collided with the app's top content). We only provide the
// tap-to-open teaser (which lazy-loads the heavy Flutter runtime).
const APP_URL = 'https://app.banzami.com/?embed=phone';
const W = 300;
const H = 620;

/**
 * Hero phone: shows a teaser and, on tap, opens the REAL web app
 * (app.banzami.com in ?embed=phone mode) INSIDE the same footprint. The app's
 * embed shell is the phone; nothing here overlaps its content.
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
      <div style={{ position: 'relative', width: `${W}px`, height: `${H}px`, animation: 'floaty 6.5s ease-in-out infinite' }}>
        {opened ? (
          // The app's ?embed=phone shell renders the full device (bezel + island
          // + content). No transform, no marketing bezel — it fills this box.
          <iframe
            src={APP_URL}
            title={t.title}
            style={{ display: 'block', width: `${W}px`, height: `${H}px`, border: 'none', borderRadius: '48px', background: 'transparent' }}
            allow="clipboard-write; camera"
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpened(true)}
            aria-label={t.aria}
            style={{ position: 'absolute', inset: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '34px', borderRadius: '48px', background: 'radial-gradient(circle at 50% 28%,#C81824,#9A1B22 58%,#6E0E14)', border: 'none', fontFamily: 'inherit', boxShadow: '0 0 0 1px rgba(122,16,22,.08)' }}
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
  );
}
