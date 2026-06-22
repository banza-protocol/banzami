import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { CTASection } from '@/components/site/CTASection';
import { Footer } from '@/components/site/Footer';
import { Reveal } from '@/components/Reveal';

export const metadata: Metadata = {
  title: 'Confiança e suporte',
  description:
    'Transparentes sobre o que está pronto. O Banzami tem evidência L0 validada em dry-run. PASS significa evidência, não certificação. O Banzami não é certificado e ainda não está launch-ready.',
};

// Status snapshot (Conformance.dc.html §STATUS SNAPSHOT).
const STATUS: { label: string; value: string; valueClass?: string }[] = [
  { label: 'ESTADO DE LANÇAMENTO', value: 'NOT YET', valueClass: 'text-cherry' },
  { label: 'BLOQ. INTERNOS', value: '0' },
  { label: 'BLOQ. EXTERNOS', value: '10' },
  { label: 'EVIDÊNCIA L0 · DRY-RUN', value: 'Validada · 5/5', valueClass: 'text-ink' },
  { label: 'CERTIFICAÇÃO BANZA', value: 'Não emitida', valueClass: 'text-ink-muted' },
];

// External blockers (Conformance.dc.html §BLOQUEADORES EXTERNOS).
const EXTERNAL_BLOCKERS: { title: string; body: string }[] = [
  {
    title: 'KYC / KYB',
    body: 'Verificação de identidade de clientes e negócios — fornecedor por decidir, ainda não operacional.',
  },
  {
    title: 'Rails de money-in / out',
    body: 'Financiamento e levantamentos em Kwanza real via provedor aprovado — ainda não ativos.',
  },
  {
    title: 'BNA / regulatório',
    body: 'Requisitos regulatórios e de licenciamento reconhecidos — não obtidos nem prometidos.',
  },
];

