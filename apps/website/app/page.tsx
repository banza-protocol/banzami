import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Footer } from '@/components/site/Footer';
import { AppWebPortal } from '@/components/app/AppWebPortal';
import { AppJourney } from '@/components/produto/AppJourney';
import { HowItWorks } from '@/components/site/HowItWorks';
import { HeroBetaCTA } from '@/components/site/HeroBetaCTA';
import { homepageEntities } from '@/lib/entities';
import { PUBLISHED_PACKAGES } from '@/app/developers/docs/published-packages';
import { PUBLIC_TRUTH } from '@/lib/public-truth';

// Accent dot for the hero pills: the core gently pulses while a ring pings
// outward. Decoration only — it does not mean anything is live. Both stop under
// prefers-reduced-motion.
function LiveDot({ size = 8 }: { size?: number }) {
  return (
    <span className="relative inline-flex flex-none items-center justify-center" style={{ width: size, height: size }}>
      <span className="anim-bzping absolute inset-0 rounded-full bg-cherry" />
      <span className="anim-bzdotpulse relative rounded-full bg-cherry" style={{ width: size, height: size }} />
    </span>
  );
}

// Hero marquee chips, built from the homepage entity model (duplicated so the
// -50% loop is seamless). Avatar colours cycle the existing palette — presentation
// only; the data (names, handles, counts) lives in lib/entities.ts.
const CHIP_COLORS = [
  { bg: '#FBD2D0', fg: '#B5101F' },
  { bg: '#E8434B', fg: '#fff' },
  { bg: '#FFE0DE', fg: '#B5101F' },
];
const ENTITY_CHIPS = homepageEntities.map((e, i) => ({
  initial: (e.shortName ?? e.name).charAt(0).toUpperCase(),
  label: e.handle ?? e.shortName ?? e.name,
  href: e.website,
  ...CHIP_COLORS[i % CHIP_COLORS.length],
}));

