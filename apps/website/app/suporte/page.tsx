import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site/SiteHeader';
import { CTASection } from '@/components/site/CTASection';
import { Footer } from '@/components/site/Footer';
import { Reveal } from '@/components/Reveal';
import { MailLink } from '@/components/MailLink';
import { PUBLIC_TRUTH } from '@/lib/public-truth';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Suporte',
  description:
    'Suporte Banzami: estado da plataforma, contactos, reporte de problemas de segurança e ajuda para developers.',
  alternates: { canonical: 'https://banzami.com/suporte' },
};

// Suporte answers three questions: what is available now, how to reach the
// team, and how to report a security problem. It used to be a conformance
// dossier (levels, blocker counts, "PASS significa evidência") — assurance
// language written for engineers, which aged the day it was published. The
// environment facts come from lib/public-truth.ts; there is no uptime claim
// here because no public status service exists to back one.

const SECURITY_EMAIL = 'security@banzami.com';

const HELP: { title: string; body: string; href: string; label: string }[] = [
  {
    title: 'Developers',
    body: 'Guias, referência da API, erros e resolução de problemas da Sandbox.',
    href: `${PUBLIC_TRUTH.docsUrl}/support`,
    label: 'Suporte para developers',
  },
  {
    title: 'Perguntas frequentes',
    body: 'O que o Banzami é e o que está disponível hoje.',
    href: '/faq',
    label: 'Ver as perguntas',
  },
  {
    title: 'Verificar um comprovativo',
    body: 'Confirme uma referência de pagamento em qualquer altura.',
    href: '/verificar',
    label: 'Verificar',
  },
];

