'use client';

// Homepage hero — official beta launch ("O novo caminho do Kwanza.").
// Two columns: the value proposition + CTAs + audience cards + beta channels on
// the left; a premium static App Banzami mock (HeroPhone) with floating feature
// panels on the right. Speaks to end users AND developers. The native-tester
// channels reuse the shared BetaRegisterModal (invited testers only). The Sandbox
// truth line is passed in from the server (lib/public-truth.ts), never hardcoded.

import { useState } from 'react';
import { BetaRegisterModal } from '@/components/site/BetaRegisterModal';
import { BetaRegisterForm } from '@/components/site/BetaRegisterForm';
import type { BetaPlatform } from '@/lib/beta';
import { AppWebPortal } from '@/components/app/AppWebPortal';

const APP_WEB = 'https://app.banzami.com';
const DEVELOPERS_URL = 'https://developers.banzami.com/login';

function Dot() {
  return (
    <span className="relative inline-flex h-2 w-2 flex-none items-center justify-center">
      <span className="anim-bzping absolute inset-0 rounded-full bg-cherry" />
      <span className="anim-bzdotpulse relative h-2 w-2 rounded-full bg-cherry" />
    </span>
  );
}

function AudienceCard({
  icon, title, meta, body, link, href,
}: { icon: React.ReactNode; title: string; meta: string; body: string; link?: { label: string; href: string }; href?: string }) {
  const card = (
    <div className="group relative h-full rounded-[20px] border border-border-soft bg-white p-[16px] shadow-[0_20px_44px_-34px_rgba(181,16,31,.4)] transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_30px_56px_-32px_rgba(181,16,31,.55)]">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-pink-100 text-cherry transition-transform duration-200 group-hover:scale-105">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[14.5px] font-black leading-tight text-ink">{title}</p>
          <p className="m-0 mt-0.5 text-[12px] font-extrabold text-cherry">{meta}</p>
          <p className={`m-0 mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-ink-secondary ${href ? 'pr-9' : ''}`}>{body}</p>
          {link && (
            <a href={link.href} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-black text-cherry no-underline hover:underline">
              {link.label}
              <svg className="transition-transform duration-200 group-hover:translate-x-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </a>
          )}
        </div>
      </div>
      {href && (
        <span className="absolute bottom-4 right-4 grid h-9 w-9 place-items-center rounded-full bg-pink-100 text-cherry shadow-[0_6px_14px_-8px_rgba(181,16,31,.5)] transition-transform duration-200 group-hover:translate-x-0.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
      )}
    </div>
  );
  return href ? <a href={href} className="block no-underline">{card}</a> : card;
}

