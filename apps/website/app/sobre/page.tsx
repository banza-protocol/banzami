import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { CTASection } from '@/components/CTASection';
import { Reveal } from '@/components/Reveal';
import { SectionHeading } from '@/components/primitives';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Sobre — O operador de referência da rede BANZA',
  description:
    'O Banzami é a rede de pagamentos wallet-native de Angola, o operador de referência construído sobre o protocolo aberto BANZA. BANZA é o protocolo; Banzami é como Angola paga.',
};

const ECOSSISTEMA = [
  { tag: 'BANZA', t: 'O protocolo aberto', d: 'Define regras, invariantes, contratos e a certificação. Existe independentemente do Banzami.', link: true },
  { tag: 'Banzami', t: 'O operador de referência', d: 'Constrói produto sobre o BANZA: carteiras, UX e serviços a comerciantes.', highlight: true },
  { tag: 'BanzAI', t: 'O sistema de conhecimento', d: 'Explica e ajuda a entender o protocolo. Não opera pagamentos nem certifica sozinho.' },
];

const IMPACTO = [
  { t: 'Digitalização do Kwanza', d: 'Menos notas em circulação, mais pagamentos digitais.' },
  { t: 'Inclusão financeira', d: 'Uma carteira para quem tem um telemóvel — sem balcão, sem cartão.' },
  { t: 'Economia QR', d: 'Um QR impresso transforma qualquer balcão num ponto de venda.' },
  { t: 'Comércio digital', d: 'Qualquer comerciante aceita pagamento digital sem terminal.' },
  { t: 'Programadores angolanos', d: 'Rails partilhados para construir apps de pagamento.' },
  { t: 'Redução de fricção', d: 'Liquidação em segundos no lugar de confirmações manuais.' },
];

export default function SobrePage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <Nav active="/sobre" />

      {/* HERO */}
      <section className="relative overflow-hidden px-6 pb-14 pt-[130px]">
        <div className="pointer-events-none absolute -right-[120px] -top-[120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.7),rgba(251,210,208,0)_66%)]" />
        <div className="relative mx-auto max-w-[860px] text-center">
          <span className="mb-[22px] inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2 text-[13px] font-extrabold text-banzami shadow-[0_6px_18px_-8px_rgba(181,16,31,.3)]">
            <span className="h-2 w-2 rounded-full bg-banzami" />Sobre o Banzami
          </span>
          <h1 className="m-0 text-[clamp(36px,5.4vw,62px)] font-black leading-[1.04] tracking-[-0.03em]">
            Como Angola paga.
          </h1>
          <p className="mx-auto mt-[22px] max-w-[640px] text-[clamp(16px,1.5vw,19px)] font-semibold leading-[1.55] text-ink-secondary">
            O Banzami é a rede de pagamentos wallet-native de Angola — o operador de referência
            construído sobre o protocolo aberto BANZA. Não é o protocolo, nem um banco. Existe para
            modernizar o pagamento digital em Kwanza.
          </p>
        </div>
      </section>

      {/* ECOSSISTEMA */}
      <section className="bg-gradient-to-b from-white to-pink-50 px-6 py-[clamp(56px,8vw,96px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            className="mb-10 max-w-[660px]"
            eyebrow="O ECOSSISTEMA"
            title="BANZA, Banzami e BanzAI."
            lead="Três camadas distintas. O protocolo é aberto e independente; o Banzami é o operador; o BanzAI explica."
          />
          <div className="bz-grid3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {ECOSSISTEMA.map((e, i) => (
              <Reveal
                key={e.tag}
                delay={i * 60}
                className={`rounded-card p-7 ${e.highlight ? 'bg-gradient-to-br from-pink-200 to-pink-100' : 'bg-white shadow-[0_14px_40px_-24px_rgba(181,16,31,.2)]'}`}
              >
                <p className="bz-mono m-0 mb-[10px] text-[13px] font-semibold text-banzami">{e.tag}</p>
                <h3 className="m-0 mb-2 text-[18px] font-black">{e.t}</h3>
                <p className={`m-0 text-[14.5px] font-semibold leading-[1.5] ${e.highlight ? 'text-[#7a5a5e]' : 'text-ink-muted'}`}>
                  {e.d}
                </p>
                {e.link && (
                  <a href={SITE.protocolUrl} target="_blank" rel="noopener noreferrer" className="bz-link mt-4 inline-flex items-center gap-[6px] text-[14px]">
                    Ver o protocolo BANZA ↗
                  </a>
                )}
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* IMPACTO */}
      <section className="px-6 py-[clamp(56px,8vw,96px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            className="mb-10 max-w-[660px]"
            eyebrow="IMPACTO NACIONAL"
            title="Modernizar os pagamentos em Angola."
            lead="O objetivo é tornar o pagamento digital em Kwanza a norma — apresentado como direção, não como resultado já alcançado em escala nacional."
          />
          <div className="bz-grid3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {IMPACTO.map((item, i) => (
              <Reveal key={item.t} delay={(i % 3) * 50} className="rounded-card bg-pink-50 p-[26px]">
                <h3 className="m-0 mb-2 text-[18px] font-black">{item.t}</h3>
                <p className="m-0 text-[14.5px] font-semibold leading-[1.5] text-ink-muted">{item.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CTASection />
      <Footer />
    </main>
  );
}
