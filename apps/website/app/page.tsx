import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Footer } from '@/components/site/Footer';
import { HowItWorks } from '@/components/site/HowItWorks';
import { HeroLaunch } from '@/components/site/HeroLaunch';
import { PUBLISHED_PACKAGES } from '@/app/developers/docs/published-packages';
import { PUBLIC_TRUTH } from '@/lib/public-truth';

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
      <HeroLaunch
        sandboxName={PUBLIC_TRUTH.sandbox.name}
        liveSummaryShort={PUBLIC_TRUTH.live.summaryShort}
      />

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
