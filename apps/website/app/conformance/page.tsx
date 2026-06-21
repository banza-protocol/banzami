import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { CTASection } from '@/components/CTASection';
import { Reveal } from '@/components/Reveal';
import { StatusGrid, LevelGrid } from '@/components/Conformance';
import { SectionHeading } from '@/components/primitives';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'BANZA Conformance e Transparência',
  description:
    'O Banzami corre a suite oficial de conformance do BANZA contra o sandbox, como operador candidato. PASS significa evidência, não certificação. Estado real: NOT YET, L0 validado em dry-run.',
};

const BLOQUEADORES = [
  { t: 'KYC / KYB', d: 'Verificação de identidade de clientes e negócios — fornecedor por decidir, ainda não operacional.' },
  { t: 'Rails de money-in / out', d: 'Financiamento e levantamentos em Kwanza real via provedor aprovado — ainda não ativos.' },
  { t: 'BNA / regulatório', d: 'Requisitos regulatórios e de licenciamento reconhecidos — não obtidos nem prometidos.' },
];

const ECOSSISTEMA = [
  { tag: 'BANZA', t: 'O protocolo aberto', d: 'Regras, invariantes, contratos e a framework de certificação. Não é propriedade do Banzami.', link: true },
  { tag: 'Banzami', t: 'O operador de referência', d: 'O primeiro operador construído sobre o BANZA. Não é o protocolo, nem um banco.', highlight: true },
  { tag: 'BanzAI', t: 'O sistema de conhecimento', d: 'Explica o protocolo. Não opera pagamentos e não certifica operadores sozinho.' },
];

