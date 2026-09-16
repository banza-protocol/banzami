import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { CTASection } from '@/components/site/CTASection';
import { CLOSING_CTAS } from '@/lib/closing-ctas';
import { Footer } from '@/components/site/Footer';
import { Reveal } from '@/components/Reveal';
import { type FrameName } from '@/components/app/AppScreen';
import { ScaledPhone } from '@/components/app/ScaledPhone';
import { PhoneFrame } from '@/components/app/PhoneFrame';
import { AppScreen } from '@/components/app/AppScreen';
import { QrSyncShowcase } from '@/components/produto/QrSyncShowcase';
import { AppJourney } from '@/components/produto/AppJourney';
import { PUBLIC_TRUTH } from '@/lib/public-truth';

// /produto — the Consumer App page (PUBLIC-WEBSITE-RELEASE-001 §12).
// Audience: the person who pays and receives. Merchant acceptance lives on
// /comerciantes, the developer platform on /developers, trust/security on
// /seguranca, and the BANZA relationship on /sobre. This page explains ONE thing:
// the App Banzami — pay/send, receive, receipts — and where to get it.

export const metadata: Metadata = {
  title: 'App Banzami',
  description:
    'A App Banzami: pagar por QR ou para um @banza, receber, e um comprovativo que qualquer pessoa pode verificar. No browser (Sandbox) e em testes no iPhone e Android.',
  alternates: { canonical: 'https://banzami.com/produto' },
  openGraph: {
    title: 'App Banzami — pagar, receber e verificar',
    description: 'Pagar por QR ou para um @banza, com um comprovativo verificável. Uma app: Web, iPhone e Android.',
    url: 'https://banzami.com/produto',
  },
};

// Consumer capabilities only.
const CAPS: { icon: ReactNode; title: string; desc: string }[] = [
  {
    icon: <span className="bz-mono text-[22px] font-semibold text-cherry-dark">@</span>,
    title: 'Pague para um @banza',
    desc: 'Pague a uma pessoa pelo @banza dela, sem IBAN.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 12h15M13 6l6 6-6 6" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Enviar na hora',
    desc: 'Envie dinheiro para qualquer @banza, entre pessoas.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="#B5101F" strokeWidth="1.8" />
        <path d="M12 7.5v5l3.2 1.9" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Histórico claro',
    desc: 'Envios, recebimentos e comprovativos num só lugar.',
  },
];

// The consumer walkthrough — real app frames.
const APP_STEPS: { n: string; label: string; caption: string; frame: FrameName; valor?: string; para?: string; nota?: string }[] = [
  { n: '01', label: 'Boas-vindas', caption: 'primeira entrada na app', frame: 'welcome' },
  { n: '02', label: 'Criar conta', caption: 'escolher o @banza', frame: 'criar' },
  { n: '03', label: 'Início', caption: 'saldo, atalhos e ações', frame: 'inicio' },
  { n: '04', label: 'Ler QR', caption: 'ler o QR para pagar', frame: 'scan' },
  { n: '05', label: 'Confirmar', caption: 'confirmar valor e destinatário', frame: 'confpag' },
  { n: '06', label: 'Comprovativo', caption: 'comprovativo do pagamento', frame: 'comprovativo', valor: '1 500', para: '@cantina-alex', nota: '1 Kg de Arroz' },
  { n: '07', label: 'Enviar', caption: 'enviar para um @banza', frame: 'enviar' },
  { n: '08', label: 'Receber', caption: 'QR e link de pagamento', frame: 'receber' },
  { n: '09', label: 'Histórico', caption: 'acompanhar a atividade', frame: 'historico' },
  { n: '10', label: 'Perfil', caption: 'conta, PIN e segurança', frame: 'perfil' },
];

function AvailabilityRow({ platform, state, tone, note }: { platform: string; state: string; tone: 'ok' | 'beta'; note: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[16px] border border-border-soft bg-white px-5 py-4">
      <div>
        <p className="m-0 text-[15px] font-black text-ink">{platform}</p>
        <p className="m-0 mt-0.5 text-[13.5px] font-semibold text-ink-soft">{note}</p>
      </div>
      <span className={`flex-none rounded-pill px-[11px] py-[6px] text-[11px] font-black ${tone === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-pink-200 text-cherry-dark'}`}>{state}</span>
    </div>
  );
}

