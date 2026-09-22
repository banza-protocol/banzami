'use client';

// The homepage hero's mobile-beta call to action (APP-BETA-001, homepage modal).
//
// Two premium platform buttons — iPhone (TestFlight) and Android (Google Play) —
// in place of the old developer buttons and the "not in the stores" line. Each
// opens an inline modal (no navigation, no reload) with the platform set from
// the button that was clicked, App Banzami preselected and App Banzami Business
// selectable (the tester can test one or both). The apps are given to
// invited testers only; these are NOT the official "Download on the App Store" /
// "Get it on Google Play" store badges, and we never claim a public store
// listing.

import { useState } from 'react';
import { BetaRegisterModal } from '@/components/site/BetaRegisterModal';
import { BetaRegisterForm } from '@/components/site/BetaRegisterForm';
import type { BetaPlatform } from '@/lib/beta';

type Lang = 'pt' | 'en';

const COPY = {
  pt: {
    web: 'Abrir App Banzami Web',
    webSub: 'Sandbox · dinheiro fictício',
    ios: 'Testar no iPhone',
    iosSub: 'TestFlight',
    android: 'Testar no Android',
    androidSub: 'Google Play',
    available: 'Use a App Banzami no browser agora — ou teste as apps nativas (iPhone/Android) como tester convidado.',
    modalTitle: 'Participar nos testes das apps Banzami',
    modalSubtitle:
      'As apps Banzami estão em Sandbox: o dinheiro é fictício e nenhum pagamento é real. Convidamos testers por etapas.',
    submit: 'Quero participar',
  },
  en: {
    web: 'Open App Banzami Web',
    webSub: 'Sandbox · fictitious money',
    ios: 'Test on iPhone',
    iosSub: 'TestFlight',
    android: 'Test on Android',
    androidSub: 'Google Play',
    available: 'Use Banzami in your browser now — or test the native apps (iPhone/Android) as an invited tester.',
    modalTitle: 'Join the Banzami app tests',
    modalSubtitle:
      'The Banzami apps run in Sandbox: money is fictitious and no payment is real. We invite testers in stages.',
    submit: 'Count me in',
  },
} as const;

function WebGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.4 3.9 5.6 3.9 9S14.5 18.6 12 21C9.5 18.6 8.1 15.4 8.1 12S9.5 5.4 12 3z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AppleGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.4 12.9c0-2 1.6-3 1.7-3-.9-1.4-2.4-1.5-2.9-1.6-1.2-.1-2.4.7-3 .7s-1.6-.7-2.6-.7c-1.3 0-2.6.8-3.2 2-1.4 2.4-.4 5.9 1 7.8.7.9 1.4 2 2.5 2 1 0 1.3-.6 2.5-.6s1.5.6 2.6.6 1.7-.9 2.4-1.8c.7-1 1-2 1-2.1-.1 0-2-.7-2-2.5zM14.6 6.9c.5-.7.9-1.6.8-2.5-.8 0-1.7.5-2.3 1.2-.5.6-.9 1.5-.8 2.4.9.1 1.7-.4 2.3-1.1z" />
    </svg>
  );
}

function AndroidGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 9.5c-.6 0-1 .4-1 1v5c0 .6.4 1 1 1s1-.4 1-1v-5c0-.6-.4-1-1-1zm12 0c-.6 0-1 .4-1 1v5c0 .6.4 1 1 1s1-.4 1-1v-5c0-.6-.4-1-1-1zM7.5 9v8c0 .6.4 1 1 1H9v2.5c0 .6.4 1 1 1s1-.4 1-1V18h2v2.5c0 .6.4 1 1 1s1-.4 1-1V18h.5c.6 0 1-.4 1-1V9h-11zM8 8h8c0-1.7-1-3.1-2.5-3.8l.9-1.6c.1-.2 0-.4-.1-.5-.2-.1-.4 0-.5.1l-.9 1.7c-.5-.2-1-.3-1.6-.3s-1.1.1-1.6.3l-.9-1.7c-.1-.1-.3-.2-.5-.1-.1.1-.2.3-.1.5l.9 1.6C9 4.9 8 6.3 8 8zm2-1.5c-.3 0-.5-.2-.5-.5s.2-.5.5-.5.5.2.5.5-.2.5-.5.5zm4 0c-.3 0-.5-.2-.5-.5s.2-.5.5-.5.5.2.5.5-.2.5-.5.5z" />
    </svg>
  );
}

