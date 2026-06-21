import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { Reveal } from '@/components/Reveal';
import { SITE, mailto } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Contacto',
  description:
    'Fala com o Banzami para integrar, testar em sandbox ou acompanhar o lançamento. Email oficial: contact@banzami.com.',
};

const CANAIS = [
  {
    t: 'Programadores',
    d: 'Pede acesso ao sandbox e à documentação da API e dos SDKs.',
    cta: 'Pedir acesso ao sandbox',
    href: mailto('Acesso sandbox Banzami'),
  },
  {
    t: 'Comerciantes',
    d: 'Quero aceitar pagamentos por QR e links no meu negócio.',
    cta: 'Quero aceitar pagamentos',
    href: mailto('Quero aceitar pagamentos'),
  },
  {
    t: 'Waitlist',
    d: 'Acompanha o lançamento do Banzami e recebe novidades.',
    cta: 'Entrar na waitlist',
    href: mailto('Waitlist Banzami'),
  },
];

export default function ContactoPage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <Nav active="/contacto" />

      {/* HERO */}
      <section className="relative overflow-hidden px-6 pb-14 pt-[130px]">
        <div className="pointer-events-none absolute -right-[120px] -top-[120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.7),rgba(251,210,208,0)_66%)]" />
        <div className="relative mx-auto max-w-[760px] text-center">
          <span className="mb-[22px] inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2 text-[13px] font-extrabold text-banzami shadow-[0_6px_18px_-8px_rgba(181,16,31,.3)]">
            <span className="h-2 w-2 rounded-full bg-banzami" />Contacto
          </span>
          <h1 className="m-0 text-[clamp(36px,5.4vw,62px)] font-black leading-[1.04] tracking-[-0.03em]">
            Fala connosco.
          </h1>
          <p className="mx-auto mt-[22px] max-w-[560px] text-[clamp(16px,1.5vw,19px)] font-semibold leading-[1.55] text-ink-secondary">
            O Banzami está em desenvolvimento ativo. Escreve-nos para integrar, testar em sandbox ou
            acompanhar o lançamento.
          </p>
          <a href={mailto()} className="bz-mono mt-7 inline-block text-[clamp(16px,2vw,22px)] font-semibold text-banzami no-underline">
            {SITE.email}
          </a>
        </div>
      </section>

      {/* CANAIS */}
      <section className="px-6 py-[clamp(40px,6vw,80px)]">
        <div className="mx-auto grid max-w-container grid-cols-1 gap-4 sm:grid-cols-3">
          {CANAIS.map((c, i) => (
            <Reveal key={c.t} delay={i * 60} className="flex flex-col rounded-card bg-pink-50 p-7">
              <h2 className="m-0 mb-2 text-[20px] font-black">{c.t}</h2>
              <p className="m-0 mb-6 text-[14.5px] font-semibold leading-[1.5] text-ink-muted">{c.d}</p>
              <a href={c.href} className="bz-link mt-auto text-[15px]">
                {c.cta} ↗
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FINAL */}
      <section className="px-6 pb-[clamp(56px,8vw,100px)] pt-4">
        <Reveal className="relative mx-auto max-w-[1080px] overflow-hidden rounded-[36px] bg-gradient-to-br from-banzami to-banzami-deep p-[clamp(40px,6vw,72px)] text-center">
          <div className="pointer-events-none absolute -left-[60px] -top-[100px] h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,rgba(232,67,75,.6),rgba(232,67,75,0)_64%)]" />
          <div className="relative">
            <h2 className="m-0 text-[clamp(28px,4.4vw,46px)] font-black leading-[1.04] tracking-[-0.025em] text-white">
              Constrói connosco.
            </h2>
            <p className="mx-auto mt-4 max-w-[520px] text-[16px] font-semibold leading-[1.55] text-pink-200">
              O Banzami é construído sobre o protocolo aberto BANZA. BANZA é o protocolo; Banzami é como
              Angola paga.
            </p>
            <a href={mailto()} className="mt-7 inline-flex items-center gap-2 rounded-pill bg-white px-[30px] py-4 text-[16px] font-extrabold text-banzami no-underline transition-transform hover:-translate-y-0.5">
              Falar connosco
            </a>
          </div>
        </Reveal>
      </section>

      <Footer />
    </main>
  );
}