function EntityChip({ m }: { m: (typeof ENTITY_CHIPS)[number] }) {
  const cls =
    'inline-flex flex-none items-center gap-[9px] rounded-pill border border-border-soft bg-white py-[7px] pl-[7px] pr-[15px] no-underline shadow-[0_6px_16px_-10px_rgba(181,16,31,.25)]';
  const inner = (
    <>
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black"
        style={{ background: m.bg, color: m.fg }}
      >
        {m.initial}
      </span>
      <span className="bz-mono whitespace-nowrap text-[12.5px] font-semibold text-[#3a2a2e]">{m.label}</span>
    </>
  );
  // Entities with a website (e.g. DOA) open in a new tab.
  if (m.href) {
    return (
      <a href={m.href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    );
  }
  return <span className={cls}>{inner}</span>;
}

// What is available today. The strip used to show adoption counters (0 users,
// 0 merchants, 0 transactions a day), which read as a product in operation with
// nobody on it. It now states the environment model — from lib/public-truth.ts,
// the one place these facts are written.
const STATUS: { label: string; value: string; body: string; tone: 'ok' | 'off' | 'info' }[] = [
  { label: PUBLIC_TRUTH.sandbox.name.toUpperCase(), value: PUBLIC_TRUTH.sandbox.state, body: 'Self-service, com dinheiro fictício.', tone: 'ok' },
  { label: PUBLIC_TRUTH.live.name.toUpperCase(), value: PUBLIC_TRUTH.live.state, body: 'Operação financeira real desligada.', tone: 'off' },
  { label: 'API PÚBLICA', value: PUBLIC_TRUTH.apiVersion, body: 'Uma versão, documentada.', tone: 'info' },
  { label: 'SDK PUBLICADO', value: PUBLISHED_PACKAGES[0].name, body: `No registo ${PUBLISHED_PACKAGES[0].registry}.`, tone: 'info' },
];

const TONE: Record<'ok' | 'off' | 'info', string> = { ok: 'bg-[#1f9d57]', off: 'bg-ink-muted', info: 'bg-cherry' };

export const metadata: Metadata = {
  alternates: { canonical: 'https://banzami.com/' },
};

export default function HomePage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <SiteHeader />

      {/* ===================== HERO ===================== */}
      <section id="inicio" className="relative overflow-hidden px-6 pb-2 pt-[78px] md:flex md:min-h-[100svh] md:flex-col md:justify-center md:pb-[clamp(16px,3vh,40px)]">
        <div className="pointer-events-none absolute -right-[120px] -top-[120px] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.7),rgba(251,210,208,0)_66%)]" />
        <div className="pointer-events-none absolute -left-[160px] top-[240px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(232,67,75,.12),rgba(232,67,75,0)_66%)]" />
        <div className="bz-herogrid relative mx-auto grid w-full max-w-[1240px] grid-cols-1 items-center gap-12 md:grid-cols-[1fr_1.02fr] lg:gap-16">
          {/* Left column — three deliberate art-direction zones read as one
              vertically-centred block against the wider/shorter showcase phone:
                ZONE A · STORY     — badge + headline + body + environment status
                ZONE B · ACTION    — the Web / native CTAs (HeroBetaCTA)
                ZONE C · ECOSYSTEM — the connected-entities rail.
              Inter-zone spacing is height-aware but BOUNDED (clamp with vh), so
              the ecosystem sits a comfortable distance below the CTAs with real
              breathing room beneath it — it is not glued to the column's foot. */}
          <div>
            {/* ZONE A · STORY */}
            <div>
              <span className="mb-[clamp(10px,2vh,22px)] inline-flex items-center gap-2 rounded-pill bg-white px-3.5 py-1.5 text-[12.5px] font-extrabold text-cherry shadow-[0_5px_14px_-8px_rgba(181,16,31,.28)]">
                <LiveDot size={8} />Pagamentos em Kwanza, de carteira para carteira
              </span>
              <h1 className="m-0 text-[clamp(34px,1.7vw+1.9vh,56px)] font-black leading-[1.03] tracking-[-0.03em] text-ink">
                O novo caminho do Kwanza.
              </h1>
              <p className="m-0 mt-[clamp(10px,1.6vh,20px)] max-w-[568px] text-[clamp(15px,0.55vw+0.8vh,18px)] font-semibold leading-[1.5] text-ink-secondary">
                O Banzami está a construir uma plataforma financeira nativa de carteira, em que pessoas, negócios e aplicações movem valor numa
                rede programável, com interoperabilidade com os rails financeiros externos. Construída sobre o protocolo BANZA. Cada
                conta é uma carteira em Kwanza; paga-se por QR ou para um{' '}
                <span className="bz-mono font-semibold text-cherry">@banza</span>, com um comprovativo que qualquer
                pessoa pode verificar.
              </p>
              <p data-testid="home-environment-status" className="m-0 mt-[clamp(8px,1.2vh,14px)] max-w-[568px] text-[12.5px] font-semibold leading-[1.45] text-ink-muted">
                Hoje está disponível a {PUBLIC_TRUTH.sandbox.name}, para developers, com dinheiro fictício.{' '}
                {PUBLIC_TRUTH.live.summary}
              </p>
            </div>

            {/* ZONE B · ACTION — bounded STORY→ACTION separation lives on the
                CTA group's own margin (HeroBetaCTA). */}
            <HeroBetaCTA lang="pt" />

            {/* ZONE C · ECOSYSTEM — bounded gap below the CTAs, with breathing
                room beneath (never glued to the very bottom). */}
            <div className="mt-[clamp(24px,4vh,48px)] max-w-[540px]">
              <p className="m-0 mb-2 text-[11.5px] font-black tracking-[0.08em] text-ink-muted">EMPRESAS E APLICAÇÕES LIGADAS AO BANZAMI</p>
              {/* Auto-scroll marquee — same behaviour as the produto "A APP" rail
                  (AppJourney): pauses on hover, touch or keyboard focus, resumes
                  after, and honours reduced-motion. Chips duplicated so there is
                  enough width to scroll. */}
              <AppJourney className="flex gap-[10px] overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)] [-webkit-mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
                {[...ENTITY_CHIPS, ...ENTITY_CHIPS].map((m, i) => (
                  <EntityChip key={i} m={m} />
                ))}
              </AppJourney>
            </div>
          </div>

          {/* Live app preview. On mobile it stacks below the copy (sized to the
              column width); on desktop/tablet it fills the right column. The
              decorative floaties are desktop-only. */}
          <div className="relative mt-10 flex min-h-0 flex-col items-center justify-center md:mt-0">
            <div className="absolute hidden h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,rgba(232,67,75,.1),rgba(232,67,75,0)_70%)] md:block" />
            <div className="anim-floatyB absolute left-[14px] top-10 hidden h-[60px] w-[60px] rounded-[20px] bg-pink-200 md:block" />
            <div className="anim-floaty-5 absolute bottom-24 right-1 hidden h-11 w-11 rounded-[13px] bg-cherry-coral opacity-[0.85] md:block" />
            <AppWebPortal />
          </div>
        </div>
      </section>

      {/* ===================== ESTADO ATUAL ===================== */}
      <section className="px-6 pb-4 pt-2" aria-labelledby="estado-atual">
        <div className="relative mx-auto max-w-container overflow-hidden rounded-[26px] border border-white/70 bg-[linear-gradient(135deg,#FFFCFB_0%,#FFF3F1_58%,#FFE9E7_100%)] p-[clamp(18px,2.4vw,26px)] shadow-[0_30px_70px_-50px_rgba(181,16,31,.5)]">
          <h2 id="estado-atual" className="sr-only">Estado atual</h2>
          <div data-testid="home-status-strip" className="bz-stats grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STATUS.map((s) => (
              <div key={s.label} className="rounded-[18px] border border-border-soft bg-white px-[16px] py-[14px] shadow-[0_14px_30px_-26px_rgba(181,16,31,.3)]">
                <p className="m-0 flex items-center gap-2 text-[11px] font-extrabold tracking-[0.08em] text-ink-muted">
                  <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${TONE[s.tone]}`} />
                  {s.label}
                </p>
                <p className="m-0 mt-[7px] break-words text-[clamp(19px,2vw,24px)] font-black leading-tight tracking-[-0.02em] text-cherry">{s.value}</p>
                <p className="m-0 mt-[4px] text-[13px] font-semibold text-ink-secondary">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== COMO FUNCIONA (após métricas) ===================== */}
      <HowItWorks />

      {/* ===================== FOOTER (componente partilhado) ===================== */}
      <Footer />
    </main>
  );
}