export function HeroBetaCTA({ lang = 'pt' }: { lang?: Lang }) {
  const t = COPY[lang];
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<BetaPlatform>('IOS');

  function openFor(p: BetaPlatform) {
    setPlatform(p);
    setOpen(true);
  }

  // One primary (Web) spanning the group's full width on row 1; the two native
  // testers equal-width on row 2, so their outer edges line up exactly with the
  // primary above (HERO_CTA_OUTER_EDGES_ALIGNED, HERO_NATIVE_CTA_DIMENSIONS_EQUAL).
  //
  // The two native testers are ONE component: identical premium dark surface,
  // geometry, typography and shadow — the platform is told apart only by the
  // white logo (NATIVE_CTA_BACKGROUND_DRIFT=0, ANDROID_CTA_WHITE_VARIANT=0). The
  // fixed-width icon slot makes both titles start at the same x
  // (NATIVE_CTA_TEXT_START_ALIGNMENT=PASS).
  const nativeBtn =
    'group inline-flex w-full items-center gap-2.5 rounded-[13px] px-[13px] py-[10px] text-left text-white no-underline ' +
    'bg-gradient-to-b from-neutral-900 to-black shadow-[0_10px_22px_-16px_rgba(0,0,0,.55)] ' +
    'transition-transform hover:-translate-y-0.5 ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cherry';
  const nativeIconSlot = 'flex w-6 shrink-0 items-center justify-center';
  const nativeTitle = 'block text-[13px] font-extrabold';
  const nativeSub = 'block text-[10.5px] font-semibold text-white/70';

  return (
    <>
      <div className="mt-[clamp(12px,2.2vh,20px)] max-w-[404px]">
        {/* Row 1 — primary: open the web app (larger, full width). */}
        <a
          href="https://app.banzami.com"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="hero-open-app-web"
          className="group flex w-full items-center gap-3 rounded-[15px] bg-[linear-gradient(180deg,#B5101F,#9A1B22)] px-[17px] py-[12px] text-white no-underline shadow-[0_14px_30px_-16px_rgba(181,16,31,.5)] transition-transform hover:-translate-y-0.5"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-white/15">
            <WebGlyph />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-black tracking-[-.01em]">{t.web}</span>
            <span className="block text-[11.5px] font-semibold text-white/75">{t.webSub}</span>
          </span>
          <span aria-hidden className="ml-auto pl-2 text-[16px] text-white/70">↗</span>
        </a>

        {/* Row 2 — two equal native testers, outer edges aligned to the primary. */}
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => openFor('IOS')} className={nativeBtn}>
            <span className={nativeIconSlot}>
              <AppleGlyph />
            </span>
            <span className="leading-tight">
              <span className={nativeTitle}>{t.ios}</span>
              <span className={nativeSub}>{t.iosSub}</span>
            </span>
          </button>
          <button type="button" onClick={() => openFor('ANDROID')} className={nativeBtn}>
            <span className={nativeIconSlot}>
              <AndroidGlyph />
            </span>
            <span className="leading-tight">
              <span className={nativeTitle}>{t.android}</span>
              <span className={nativeSub}>{t.androidSub}</span>
            </span>
          </button>
        </div>
      </div>
      <p className="m-0 mt-3 max-w-[404px] text-[12px] font-semibold text-ink-muted">{t.available}</p>

      <BetaRegisterModal
        open={open}
        onClose={() => setOpen(false)}
        title={t.modalTitle}
        subtitle={t.modalSubtitle}
        labelledById="hero-beta-modal-title"
      >
        <BetaRegisterForm
          lang={lang}
          source="home_hero"
          offeredApps={['APP_BANZAMI', 'APP_MERCHANT']}
          initialApps={['APP_BANZAMI']}
          initialPlatform={platform}
          lockPlatform
          privacyHref="/privacidade"
          submitLabel={t.submit}
          autoFocus
        />
      </BetaRegisterModal>
    </>
  );
}