export default function ConformancePage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <Nav active="/conformance" />

      {/* HERO */}
      <section className="relative overflow-hidden px-6 pb-14 pt-[130px]">
        <div className="pointer-events-none absolute -right-[120px] -top-[120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.7),rgba(251,210,208,0)_66%)]" />
        <div className="relative mx-auto max-w-[900px] text-center">
          <span className="mb-[22px] inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2 text-[13px] font-extrabold text-banzami shadow-[0_6px_18px_-8px_rgba(181,16,31,.3)]">
            <span className="h-2 w-2 rounded-full bg-banzami" />BANZA Conformance · Transparência
          </span>
          <h1 className="m-0 text-[clamp(36px,5.4vw,62px)] font-black leading-[1.02] tracking-[-0.03em]">
            Transparentes sobre o que está pronto.
          </h1>
          <p className="mx-auto mt-[22px] max-w-[660px] text-[clamp(16px,1.5vw,19px)] font-semibold leading-[1.55] text-ink-secondary">
            Corremos a suite oficial de conformance do BANZA contra o nosso sandbox, como operador
            candidato. Separamos deliberadamente o que está implementado do que está validado e do que
            falta.
          </p>
          <div className="mx-auto mt-[30px] max-w-[680px] rounded-card bg-gradient-to-br from-banzami to-banzami-deep px-7 py-[26px] text-white shadow-[0_24px_50px_-24px_rgba(181,16,31,.5)]">
            <p className="m-0 text-[clamp(18px,2.2vw,24px)] font-black tracking-[-0.01em]">
              PASS significa evidência, não certificação.
            </p>
            <p className="m-0 mt-[10px] text-[15px] font-semibold leading-[1.55] text-pink-200">
              O Banzami não é um operador certificado e ainda não está launch-ready.
            </p>
          </div>
        </div>
      </section>

      {/* STATUS */}
      <section className="px-6 py-[clamp(40px,6vw,72px)]">
        <div className="mx-auto max-w-container">
          <Reveal>
            <StatusGrid soft />
          </Reveal>
        </div>
      </section>

      {/* L0-L4 */}
      <section className="bg-pink-50 px-6 py-[clamp(40px,6vw,80px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            className="mb-8 max-w-[640px]"
            eyebrow="NÍVEIS DE CONFORMANCE"
            title="Definidos pelo BANZA, não pelo Banzami."
          />
          <Reveal>
            <LevelGrid />
          </Reveal>
        </div>
      </section>

      {/* PASS EXPLAINER */}
      <section className="px-6 py-[clamp(56px,8vw,96px)]">
        <div className="mx-auto grid max-w-container grid-cols-1 gap-4 md:grid-cols-2">
          <Reveal className="rounded-[28px] bg-pink-50 p-8">
            <h3 className="m-0 mb-3 text-[22px] font-black">O que o PASS significa</h3>
            <p className="m-0 mb-4 text-[15.5px] font-semibold leading-[1.6] text-ink-secondary">
              O Banzami passou a suite de conformance de nível 0 (sandbox) em modo dry-run, com
              evidência arquivada e cross-validada em dois canais.
            </p>
            <div className="flex flex-col gap-[9px]">
              <div className="flex items-center gap-[10px] rounded-[14px] bg-white px-[15px] py-3">
                <span className="bz-mono text-[12px] font-semibold text-code-green">PyPI</span>
                <span className="bz-mono text-[12.5px] text-ink-secondary">banza-conformance==0.1.0</span>
              </div>
              <div className="flex items-center gap-[10px] rounded-[14px] bg-white px-[15px] py-3">
                <span className="bz-mono text-[12px] font-semibold text-code-green">GHCR</span>
                <span className="bz-mono text-[12.5px] text-ink-secondary">banza-conformance:v0.1.0</span>
              </div>
            </div>
          </Reveal>
          <Reveal delay={80} className="rounded-[28px] border-2 border-pink-200 bg-white p-8">
            <h3 className="m-0 mb-3 text-[22px] font-black">O que o PASS não significa</h3>
            <p className="m-0 mb-4 text-[15.5px] font-semibold leading-[1.6] text-ink-secondary">
              PASS é evidência de conformidade, nunca certificação. A framework de certificação é
              propriedade do BANZA, não do Banzami.
            </p>
            <div className="flex flex-col gap-[9px]">
              <div className="flex items-center gap-[10px] rounded-[14px] bg-pink-50 px-[15px] py-3">
                <span className="text-[14px] font-extrabold text-ink-faint">✕</span>
                <p className="m-0 text-[14px] font-bold text-ink-secondary">
                  Certificado de produção <span className="bz-mono text-[12px]">certificate.json</span> ausente (404)
                </p>
              </div>
              <div className="flex items-center gap-[10px] rounded-[14px] bg-pink-50 px-[15px] py-3">
                <span className="text-[14px] font-extrabold text-ink-faint">✕</span>
                <p className="m-0 text-[14px] font-bold text-ink-secondary">
                  Não consta de registo de operadores de produção
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* BLOQUEADORES EXTERNOS */}
      <section className="bg-gradient-to-b from-white to-pink-50 px-6 py-[clamp(40px,6vw,80px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            className="mb-9 max-w-[660px]"
            eyebrow="O QUE FALTA PARA O LANÇAMENTO"
            title="Zero bloqueadores internos. Dependências externas por resolver."
            lead="Não há bloqueadores internos de engenharia no âmbito de lançamento. Estes requisitos externos mantêm o estado em NOT YET."
          />
          <div className="bz-grid3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {BLOQUEADORES.map((b, i) => (
              <Reveal key={b.t} delay={(i % 3) * 50} className="bz-card">
                <h3 className="m-0 mb-2 text-[18px] font-black">{b.t}</h3>
                <p className="m-0 text-[14.5px] font-semibold leading-[1.5] text-ink-muted">{b.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ECOSSISTEMA */}
      <section className="px-6 py-[clamp(56px,8vw,96px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            className="mb-9 max-w-[640px]"
            eyebrow="PARA QUE NÃO HAJA DÚVIDAS"
            title="BANZA, Banzami e BanzAI."
          />
          <div className="bz-grid3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {ECOSSISTEMA.map((e, i) => (
              <Reveal
                key={e.tag}
                delay={i * 60}
                className={`rounded-card p-7 ${e.highlight ? 'bg-gradient-to-br from-pink-200 to-pink-100' : 'bg-pink-50'}`}
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

      <CTASection />
      <Footer />
    </main>
  );
}
