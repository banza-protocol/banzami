import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { CTASection } from '@/components/CTASection';
import { Reveal } from '@/components/Reveal';
import { MerchantDashboard } from '@/components/MerchantDashboard';
import { SectionHeading, SoftCard } from '@/components/primitives';
import { mailto } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Para Comerciantes — Aceita pagamentos sem terminal',
  description:
    'Imprime um QR, partilha um link, recebe em segundos dentro da rede. Onboarding em minutos, sem hardware e sem volume mínimo. A solução de pagamentos do Banzami para o teu negócio.',
};

const PASSOS = [
  { n: '1', t: 'Cria a tua carteira', d: <>Registas o negócio e recebes uma carteira e um <span className="bz-mono text-[13px] text-banzami">@banza</span>.</> },
  { n: '2', t: 'Gera um QR ou link', d: 'Cola o QR no balcão ou partilha o link por WhatsApp ou SMS.' },
  { n: '3', t: 'Recebe em segundos', d: 'O cliente faz scan, confirma e pagas. Creditado na tua carteira, dentro da rede.' },
];

const VANTAGENS = [
  { t: 'Sem terminal físico', d: 'Nada de TPA/POS — basta um smartphone.' },
  { t: 'Confirmação criptográfica', d: 'Um recibo na carteira substitui o screenshot.' },
  { t: 'Dashboard em tempo real', d: 'Saldo, transações e análises num só painel.' },
  { t: 'Histórico & conciliação', d: <>Cada pagamento com data/hora, valor e <span className="bz-mono text-[12px]">@banza</span>.</> },
  { t: 'Onboarding em minutos', d: 'Sem volume mínimo e sem burocracia de cartão.' },
  { t: 'Liquidação na rede', d: 'Creditado no momento da confirmação, dentro da rede.' },
];

export default function ComerciantesPage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <Nav active="/comerciantes" />

      {/* HERO */}
      <section className="relative overflow-hidden px-6 pb-16 pt-[130px]">
        <div className="pointer-events-none absolute -right-[120px] -top-[120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.7),rgba(251,210,208,0)_66%)]" />
        <div className="bz-split relative mx-auto grid max-w-container grid-cols-1 items-center gap-12 md:grid-cols-2">
          <Reveal>
            <span className="mb-[22px] inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2 text-[13px] font-extrabold text-banzami shadow-[0_6px_18px_-8px_rgba(181,16,31,.3)]">
              <span className="h-2 w-2 rounded-full bg-banzami" />Para o teu negócio
            </span>
            <h1 className="m-0 text-[clamp(38px,5.4vw,64px)] font-black leading-[1.02] tracking-[-0.03em]">
              Aceita pagamentos sem terminal.
            </h1>
            <p className="m-0 mt-5 max-w-[520px] text-[clamp(16px,1.5vw,19px)] font-semibold leading-[1.55] text-ink-secondary">
              Imprime um QR, partilha um link, recebe em segundos dentro da rede. Onboarding em minutos,
              sem hardware e sem volume mínimo.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href={mailto('Quero aceitar pagamentos')}
                className="bz-btn-primary w-full justify-center sm:w-auto sm:justify-start"
              >
                Quero aceitar pagamentos
              </a>
              <a
                href="#como"
                className="bz-btn-secondary w-full justify-center sm:w-auto sm:justify-start"
              >
                Como começar
              </a>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="anim-floaty-7">
              <MerchantDashboard />
            </div>
          </Reveal>
        </div>
      </section>

      {/* COMO COMEÇAR */}
      <section id="como" className="bg-gradient-to-b from-white to-pink-50 px-6 py-[clamp(56px,8vw,96px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            center
            className="mb-11 max-w-[600px]"
            eyebrow="COMO COMEÇAR"
            title="Em três passos, sem burocracia."
          />
          <div className="bz-grid3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {PASSOS.map((p, i) => (
              <Reveal key={p.n} delay={i * 80} className="bz-card">
                <span className="mb-4 inline-flex h-[42px] w-[42px] items-center justify-center rounded-[14px] bg-banzami text-[17px] font-black text-white">
                  {p.n}
                </span>
                <h3 className="m-0 mb-2 text-[19px] font-black">{p.t}</h3>
                <p className="m-0 text-[14.5px] font-semibold leading-[1.5] text-ink-muted">{p.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* VANTAGENS */}
      <section className="px-6 py-[clamp(56px,8vw,96px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            className="mb-10 max-w-[640px]"
            eyebrow="VANTAGENS"
            title="Feito para cantinas, táxis, lojas e serviços."
          />
          <div className="bz-grid3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {VANTAGENS.map((v, i) => (
              <SoftCard key={v.t} title={v.t} delay={(i % 3) * 50}>
                {v.d}
              </SoftCard>
            ))}
          </div>
          <Reveal className="mt-7 rounded-[20px] bg-pink-100 px-6 py-[22px]">
            <p className="m-0 text-[14px] font-semibold leading-[1.6] text-ink-secondary">
              <strong className="text-banzami-deep">Nota honesta.</strong> Os levantamentos para conta
              bancária dependem de rails de saída aprovados que ainda não estão ativos — apresentados
              como capacidade da rede e roadmap, não como serviço comercial já disponível.
            </p>
          </Reveal>
        </div>
      </section>

      <CTASection />
      <Footer />
    </main>
  );
}