export default function ProdutoPage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <SiteHeader />

      {/* HERO */}
      <section className="bg-[linear-gradient(180deg,#FFF3F1,#fff)] px-6 pb-12 pt-[124px]">
        <div className="mx-auto max-w-[860px] text-center">
          <p className="m-0 mb-3 text-[14px] font-black tracking-[0.04em] text-cherry">APP BANZAMI</p>
          <h1 className="m-0 text-[clamp(32px,5.2vw,54px)] font-black leading-[1.04] tracking-[-0.03em] text-ink">
            Pagar, receber e verificar, numa só app.
          </h1>
          <p className="mx-auto m-0 mt-5 max-w-[620px] text-[clamp(16px,1.6vw,19px)] font-semibold leading-[1.6] text-ink-secondary">
            Pague por QR ou para um <span className="bz-mono">@banza</span>, receba na sua carteira em Kwanza,
            e fique com um comprovativo que qualquer pessoa pode verificar.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <a href="https://app.banzami.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-pill bg-cherry px-7 py-[14px] text-[15px] font-extrabold text-white no-underline shadow-[0_12px_26px_-10px_rgba(181,16,31,.55)] transition-transform hover:-translate-y-0.5">
              Abrir App Banzami Web ↗
            </a>
            <a href="/testes" className="inline-flex items-center gap-2 rounded-pill border border-border-softer bg-white px-7 py-[14px] text-[15px] font-extrabold text-cherry-dark no-underline transition-transform hover:-translate-y-0.5">
              Testar no iPhone e Android
            </a>
          </div>
          <p className="mx-auto m-0 mt-4 max-w-[520px] text-[13.5px] font-semibold text-ink-muted">
            App Web disponível na {PUBLIC_TRUTH.sandbox.name}, com dinheiro fictício. {PUBLIC_TRUTH.live.name} indisponível.
          </p>
        </div>
      </section>

      {/* PAGAR E ENVIAR */}
      <section id="pagar" className="scroll-mt-24 px-6 py-[clamp(48px,7vw,88px)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mb-8 max-w-[680px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">PAGAR E ENVIAR</p>
            <h2 className="m-0 text-[clamp(26px,3.6vw,40px)] font-black leading-[1.08] tracking-[-0.02em] text-ink">
              Ler, confirmar, pago.
            </h2>
          </Reveal>
          <Reveal className="bz-split mb-4 grid grid-cols-1 items-center gap-[34px] rounded-[28px] border border-border-soft bg-[linear-gradient(135deg,#fff,#FFF1F0)] p-[clamp(26px,3.4vw,40px)] shadow-[0_30px_70px_-40px_rgba(181,16,31,.4)] md:grid-cols-[1.1fr_0.9fr]">
            <QrSyncShowcase />
          </Reveal>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {CAPS.map((c) => (
              <div key={c.title} className="rounded-[22px] border border-border-soft bg-white p-6 shadow-[0_16px_40px_-28px_rgba(181,16,31,.3)]">
                <span className="mb-4 flex h-[46px] w-[46px] items-center justify-center rounded-[14px] bg-[linear-gradient(150deg,#FBD2D0,#FFE7E5)]">{c.icon}</span>
                <h3 className="m-0 mb-[7px] text-[18px] font-black text-ink">{c.title}</h3>
                <p className="m-0 text-[14.5px] font-semibold leading-[1.5] text-ink-soft">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RECEBER */}
      <section id="receber" className="scroll-mt-24 bg-[linear-gradient(180deg,#fff,#FFF7F6)] px-6 py-[clamp(48px,7vw,88px)]">
        <div className="mx-auto grid max-w-container grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">RECEBER</p>
            <h2 className="m-0 text-[clamp(26px,3.6vw,40px)] font-black leading-[1.08] tracking-[-0.02em] text-ink">
              O seu QR e o seu @banza.
            </h2>
            <p className="m-0 mt-4 max-w-[440px] text-[16px] font-semibold leading-[1.55] text-ink-secondary">
              Mostre o seu QR ou partilhe o seu <span className="bz-mono">@banza</span> para receber. Cada pagamento
              chega à sua carteira com o seu comprovativo.
            </p>
          </div>
          <div className="flex justify-center">
            <PhoneFrame float>
              <AppScreen frame="receber" />
            </PhoneFrame>
          </div>
        </div>
      </section>

      {/* COMPROVATIVOS */}
      <section id="comprovativos" className="scroll-mt-24 px-6 py-[clamp(48px,7vw,88px)]">
        <Reveal className="mx-auto flex max-w-container flex-wrap items-center justify-between gap-6 rounded-[28px] border border-border-soft bg-white p-[clamp(26px,3.4vw,40px)] shadow-[0_20px_50px_-40px_rgba(181,16,31,.35)]">
          <div className="max-w-[600px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">COMPROVATIVOS</p>
            <h2 className="m-0 text-[clamp(24px,3.2vw,34px)] font-black tracking-[-0.02em] text-ink">Um comprovativo que se verifica.</h2>
            <p className="m-0 mt-3 text-[15.5px] font-semibold leading-[1.6] text-ink-secondary">
              Cada pagamento tem uma referência. Qualquer pessoa pode confirmá-la — sem conta e sem ver dados privados.
            </p>
          </div>
          <a href="/verificar" className="rounded-pill bg-cherry px-7 py-[14px] text-[15px] font-extrabold text-white no-underline">Verificar um comprovativo →</a>
        </Reveal>
      </section>

      {/* A APP DE PONTA A PONTA */}
      <section id="app" className="scroll-mt-24 bg-[linear-gradient(180deg,#FFF7F6,#fff)] px-6 pt-[clamp(48px,7vw,88px)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mb-2 max-w-[660px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">A APP</p>
            <h2 className="m-0 text-[clamp(26px,3.6vw,40px)] font-black leading-[1.08] tracking-[-0.02em] text-ink">
              A App Banzami, de ponta a ponta.
            </h2>
            <p className="m-0 mt-4 text-[16px] font-semibold leading-[1.55] text-ink-secondary">
              Criar conta, pagar, receber e confirmar — em poucos passos. <span className="text-ink-muted">Deslize para ver →</span>
            </p>
          </Reveal>
        </div>
        <AppJourney>
          {APP_STEPS.map((s) => (
            <div key={s.n} className="w-[216px] flex-none">
              <ScaledPhone frame={s.frame} width={216} valor={s.valor} para={s.para} nota={s.nota} />
              <div className="mt-[14px] flex items-center gap-[9px]">
                <span className="inline-flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[9px] bg-cherry text-[12px] font-black text-white">{s.n}</span>
                <span className="text-[15px] font-black text-ink">{s.label}</span>
              </div>
              <p className="m-0 ml-[35px] mt-[6px] text-[13px] font-semibold text-ink-soft">{s.caption}</p>
            </div>
          ))}
        </AppJourney>
      </section>

      {/* UMA APP — WEB / IOS / ANDROID */}
      <section className="px-6 py-[clamp(48px,7vw,88px)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mb-8 max-w-[680px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">UMA APP</p>
            <h2 className="m-0 text-[clamp(26px,3.6vw,40px)] font-black leading-[1.08] tracking-[-0.02em] text-ink">
              Web, iPhone e Android — o mesmo Banzami.
            </h2>
            <p className="m-0 mt-4 text-[16px] font-semibold leading-[1.55] text-ink-secondary">
              Uma app a partir de um só código. Hoje disponível no browser, na Sandbox; nativa em testes.
            </p>
          </Reveal>
          <div className="grid max-w-[720px] grid-cols-1 gap-3">
            <AvailabilityRow platform="App Web" state="SANDBOX · DISPONÍVEL" tone="ok" note="No browser, com dinheiro fictício." />
            <AvailabilityRow platform="iPhone" state="BETA · EM TESTES" tone="beta" note={`${PUBLIC_TRUTH.appBeta.ios}, para testers convidados.`} />
            <AvailabilityRow platform="Android" state="BETA · EM TESTES" tone="beta" note={`${PUBLIC_TRUTH.appBeta.android}, para testers convidados.`} />
          </div>
          <p className="m-0 mt-5 text-[14px] font-semibold text-ink-secondary">
            <a href="/testes" className="font-extrabold text-cherry no-underline">Participar nos testes nativos →</a>
          </p>
        </div>
      </section>

      <CTASection id="contacto" {...CLOSING_CTAS.produto} />
      <Footer />
    </main>
  );
}
