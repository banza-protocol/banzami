import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { CTASection } from '@/components/site/CTASection';
import { Footer } from '@/components/site/Footer';
import { Reveal } from '@/components/Reveal';
import { MailLink } from '@/components/MailLink';
import { Faq } from '@/components/support/Faq';
import { PUBLIC_TRUTH } from '@/lib/public-truth';
import { SITE } from '@/lib/site';

// /suporte — real support (PUBLIC-WEBSITE-RELEASE-001 §23): help a person solve a
// problem. Support topics → the FAQ knowledge base (embedded, #faq) and the right
// destination; the current platform state; how to reach the team and report a
// security issue. Developer questions route to the Developer Docs. The BANZA/
// operator explanation is owned by /sobre and the trust detail by /seguranca —
// not repeated here.

export const metadata: Metadata = {
  title: 'Suporte',
  description:
    'Ajuda do Banzami: a app e a conta, pagamentos e QR, comprovativos, Sandbox, o estado da plataforma, perguntas frequentes e contactos.',
  alternates: { canonical: 'https://banzami.com/suporte' },
  openGraph: {
    title: 'Suporte — Banzami',
    description: 'Ajuda para a app, pagamentos, QR, comprovativos e Sandbox, com o estado da plataforma e os contactos.',
    url: 'https://banzami.com/suporte',
  },
};

const SECURITY_EMAIL = 'security@banzami.com';

const TOPICS: { title: string; body: string; href: string; label: string; external?: boolean; icon: ReactNode }[] = [
  {
    title: 'App e conta',
    body: 'Criar conta, o @banza, o PIN e iniciar sessão.',
    href: '#faq',
    label: 'Ver perguntas',
    icon: <><rect x="6" y="2.5" width="12" height="19" rx="3" stroke="#B5101F" strokeWidth="1.8" /><path d="M10 18.5h4" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" /></>,
  },
  {
    title: 'Pagamentos e QR',
    body: 'Pagar, enviar, ler um QR e o que fazer se a câmara não abrir.',
    href: '#faq',
    label: 'Ver perguntas',
    icon: <><rect x="3" y="3" width="7" height="7" rx="1.6" stroke="#B5101F" strokeWidth="1.8" /><rect x="14" y="3" width="7" height="7" rx="1.6" stroke="#B5101F" strokeWidth="1.8" /><rect x="3" y="14" width="7" height="7" rx="1.6" stroke="#B5101F" strokeWidth="1.8" /><path d="M14 14h3v3M21 14v7h-7" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></>,
  },
  {
    title: 'Comprovativos',
    body: 'Verificar uma referência de pagamento, a qualquer altura.',
    href: '/verificar',
    label: 'Verificar',
    icon: <><path d="M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6l7-3z" stroke="#B5101F" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9.2 11.6l1.9 1.9 3.7-3.7" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></>,
  },
  {
    title: 'Segurança e privacidade',
    body: 'Como o Banzami protege o dinheiro e os dados.',
    href: '/seguranca',
    label: 'Ver segurança',
    icon: <><rect x="5" y="11" width="14" height="9" rx="2.5" stroke="#B5101F" strokeWidth="1.8" /><path d="M8 11V8a4 4 0 018 0v3" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" /></>,
  },
  {
    title: 'Sandbox e testes',
    body: 'Testar a App Web e as apps nativas, com dinheiro fictício.',
    href: '/testes',
    label: 'Participar nos testes',
    icon: <path d="M9 3v6l-5 9a2 2 0 001.7 3h12.6a2 2 0 001.7-3l-5-9V3" stroke="#B5101F" strokeWidth="1.8" strokeLinejoin="round" />,
  },
  {
    title: 'Ajuda para developers',
    body: 'Guias, referência da API, erros e resolução de problemas.',
    href: `${PUBLIC_TRUTH.docsUrl}/support`,
    label: 'Suporte para developers',
    external: true,
    icon: <path d="M8.5 8l-4 4 4 4M15.5 8l4 4-4 4" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
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
            Encontre uma resposta, veja o estado da plataforma, ou fale com a equipa.
          </p>
        </div>
      </section>

      {/* SUPPORT TOPICS */}
      <section className="px-6 pb-[clamp(40px,6vw,72px)]">
        <div className="mx-auto grid max-w-container grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOPICS.map((t, i) => (
            <Reveal key={t.title} delay={(i % 3) * 50} className="flex flex-col rounded-[24px] border border-border-soft bg-white p-7">
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-[13px] bg-cream-100">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">{t.icon}</svg>
              </span>
              <h2 className="m-0 mb-2 text-[18px] font-black text-ink">{t.title}</h2>
              <p className="m-0 mb-4 text-[14.5px] font-semibold leading-[1.55] text-ink-soft">{t.body}</p>
              {t.external ? (
                <a href={t.href} className="mt-auto text-[14px] font-extrabold text-cherry no-underline">{t.label} ↗</a>
              ) : t.href.startsWith('#') ? (
                <a href={t.href} className="mt-auto text-[14px] font-extrabold text-cherry no-underline">{t.label}</a>
              ) : (
                <Link href={t.href} prefetch={t.href === '/verificar' ? false : undefined} className="mt-auto text-[14px] font-extrabold text-cherry no-underline">{t.label}</Link>
              )}
            </Reveal>
          ))}
        </div>
      </section>

      {/* ESTADO */}
      <section id="estado" className="scroll-mt-28 bg-cream-50 px-6 py-[clamp(40px,6vw,72px)]">
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
            <Reveal delay={60} className="rounded-[24px] border border-border-soft bg-white p-7">
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
      <section className="px-6 py-[clamp(40px,6vw,72px)]">
        <div className="mx-auto grid max-w-container grid-cols-1 gap-4 md:grid-cols-2">
          <Reveal className="rounded-[24px] border border-border-soft bg-white p-7">
            <h2 className="m-0 mb-2 text-[20px] font-black text-ink">Contactar a equipa</h2>
            <p className="m-0 mb-4 text-[15px] font-semibold leading-[1.6] text-ink-secondary">
              Para perguntas sobre o Banzami, a plataforma ou uma integração.
            </p>
            <MailLink to={SITE.email} className="text-[15px] font-extrabold text-cherry no-underline" />
          </Reveal>
          <Reveal delay={60} className="rounded-[24px] border border-border-soft bg-white p-7">
            <h2 className="m-0 mb-2 text-[20px] font-black text-ink">Reportar um problema de segurança</h2>
            <p className="m-0 mb-4 text-[15px] font-semibold leading-[1.6] text-ink-secondary">
              Descreva o problema e como reproduzi-lo. Não inclua chaves, palavras-passe nem dados de outras pessoas.
            </p>
            <MailLink to={SECURITY_EMAIL} className="text-[15px] font-extrabold text-cherry no-underline" />
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-28 bg-[linear-gradient(180deg,#fff,#FFF7F6)] px-6 py-[clamp(48px,7vw,88px)]">
        <div className="mx-auto max-w-[760px]">
          <Reveal className="mb-2">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">PERGUNTAS FREQUENTES</p>
            <h2 className="m-0 text-[clamp(26px,3.6vw,40px)] font-black leading-[1.08] tracking-[-0.02em] text-ink">
              O que o Banzami é, e o que está disponível hoje.
            </h2>
          </Reveal>
          <Faq />
        </div>
      </section>

      <CTASection />
      <Footer />
    </div>
  );
}
