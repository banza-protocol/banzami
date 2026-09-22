'use client';

// Homepage hero — official beta launch ("A forma mais simples de mover Kwanza").
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
  icon, title, meta, body, link,
}: { icon: React.ReactNode; title: string; meta: string; body: string; link?: { label: string; href: string } }) {
  return (
    <div className="rounded-[20px] border border-border-soft bg-white p-[16px] shadow-[0_20px_44px_-34px_rgba(181,16,31,.4)]">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-pink-100 text-cherry">{icon}</span>
        <div className="min-w-0">
          <p className="m-0 text-[14.5px] font-black leading-tight text-ink">{title}</p>
          <p className="m-0 mt-0.5 text-[12px] font-extrabold text-cherry">{meta}</p>
          <p className="m-0 mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-ink-secondary">{body}</p>
          {link && (
            <a href={link.href} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-black text-cherry no-underline hover:underline">
              {link.label}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function FloatPanel({
  icon, title, body, className = '',
}: { icon: React.ReactNode; title: string; body: string; className?: string }) {
  return (
    <div className={`w-[228px] rounded-[18px] border border-white/70 bg-white/85 p-[15px] shadow-[0_26px_50px_-30px_rgba(181,16,31,.45)] backdrop-blur-md ${className}`}>
      <div className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-pink-100 text-cherry">{icon}</span>
        <div>
          <p className="m-0 text-[13px] font-black leading-tight text-ink">{title}</p>
          <p className="m-0 mt-1 text-[11.5px] font-semibold leading-[1.45] text-ink-secondary">{body}</p>
        </div>
      </div>
    </div>
  );
}

export function HeroLaunch({ sandboxName, liveSummaryShort }: { sandboxName: string; liveSummaryShort: string }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<BetaPlatform>('IOS');
  function openFor(p: BetaPlatform) { setPlatform(p); setOpen(true); }

  return (
    <section id="inicio" className="relative overflow-hidden px-6 pb-10 pt-[92px] md:pt-[104px]">
      {/* Background — soft red halos behind the phone; nothing loud. */}
      <div aria-hidden className="pointer-events-none absolute -right-[140px] -top-[120px] h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.75),rgba(251,210,208,0)_66%)]" />
      <div aria-hidden className="pointer-events-none absolute right-[120px] top-[220px] hidden h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(232,67,75,.14),rgba(232,67,75,0)_68%)] lg:block" />
      <div aria-hidden className="pointer-events-none absolute -left-[180px] top-[300px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(232,67,75,.08),rgba(232,67,75,0)_66%)]" />

      <div className="relative mx-auto grid w-full max-w-container grid-cols-1 items-center gap-y-14 lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)] lg:gap-x-[clamp(40px,4vw,72px)]">
        {/* ── LEFT — story + actions ── */}
        <div className="max-w-[600px]">
          <span className="inline-flex items-center gap-2 rounded-pill bg-pink-100 px-3.5 py-1.5 text-[12.5px] font-extrabold text-cherry">
            <Dot />Lançamento beta · Sandbox pública
          </span>

          <h1 className="m-0 mt-[clamp(16px,2.4vh,24px)] text-[clamp(38px,3.4vw+1vh,62px)] font-black leading-[1.02] tracking-[-0.03em] text-ink">
            A forma mais simples de mover <span className="text-cherry">Kwanza.</span>
          </h1>

          <p className="m-0 mt-[clamp(14px,2vh,22px)] max-w-[540px] text-[clamp(15px,0.5vw+0.7vh,18px)] font-semibold leading-[1.6] text-ink-secondary">
            Envie, receba e aceite pagamentos em Kz entre pessoas, negócios e aplicações — através
            do Banzami ou integrado diretamente no seu produto.
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
              meta="QR · @banza · comprovativos verificáveis"
              body="Pagamentos rápidos, seguros e sem complicações."
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
              <a href={APP_WEB} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-[14px] border border-border-soft bg-white px-3.5 py-3 no-underline shadow-[0_10px_26px_-22px_rgba(181,16,31,.3)] transition-transform hover:-translate-y-0.5">
                <svg className="shrink-0" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2a2024" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.4 3.9 5.6 3.9 9S14.5 18.6 12 21C9.5 18.6 8.1 15.4 8.1 12S9.5 5.4 12 3z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span className="min-w-0 leading-tight"><span className="block text-[13px] font-extrabold text-ink">Beta Web</span><span className="block text-[11px] font-semibold text-ink-muted">No browser</span></span>
              </a>
              <button type="button" onClick={() => openFor('IOS')} className="flex items-center gap-2.5 rounded-[14px] border border-border-soft bg-white px-3.5 py-3 text-left shadow-[0_10px_26px_-22px_rgba(181,16,31,.3)] transition-transform hover:-translate-y-0.5">
                <svg className="shrink-0" width="22" height="22" viewBox="0 0 24 24" fill="#2a2024" aria-hidden="true"><path d="M16.4 12.9c0-2 1.6-3 1.7-3-1-1.3-2.4-1.5-2.9-1.5-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.3 0-2.6.8-3.2 2-.1.3-1.7 4.8 1.4 8.6.6.9 1.4 1.9 2.4 1.8.9 0 1.3-.6 2.4-.6s1.4.6 2.4.6 1.6-.9 2.2-1.7c.7-1 .9-2 .9-2-.1 0-1.9-.7-1.9-2.7zM14.6 6.3c.5-.7.9-1.6.8-2.5-.8 0-1.7.5-2.3 1.2-.5.6-.9 1.5-.8 2.4.9.1 1.7-.4 2.3-1.1z"/></svg>
                <span className="min-w-0 leading-tight"><span className="block text-[13px] font-extrabold text-ink">iPhone</span><span className="block text-[11px] font-semibold text-ink-muted">TestFlight</span></span>
              </button>
              <button type="button" onClick={() => openFor('ANDROID')} className="flex items-center gap-2.5 rounded-[14px] border border-border-soft bg-white px-3.5 py-3 text-left shadow-[0_10px_26px_-22px_rgba(181,16,31,.3)] transition-transform hover:-translate-y-0.5">
                <svg className="shrink-0" width="22" height="22" viewBox="0 0 24 24" fill="#2a2024" aria-hidden="true"><path d="M17.6 9.5l1.4-2.4a.4.4 0 00-.7-.4l-1.4 2.5a8.7 8.7 0 00-7.8 0L7.7 6.7a.4.4 0 00-.7.4l1.4 2.4A8 8 0 004 16h16a8 8 0 00-2.4-6.5zM9 13.6a.9.9 0 110-1.8.9.9 0 010 1.8zm6 0a.9.9 0 110-1.8.9.9 0 010 1.8z"/></svg>
                <span className="min-w-0 leading-tight"><span className="block text-[13px] font-extrabold text-ink">Android</span><span className="block text-[11px] font-semibold text-ink-muted">Google Play</span></span>
              </button>
            </div>
            <p className="m-0 mt-4 flex items-center gap-2 text-[12.5px] font-semibold text-ink-muted">
              <span className="inline-block h-[2px] w-6 rounded bg-cherry" />
              Construindo o ecossistema de pagamentos de Angola.
            </p>
          </div>
        </div>

        {/* ── RIGHT — live App Banzami Web + feature panels ── */}
        <div className="relative flex min-h-0 flex-col items-center gap-8 xl:flex-row xl:items-center xl:justify-center xl:gap-6">
          <div className="w-[300px] max-w-full shrink-0">
            <AppWebPortal />
          </div>

          {/* Feature panels — a blurred column beside the phone on xl; the two
              audience cards on the left already carry the value props below xl. */}
          <div className="hidden w-[228px] flex-col gap-4 xl:-ml-4 xl:flex">
            <FloatPanel
              className="xl:translate-x-2"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6l7-3z"/><path d="M9.2 11.6l1.9 1.9 3.7-3.7"/></svg>}
              title="Seguro por design"
              body="As suas transações protegidas com os mais altos padrões de segurança."
            />
            <FloatPanel
              className="xl:-translate-x-2"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13z"/></svg>}
              title="Liquidação instantânea"
              body="Envie e receba dinheiro em segundos, 24/7."
            />
            <FloatPanel
              className="xl:translate-x-2"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 4a2 2 0 114 0v1.5h1.5A1.5 1.5 0 0117 7v1.5a2 2 0 100 4V14a1.5 1.5 0 01-1.5 1.5H14a2 2 0 10-4 0H8.5A1.5 1.5 0 017 14v-1.5a2 2 0 100-4V7a1.5 1.5 0 011.5-1.5H10z"/></svg>}
              title="Feito para integrar"
              body="API, SDKs e webhooks para levar pagamentos Banzami ao seu produto."
            />
          </div>
        </div>
      </div>

      <BetaRegisterModal
        open={open}
        onClose={() => setOpen(false)}
        title="Participar nos testes da App Banzami"
        subtitle="A App Banzami está em Sandbox: o dinheiro é fictício e nenhum pagamento é real. Convidamos testers por etapas."
        labelledById="hero-beta-modal-title"
      >
        <BetaRegisterForm
          lang="pt"
          source="home_hero"
          offeredApps={['APP_BANZAMI']}
          lockApp
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
