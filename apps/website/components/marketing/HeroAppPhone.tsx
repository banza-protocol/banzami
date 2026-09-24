'use client';

import { useState } from 'react';
import type { Lang } from '@/lib/marketing/nav';

// Teaser: marketing phone frame (bezel + Dynamic-Island pill) around the intro.
// On tap: mount the ?embed=phone iframe AND show a branded splash inside the same
// framed phone right away, so there is no blank gap while the Flutter runtime
// boots. When the iframe is ready the splash fades, revealing the app — whose
// own embed shell draws the phone (bezel + island + content, correctly spaced).
const APP_URL = 'https://app.banzami.com/?embed=phone';
const W = 300;
const H = 620;

const LogoMark = ({ s = 38 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 100 100" fill="none" aria-hidden="true"><rect x="6" y="6" width="42" height="42" rx="13" fill="#fff" /><rect x="56" y="10" width="32" height="32" rx="10" fill="#FBD2D0" /><rect x="10" y="56" width="38" height="38" rx="11" fill="#FBD2D0" /><rect x="58" y="60" width="28" height="28" rx="9" fill="#fff" /></svg>
);

/**
 * Hero phone: framed teaser → (tap) branded splash while the app loads → the
 * real web app (app.banzami.com in ?embed=phone mode), same 300×620 footprint.
 */
export function HeroAppPhone({ lang }: { lang: Lang }) {
  const [opened, setOpened] = useState(false);
  const [ready, setReady] = useState(false);
  const t = {
    l1: lang === 'en' ? 'Try the' : 'Experimente a',
    l2: lang === 'en' ? 'Banzami app' : 'app Banzami',
    sub: lang === 'en'
      ? 'Create an account, send money and see the receipt on Beta Web.'
      : 'Crie conta, envie dinheiro e veja o comprovativo na Beta Web.',
    cta: lang === 'en' ? 'Tap to open the app' : 'Toca para abrir a app',
    aria: lang === 'en' ? 'Open the Banzami web app' : 'Abrir a app web do Banzami',
    title: lang === 'en' ? 'Banzami web app' : 'App web do Banzami',
    loading: lang === 'en' ? 'Loading the app…' : 'A carregar a app…',
  };

  // Notch pill shared by the teaser and the loading splash.
  const notch = <div aria-hidden="true" style={{ position: 'absolute', top: '18px', left: '50%', transform: 'translateX(-50%)', width: '98px', height: '27px', borderRadius: '15px', background: '#160a0c', zIndex: 40 }} />;

  return (
    <div style={{ position: 'relative', filter: 'drop-shadow(0 50px 60px rgba(60,0,8,.45))' }}>
      {opened ? (
        <div style={{ position: 'relative', width: `${W}px`, height: `${H}px`, animation: 'floaty 6.5s ease-in-out infinite' }}>
          {/* The app's ?embed=phone shell renders the full device. */}
          <iframe
            src={APP_URL}
            title={t.title}
            onLoad={() => window.setTimeout(() => setReady(true), 650)}
            style={{ position: 'absolute', inset: 0, width: `${W}px`, height: `${H}px`, border: 'none', borderRadius: '48px', background: 'transparent', display: 'block' }}
            allow="clipboard-write; camera"
          />
          {/* Branded splash inside the framed phone, covering the boot gap. Fades
              out once the app is ready; harmless afterwards (pointer-events none). */}
          <div
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, borderRadius: '48px', background: '#160a0c', padding: '9px', boxShadow: '0 0 0 1px rgba(122,16,22,.08)', opacity: ready ? 0 : 1, pointerEvents: 'none', transition: 'opacity .45s ease', zIndex: 20 }}
          >
            {notch}
            <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '40px', overflow: 'hidden', background: 'radial-gradient(circle at 50% 34%,#C81824,#9A1B22 58%,#6E0E14)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '22px' }}>
              <span style={{ width: '72px', height: '72px', borderRadius: '21px', background: 'linear-gradient(150deg,#E8434B,#9A1B22)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 16px 32px -10px rgba(0,0,0,.5)' }}><LogoMark /></span>
              <span style={{ fontSize: '26px', fontWeight: 900, letterSpacing: '-.02em', color: '#fff' }}>Banzami</span>
              <span style={{ width: '34px', height: '34px', borderRadius: '50%', border: '3px solid rgba(255,255,255,.28)', borderTopColor: '#fff', animation: 'bzspin .9s linear infinite' }} />
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'rgba(255,255,255,.8)' }}>{t.loading}</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ position: 'relative', width: `${W}px`, height: `${H}px`, borderRadius: '48px', background: '#160a0c', padding: '9px', boxShadow: '0 40px 80px -30px rgba(122,16,22,.45),0 0 0 1px rgba(122,16,22,.08)', animation: 'floaty 6.5s ease-in-out infinite' }}>
          {notch}
          <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '40px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setOpened(true)}
              aria-label={t.aria}
              style={{ position: 'absolute', inset: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '34px', background: 'radial-gradient(circle at 50% 28%,#C81824,#9A1B22 58%,#6E0E14)', border: 'none', fontFamily: 'inherit' }}
            >
              <span style={{ width: '72px', height: '72px', borderRadius: '21px', background: 'linear-gradient(150deg,#E8434B,#9A1B22)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 16px 32px -10px rgba(0,0,0,.5)' }}><LogoMark /></span>
              <span style={{ margin: '24px 0 0', fontSize: '30px', fontWeight: 900, letterSpacing: '-.02em', color: '#fff', lineHeight: 1.05 }}>{t.l1}<br />{t.l2}</span>
              <span style={{ margin: '14px 0 0', fontSize: '15px', fontWeight: 600, lineHeight: 1.45, color: 'rgba(255,255,255,.8)' }}>{t.sub}</span>
              <span style={{ marginTop: '34px', width: '66px', height: '66px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'bzpulse 2.2s ease-in-out infinite' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7-11-7z" fill="#9A1B22" /></svg>
              </span>
              <span style={{ margin: '18px 0 0', fontSize: '13px', fontWeight: 800, color: '#fff' }}>{t.cta}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