export function HeroLaunch({ sandboxName, liveSummaryShort }: { sandboxName: string; liveSummaryShort: string }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<BetaPlatform>('IOS');
  function openFor(p: BetaPlatform) { setPlatform(p); setOpen(true); }

  return (
    <section id="inicio" className="relative overflow-hidden bg-white px-6 pb-10 pt-[92px] md:pt-[104px]">
      {/* Hero background (handoff_hero_background) — the asset already composes
          white-left + red-silk-right. Shown whole (object-cover) so the shape is
          never cut: desktop fills the section; ≤920px it sits as a band at the
          bottom, behind the phone. White base so the left/text is always clean. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/hero-bg-red.png"
          alt=""
          className="absolute inset-x-0 bottom-0 h-[500px] w-full object-cover object-[72%_bottom] lg:inset-0 lg:h-full lg:object-center"
        />
      </div>

      <div className="relative mx-auto grid w-full max-w-container grid-cols-1 items-center gap-y-14 lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)] lg:gap-x-[clamp(40px,4vw,72px)]">
        {/* ── LEFT — story + actions ── */}
        <div className="max-w-[600px]">
          <span className="inline-flex items-center gap-2 rounded-pill bg-pink-100 px-3.5 py-1.5 text-[12.5px] font-extrabold text-cherry">
            <Dot />Beta pública · Sandbox
          </span>

          <h1 className="m-0 mt-[clamp(28px,3vh,40px)] text-[clamp(38px,3.4vw+1vh,62px)] font-black leading-[1.02] tracking-[-0.03em] text-ink">
            O novo caminho do <span className="text-cherry">Kwanza.</span>
          </h1>

          <p className="m-0 mt-[clamp(14px,2vh,22px)] max-w-[540px] text-[clamp(15px,0.5vw+0.7vh,18px)] font-semibold leading-[1.6] text-ink-secondary">
            Envie, receba e aceite pagamentos em Kz entre pessoas, negócios e aplicações — na app
            Banzami ou integrado no seu produto.
          </p>

          <p data-testid="home-environment-status" className="m-0 mt-3 max-w-[520px] text-[12.5px] font-semibold text-ink-muted">
            {sandboxName} disponível com dinheiro fictício. {liveSummaryShort}
          </p>

          {/* CTAs */}
          <div className="mt-[clamp(18px,2.6vh,26px)] flex flex-wrap items-center gap-3">
            <a
              href={APP_WEB}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="hero-open-app-web"
              className="group inline-flex items-center gap-2 rounded-[15px] bg-[linear-gradient(180deg,#B5101F,#9A1B22)] px-[22px] py-[14px] text-[15px] font-black text-white no-underline shadow-[0_16px_32px_-16px_rgba(181,16,31,.55)] transition-transform hover:-translate-y-0.5"
            >
              Abrir Beta Web
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </a>
            <a
              href="#como-funciona"
              className="group inline-flex items-center gap-2.5 rounded-[15px] border border-border-soft bg-white px-[20px] py-[13px] text-[15px] font-extrabold text-ink no-underline shadow-[0_10px_26px_-20px_rgba(181,16,31,.3)] transition-transform hover:-translate-y-0.5"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-pink-100 text-cherry">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </span>
              Ver como funciona
            </a>
          </div>

          {/* Audience cards */}
          <div className="mt-[clamp(18px,2.6vh,28px)] grid max-w-[560px] grid-cols-1 gap-3 sm:grid-cols-2">
            <AudienceCard
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0111 0"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 19a4.5 4.5 0 015.5-4.4"/></svg>}
              title="Para pessoas e negócios"
              meta="QR · @banza · comprovativos"
              body="Pagamentos rápidos, seguros e sem complicações."
              href="/produto"
            />
            <AudienceCard
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 8l-4 4 4 4M15.5 8l4 4-4 4"/></svg>}
              title="Para developers"
              meta="API · SDK · Webhooks"
              body="Integre o Banzami no seu produto e comece a testar hoje."
              link={{ label: 'Portal Developers', href: DEVELOPERS_URL }}
            />
          </div>

          {/* Beta channels — three equal cards: icon (left) + title + channel. */}
          <div className="mt-[clamp(18px,2.4vh,26px)] max-w-[560px]">
            <p className="m-0 mb-2.5 text-[11px] font-black tracking-[0.09em] text-ink-muted">DISPONÍVEL NO BETA</p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <a href={APP_WEB} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-[14px] border border-white/10 bg-ink px-4 py-2.5 no-underline shadow-[0_10px_26px_-22px_rgba(181,16,31,.3)] transition-transform hover:-translate-y-0.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-white/10 text-white">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9.2"/><path d="M2.8 12h18.4M12 2.8c2.7 2.5 4.1 5.8 4.1 9.2S14.7 18.7 12 21.2C9.3 18.7 7.9 15.4 7.9 12S9.3 5.3 12 2.8z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                <span className="min-w-0 leading-tight"><span className="block text-[13px] font-extrabold text-white">Beta Web</span><span className="block text-[11px] font-semibold text-white/55">No browser</span></span>
              </a>
              <button type="button" onClick={() => openFor('IOS')} className="flex items-center gap-2.5 rounded-[14px] border border-white/10 bg-ink px-4 py-2.5 text-left shadow-[0_10px_26px_-22px_rgba(181,16,31,.3)] transition-transform hover:-translate-y-0.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-white/10 text-white">
                  <svg width="25" height="25" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 12.54c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.1-2.01-3.77-2.04-1.6-.16-3.13.94-3.94.94-.81 0-2.07-.92-3.4-.9-1.75.03-3.36 1.02-4.26 2.58-1.82 3.15-.46 7.8 1.3 10.36.86 1.25 1.88 2.66 3.22 2.61 1.29-.05 1.78-.83 3.34-.83 1.56 0 2 .83 3.37.81 1.39-.03 2.27-1.28 3.12-2.54.98-1.46 1.39-2.87 1.41-2.94-.03-.01-2.71-1.04-2.74-4.12M14.53 5.05c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-2.99 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.3-.58 3.01-1.44"/></svg>
                </span>
                <span className="min-w-0 leading-tight"><span className="block text-[13px] font-extrabold text-white">iPhone</span><span className="block text-[11px] font-semibold text-white/55">TestFlight</span></span>
              </button>
              <button type="button" onClick={() => openFor('ANDROID')} className="flex items-center gap-2.5 rounded-[14px] border border-white/10 bg-ink px-4 py-2.5 text-left shadow-[0_10px_26px_-22px_rgba(181,16,31,.3)] transition-transform hover:-translate-y-0.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-white/10 text-white">
                  <svg width="29" height="29" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    {/* antennae */}
                    <path d="M9.3 4.7 8.2 2.9M14.7 4.7 15.8 2.9" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                    {/* head */}
                    <path d="M6.6 9a5.4 5.4 0 0 1 10.8 0z"/>
                    {/* eyes */}
                    <circle cx="9.8" cy="6.9" r="0.72" fill="#2a2024"/>
                    <circle cx="14.2" cy="6.9" r="0.72" fill="#2a2024"/>
                    {/* body */}
                    <rect x="6.6" y="9.7" width="10.8" height="7.7" rx="1.7"/>
                    {/* arms */}
                    <rect x="3.5" y="9.9" width="2" height="6" rx="1"/>
                    <rect x="18.5" y="9.9" width="2" height="6" rx="1"/>
                    {/* legs */}
                    <rect x="8.6" y="17.2" width="2" height="3.4" rx="1"/>
                    <rect x="13.4" y="17.2" width="2" height="3.4" rx="1"/>
                  </svg>
                </span>
                <span className="min-w-0 leading-tight"><span className="block text-[13px] font-extrabold text-white">Android</span><span className="block text-[11px] font-semibold text-white/55">Google Play</span></span>
              </button>
            </div>
            <p className="m-0 mt-4 flex items-center gap-2 text-[12.5px] font-semibold text-ink-muted">
              <span className="inline-block h-[2px] w-6 rounded bg-cherry" />
              Construindo o ecossistema de pagamentos de Angola.
            </p>
          </div>
        </div>

        {/* ── RIGHT — live App Banzami Web, floating over the red field ── */}
        <div className="relative flex min-h-0 items-center justify-center">
          <div className="anim-floaty w-[292px] max-w-full drop-shadow-[0_44px_74px_rgba(40,3,8,0.55)]">
            <AppWebPortal />
          </div>
        </div>
      </div>

      <BetaRegisterModal
        open={open}
        onClose={() => setOpen(false)}
        title="Participar nos testes das apps Banzami"
        subtitle="As apps Banzami estão em Sandbox: o dinheiro é fictício e nenhum pagamento é real. Convidamos testers por etapas."
        labelledById="hero-beta-modal-title"
      >
        <BetaRegisterForm
          lang="pt"
          source="home_hero"
          offeredApps={['APP_BANZAMI', 'APP_MERCHANT']}
          initialApps={['APP_BANZAMI']}
          initialPlatform={platform}
          lockPlatform
          privacyHref="/privacidade"
          submitLabel="Quero participar"
          autoFocus
        />
      </BetaRegisterModal>
    </section>
  );
}