export default function SuportePage() {
  return (
    <div className="overflow-x-hidden bg-white">
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden px-6 pb-12 pt-[clamp(120px,16vw,130px)]">
        <div className="pointer-events-none absolute -right-[120px] -top-[120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.7),rgba(251,210,208,0)_66%)]" />
        <div className="relative mx-auto max-w-[820px] text-center">
          <p className="m-0 mb-3 text-[14px] font-black tracking-[0.04em] text-cherry">SUPORTE</p>
          <h1 className="m-0 text-[clamp(36px,5.4vw,58px)] font-black leading-[1.03] tracking-[-0.03em] text-ink">
            Como podemos ajudar?
          </h1>
          <p className="mx-auto m-0 mt-[20px] max-w-[620px] text-[clamp(16px,1.5vw,19px)] font-semibold leading-[1.55] text-ink-secondary">
            O estado atual da plataforma, os contactos da equipa e o caminho para reportar um problema de segurança.
          </p>
        </div>
      </section>

      {/* ESTADO */}
      <section id="estado" className="scroll-mt-28 px-6 pb-[clamp(40px,6vw,72px)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mb-6 max-w-[640px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">ESTADO DA PLATAFORMA</p>
            <h2 className="m-0 text-[clamp(26px,3.6vw,40px)] font-black leading-[1.08] tracking-[-0.02em] text-ink">
              Uma plataforma, dois ambientes financeiros.
            </h2>
          </Reveal>
          <div data-testid="support-environment-status" className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Reveal className="rounded-[24px] border border-border-soft bg-white p-7">
              <p className="m-0 flex items-center gap-2 text-[12px] font-extrabold tracking-[0.08em] text-ink-muted">
                <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-[#1f9d57]" />
                {PUBLIC_TRUTH.sandbox.name.toUpperCase()} · {PUBLIC_TRUTH.sandbox.state.toUpperCase()}
              </p>
              <p className="m-0 mt-3 text-[15.5px] font-semibold leading-[1.6] text-ink-secondary">{PUBLIC_TRUTH.sandbox.summary}</p>
            </Reveal>
            <Reveal delay={60} className="rounded-[24px] border border-border-soft bg-cream-50 p-7">
              <p className="m-0 flex items-center gap-2 text-[12px] font-extrabold tracking-[0.08em] text-ink-muted">
                <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-ink-muted" />
                {PUBLIC_TRUTH.live.name.toUpperCase()} · {PUBLIC_TRUTH.live.state.toUpperCase()}
              </p>
              <p className="m-0 mt-3 text-[15.5px] font-semibold leading-[1.6] text-ink-secondary">{PUBLIC_TRUTH.live.summary}</p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* CONTACTOS */}
      <section className="bg-cream-50 px-6 py-[clamp(40px,6vw,80px)]">
        <div className="mx-auto grid max-w-container grid-cols-1 gap-4 md:grid-cols-2">
          <Reveal className="rounded-[24px] bg-white p-7">
            <h2 className="m-0 mb-2 text-[20px] font-black text-ink">Contactar a equipa</h2>
            <p className="m-0 mb-4 text-[15px] font-semibold leading-[1.6] text-ink-secondary">
              Para perguntas sobre o Banzami, a plataforma ou uma integração.
            </p>
            <MailLink to={SITE.email} className="text-[15px] font-extrabold text-cherry no-underline" />
          </Reveal>
          <Reveal delay={60} className="rounded-[24px] bg-white p-7">
            <h2 className="m-0 mb-2 text-[20px] font-black text-ink">Reportar um problema de segurança</h2>
            <p className="m-0 mb-4 text-[15px] font-semibold leading-[1.6] text-ink-secondary">
              Descreva o problema e como reproduzi-lo. Não inclua chaves, palavras-passe nem dados de outras pessoas.
            </p>
            <MailLink to={SECURITY_EMAIL} className="text-[15px] font-extrabold text-cherry no-underline" />
          </Reveal>
        </div>
      </section>

      {/* AJUDA */}
      <section className="px-6 py-[clamp(48px,7vw,88px)]">
        <div className="mx-auto grid max-w-container grid-cols-1 gap-4 md:grid-cols-3">
          {HELP.map((h, i) => (
            <Reveal key={h.title} delay={i * 50} className="flex flex-col rounded-[24px] border border-border-soft bg-white p-7">
              <h2 className="m-0 mb-2 text-[18px] font-black text-ink">{h.title}</h2>
              <p className="m-0 mb-4 text-[14.5px] font-semibold leading-[1.55] text-ink-soft">{h.body}</p>
              {h.href.startsWith('http') ? (
                <a href={h.href} className="mt-auto text-[14px] font-extrabold text-cherry no-underline">{h.label} ↗</a>
              ) : (
                <Link href={h.href} prefetch={h.href === '/verificar' ? false : undefined} className="mt-auto text-[14px] font-extrabold text-cherry no-underline">{h.label}</Link>
              )}
            </Reveal>
          ))}
        </div>
      </section>

      {/* BANZA e Banzami */}
      <section className="bg-[linear-gradient(180deg,#fff,#FFF7F6)] px-6 py-[clamp(48px,7vw,88px)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mb-8 max-w-[640px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">BANZA E BANZAMI</p>
            <h2 className="m-0 text-[clamp(26px,3.6vw,40px)] font-black leading-[1.08] tracking-[-0.02em] text-ink">
              O protocolo e o operador são coisas diferentes.
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Reveal className="rounded-[24px] bg-cream-50 p-7">
              <p className="m-0 mb-[10px] bz-mono text-[13px] font-semibold text-cherry">BANZA</p>
              <h3 className="m-0 mb-2 text-[18px] font-black text-ink">O protocolo aberto</h3>
              <p className="m-0 text-[14.5px] font-semibold leading-[1.5] text-ink-soft">
                Regras, invariantes e contratos, governados de forma independente do Banzami.
              </p>
              <a href={SITE.protocolUrl} target="_blank" rel="noopener" className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-extrabold text-cherry no-underline">
                banza.network ↗
              </a>
            </Reveal>
            <Reveal delay={60} className="rounded-[24px] bg-[linear-gradient(160deg,#FBD2D0,#FFF1F0)] p-7">
              <p className="m-0 mb-[10px] bz-mono text-[13px] font-semibold text-cherry">Banzami</p>
              <h3 className="m-0 mb-2 text-[18px] font-black text-ink">O operador de referência</h3>
              <p className="m-0 text-[14.5px] font-semibold leading-[1.5] text-[#7a5a5e]">
                A empresa que constrói a rede de pagamentos sobre o BANZA. Não é o protocolo nem um banco.
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