export default function SuportePage() {
  return (
    <div className="overflow-x-hidden bg-white">
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden px-6 pb-14 pt-[clamp(120px,16vw,130px)]">
        <div className="pointer-events-none absolute -right-[120px] -top-[120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.7),rgba(251,210,208,0)_66%)]" />
        <div className="relative mx-auto max-w-[900px] text-center">
          <span className="mb-[22px] inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2 text-[13px] font-extrabold text-cherry shadow-[0_6px_18px_-8px_rgba(181,16,31,.3)]">
            <span className="h-2 w-2 rounded-full bg-cherry" />
            BANZA Conformance · Transparência
          </span>
          <h1 className="m-0 text-[clamp(36px,5.4vw,62px)] font-black leading-[1.02] tracking-[-0.03em] text-ink">
            Transparentes sobre o que está pronto.
          </h1>
          <p className="mx-auto m-0 mt-[22px] max-w-[660px] text-[clamp(16px,1.5vw,19px)] font-semibold leading-[1.55] text-ink-secondary">
            Corremos a suite oficial de conformance do BANZA contra o nosso sandbox, como operador
            candidato. Separamos deliberadamente o que está implementado do que está validado e do
            que falta.
          </p>
          <div className="mx-auto mt-[30px] max-w-[680px] rounded-[24px] bg-[linear-gradient(150deg,#B5101F,#9A1B22)] px-7 py-[26px] text-white shadow-[0_24px_50px_-24px_rgba(181,16,31,.5)]">
            <p className="m-0 text-[clamp(18px,2.2vw,24px)] font-black tracking-[-0.01em]">
              PASS significa evidência, não certificação.
            </p>
            <p className="m-0 mt-[10px] text-[15px] font-semibold leading-[1.55] text-pink-200">
              O Banzami não é um operador certificado e ainda não está launch-ready.
            </p>
          </div>
        </div>
      </section>

      {/* STATUS SNAPSHOT */}
      <section className="px-6 py-[clamp(40px,6vw,72px)]">
        <div className="mx-auto max-w-container">
          <Reveal className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {STATUS.map((s) => (
              <div key={s.label} className="rounded-[20px] bg-cream-50 p-5">
                <p className="m-0 text-[11px] font-extrabold tracking-[0.03em] text-ink-muted">
                  {s.label}
                </p>
                <p className={`m-0 mt-2 text-[19px] font-black ${s.valueClass ?? 'text-ink'}`}>
                  {s.value}
                </p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* NÍVEIS DE CONFORMANCE (L0–L4) */}
      <section className="bg-cream-50 px-6 py-[clamp(40px,6vw,80px)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mb-8 max-w-[640px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">NÍVEIS DE CONFORMANCE</p>
            <h2 className="m-0 text-[clamp(26px,3.6vw,40px)] font-black leading-[1.08] tracking-[-0.02em] text-ink">
              Definidos pelo BANZA, não pelo Banzami.
            </h2>
          </Reveal>
          <Reveal className="rounded-[28px] bg-white p-[clamp(22px,3vw,34px)]">
            <div className="grid grid-cols-1 gap-[10px] lg:grid-cols-5">
              <div className="rounded-[18px] bg-cherry p-5 text-white">
                <p className="m-0 bz-mono text-[13px] font-semibold">L0</p>
                <p className="m-0 mb-1.5 mt-2 text-[14px] font-extrabold">Conformance em sandbox</p>
                <p className="m-0 text-[12px] font-bold text-pink-200">VALIDATED · baseline</p>
                <p className="m-0 mt-1.5 text-[11px] text-[#f3c8c6]">PyPI + GHCR 5/5</p>
              </div>
              <div className="rounded-[18px] bg-cream-50 p-5">
                <p className="m-0 bz-mono text-[13px] font-semibold text-ink-muted">L1</p>
                <p className="m-0 mb-1.5 mt-2 text-[14px] font-extrabold text-ink">
                  Pagamentos core
                </p>
                <p className="m-0 text-[12px] font-bold text-[#8a7a7e]">PLANEADO · não validado</p>
                <p className="m-0 mt-1.5 text-[11px] text-[#a89a9e]">gap analysis feita</p>
              </div>
              <div className="rounded-[18px] bg-cream-50 p-5">
                <p className="m-0 bz-mono text-[13px] font-semibold text-ink-muted">L2</p>
                <p className="m-0 mb-1.5 mt-2 text-[14px] font-extrabold text-ink">
                  Iniciação de pagamento
                </p>
                <p className="m-0 text-[12px] font-bold text-[#8a7a7e]">FUTURO</p>
              </div>
              <div className="rounded-[18px] bg-cream-50 p-5">
                <p className="m-0 bz-mono text-[13px] font-semibold text-ink-muted">L3</p>
                <p className="m-0 mb-1.5 mt-2 text-[14px] font-extrabold text-ink">Federação</p>
                <p className="m-0 text-[12px] font-bold text-[#8a7a7e]">FUTURO</p>
              </div>
              <div className="rounded-[18px] bg-cream-50 p-5">
                <p className="m-0 bz-mono text-[13px] font-semibold text-ink-muted">L4</p>
                <p className="m-0 mb-1.5 mt-2 text-[14px] font-extrabold text-ink">
                  Interoperabilidade
                </p>
                <p className="m-0 text-[12px] font-bold text-[#8a7a7e]">FUTURO</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* PASS EXPLAINER */}
      <section className="px-6 py-[clamp(56px,8vw,96px)]">
        <div className="mx-auto max-w-container">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Reveal className="rounded-[28px] bg-cream-50 p-8">
              <h3 className="m-0 mb-3 text-[22px] font-black text-ink">O que o PASS significa</h3>
              <p className="m-0 mb-4 text-[15.5px] font-semibold leading-[1.6] text-ink-secondary">
                O Banzami passou a suite de conformance de nível 0 (sandbox) em modo dry-run, com
                evidência arquivada e cross-validada em dois canais.
              </p>
              <div className="flex flex-col gap-[9px]">
                <div className="flex items-center gap-[10px] rounded-[14px] bg-white px-[15px] py-3">
                  <span className="bz-mono text-[12px] font-semibold text-[#1f9a5b]">PyPI</span>
                  <span className="bz-mono text-[12.5px] text-ink-secondary">
                    banza-conformance==0.1.0
                  </span>
                </div>
                <div className="flex items-center gap-[10px] rounded-[14px] bg-white px-[15px] py-3">
                  <span className="bz-mono text-[12px] font-semibold text-[#1f9a5b]">GHCR</span>
                  <span className="bz-mono text-[12.5px] text-ink-secondary">
                    banza-conformance:v0.1.0
                  </span>
                </div>
              </div>
            </Reveal>

            <Reveal delay={80} className="rounded-[28px] border-2 border-pink-200 bg-white p-8">
              <h3 className="m-0 mb-3 text-[22px] font-black text-ink">O que o PASS não significa</h3>
              <p className="m-0 mb-4 text-[15.5px] font-semibold leading-[1.6] text-ink-secondary">
                PASS é evidência de conformidade, nunca certificação. A framework de certificação é
                propriedade do BANZA, não do Banzami.
              </p>
              <div className="flex flex-col gap-[9px]">
                <div className="flex items-center gap-[10px] rounded-[14px] bg-cream-50 px-[15px] py-3">
                  <span className="text-[14px] font-extrabold text-ink-muted">✕</span>
                  <p className="m-0 text-[14px] font-bold text-ink-secondary">
                    Certificado de produção <span className="bz-mono text-[12px]">certificate.json</span>{' '}
                    ausente (404)
                  </p>
                </div>
                <div className="flex items-center gap-[10px] rounded-[14px] bg-cream-50 px-[15px] py-3">
                  <span className="text-[14px] font-extrabold text-ink-muted">✕</span>
                  <p className="m-0 text-[14px] font-bold text-ink-secondary">
                    Não consta de registo de operadores de produção
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* BLOQUEADORES EXTERNOS */}
      <section className="bg-[linear-gradient(180deg,#fff,#FFF7F6)] px-6 py-[clamp(40px,6vw,80px)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mb-9 max-w-[660px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">
              O QUE FALTA PARA O LANÇAMENTO
            </p>
            <h2 className="m-0 text-[clamp(26px,3.6vw,40px)] font-black leading-[1.08] tracking-[-0.02em] text-ink">
              Zero bloqueadores internos. Dependências externas por resolver.
            </h2>
            <p className="m-0 mt-4 text-[16px] font-semibold leading-[1.55] text-ink-secondary">
              Não há bloqueadores internos de engenharia no âmbito de lançamento. Estes requisitos
              externos mantêm o estado em NOT YET.
            </p>
          </Reveal>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {EXTERNAL_BLOCKERS.map((b, i) => (
              <Reveal
                key={b.title}
                delay={i * 50}
                className="rounded-[24px] bg-white p-[26px] shadow-[0_14px_40px_-24px_rgba(181,16,31,.2)]"
              >
                <h3 className="m-0 mb-2 text-[18px] font-black text-ink">{b.title}</h3>
                <p className="m-0 text-[14.5px] font-semibold leading-[1.5] text-ink-soft">
                  {b.body}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ECOSSISTEMA — BANZA, Banzami e BanzAI */}
      <section className="px-6 py-[clamp(56px,8vw,96px)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mb-9 max-w-[640px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">PARA QUE NÃO HAJA DÚVIDAS</p>
            <h2 className="m-0 text-[clamp(26px,3.6vw,40px)] font-black leading-[1.08] tracking-[-0.02em] text-ink">
              BANZA, Banzami e BanzAI.
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Reveal className="rounded-[24px] bg-cream-50 p-7">
              <p className="m-0 mb-[10px] bz-mono text-[13px] font-semibold text-cherry">BANZA</p>
              <h3 className="m-0 mb-2 text-[18px] font-black text-ink">O protocolo aberto</h3>
              <p className="m-0 text-[14.5px] font-semibold leading-[1.5] text-ink-soft">
                Regras, invariantes, contratos e a framework de certificação. Não é propriedade do
                Banzami.
              </p>
              <a
                href="https://banzami.org"
                target="_blank"
                rel="noopener"
                className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-extrabold text-cherry no-underline"
              >
                Ver o site do protocolo BANZA ↗
              </a>
            </Reveal>
            <Reveal
              delay={60}
              className="rounded-[24px] bg-[linear-gradient(160deg,#FBD2D0,#FFF1F0)] p-7"
            >
              <p className="m-0 mb-[10px] bz-mono text-[13px] font-semibold text-cherry">Banzami</p>
              <h3 className="m-0 mb-2 text-[18px] font-black text-ink">O operador de referência</h3>
              <p className="m-0 text-[14.5px] font-semibold leading-[1.5] text-[#7a5a5e]">
                O primeiro operador construído sobre o BANZA. Não é o protocolo, nem um banco.
              </p>
            </Reveal>
            <Reveal delay={120} className="rounded-[24px] bg-cream-50 p-7">
              <p className="m-0 mb-[10px] bz-mono text-[13px] font-semibold text-cherry">BanzAI</p>
              <h3 className="m-0 mb-2 text-[18px] font-black text-ink">O sistema de conhecimento</h3>
              <p className="m-0 text-[14.5px] font-semibold leading-[1.5] text-ink-soft">
                Explica o protocolo. Não opera pagamentos e não certifica operadores sozinho.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <CTASection />
      <Footer />
    </div>
  );
}
