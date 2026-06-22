import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { CTASection } from '@/components/site/CTASection';
import { Footer } from '@/components/site/Footer';
import { Reveal } from '@/components/Reveal';
import { mailto } from '@/lib/site';

export const metadata: Metadata = { title: 'Sobre' };

// Os 5 valores de "O que acreditamos" — verbatim de Sobre.dc.html (ícones inline).
const VALORES: { label: string; icon: ReactNode }[] = [
  {
    label: 'Simplicidade',
    icon: (
      <path d="M5 13l4 4L19 7" stroke="#B5101F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    label: 'Confiança',
    icon: (
      <path
        d="M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6l7-3z"
        stroke="#B5101F"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    ),
  },
  {
    label: 'Transparência',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" stroke="#B5101F" strokeWidth="1.9" />
        <path d="M12 8v8M8 12h8" stroke="#B5101F" strokeWidth="1.9" strokeLinecap="round" />
      </>
    ),
  },
  {
    label: 'Tecnologia útil',
    icon: (
      <path
        d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"
        stroke="#B5101F"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    ),
  },
  {
    label: 'Acesso financeiro',
    icon: (
      <>
        <circle cx="9" cy="9" r="3" stroke="#B5101F" strokeWidth="1.9" />
        <path d="M3.5 19a5.5 5.5 0 0111 0" stroke="#B5101F" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M16 7a3 3 0 010 5.6" stroke="#B5101F" strokeWidth="1.9" strokeLinecap="round" />
      </>
    ),
  },
];

export default function SobrePage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <SiteHeader />

      {/* HERO */}
      <section className="bg-[linear-gradient(180deg,#FFF3F1,#fff)] px-6 pb-12 pt-[124px]">
        <div className="mx-auto max-w-[820px] text-center">
          <p className="m-0 mb-3 text-[14px] font-black tracking-[0.04em] text-cherry">SOBRE</p>
          <h1 className="m-0 text-[clamp(32px,5.4vw,54px)] font-black leading-[1.04] tracking-[-0.03em]">
            Construímos uma nova forma de mover dinheiro em Angola.
          </h1>
          <p className="mx-auto m-0 mt-5 max-w-[640px] text-[18px] font-semibold leading-[1.6] text-ink-secondary">
            O Banzami nasce para tornar pagamentos, transferências e comprovativos mais simples,
            instantâneos e acessíveis.
          </p>
        </div>
      </section>

      {/* MISSÃO + VISÃO */}
      <section className="px-6 pt-2">
        <div className="mx-auto grid max-w-[980px] grid-cols-1 gap-[18px] md:grid-cols-2">
          <Reveal className="rounded-card border border-border-soft bg-white p-8">
            <p className="m-0 mb-[10px] text-[12px] font-black tracking-[0.08em] text-cherry">MISSÃO</p>
            <p className="m-0 text-[20px] font-extrabold leading-[1.4] tracking-[-0.01em]">
              Tornar o dinheiro digital simples, acessível e instantâneo para todos.
            </p>
          </Reveal>
          <Reveal delay={80} className="rounded-card border border-border-soft bg-white p-8">
            <p className="m-0 mb-[10px] text-[12px] font-black tracking-[0.08em] text-cherry">VISÃO</p>
            <p className="m-0 text-[20px] font-extrabold leading-[1.4] tracking-[-0.01em]">
              Construir uma infraestrutura financeira moderna para pessoas, negócios e programadores.
            </p>
          </Reveal>
        </div>
      </section>

      {/* O QUE ACREDITAMOS */}
      <section className="px-6 pb-2 pt-14">
        <div className="mx-auto max-w-[980px]">
          <Reveal>
            <h2 className="m-0 mb-[22px] text-center text-[clamp(24px,3.4vw,34px)] font-black tracking-[-0.025em]">
              O que acreditamos
            </h2>
          </Reveal>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {VALORES.map((v, i) => (
              <Reveal
                key={v.label}
                delay={i * 60}
                className="rounded-[18px] border border-border-soft bg-cream-50 px-4 py-[22px] text-center"
              >
                <span className="mb-3 inline-flex h-[46px] w-[46px] items-center justify-center rounded-[13px] bg-[linear-gradient(150deg,#FBD2D0,#FFE7E5)]">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    {v.icon}
                  </svg>
                </span>
                <p className="m-0 text-[15px] font-extrabold">{v.label}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* PORQUE ANGOLA (bordô) */}
      <section className="px-6 py-14">
        <Reveal className="relative mx-auto max-w-[980px] overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#6E0E14,#9A1B22)] p-[clamp(32px,5vw,56px)] text-white">
          <div
            className="pointer-events-none absolute -right-[60px] -top-[80px] h-[260px] w-[260px] rounded-full"
            style={{
              background:
                'radial-gradient(circle,rgba(255,255,255,.12),rgba(255,255,255,0) 68%)',
            }}
          />
          <p className="relative m-0 mb-[14px] text-[12px] font-black tracking-[0.08em] text-pink-200">
            PORQUE ANGOLA
          </p>
          <p className="relative m-0 max-w-[740px] text-[clamp(20px,2.8vw,28px)] font-extrabold leading-[1.45] tracking-[-0.01em]">
            Angola precisa de soluções digitais simples, modernas e adaptadas à realidade local —
            feitas para o dia a dia de pessoas e comerciantes.
          </p>
        </Reveal>
      </section>

      {/* EQUIPA */}
      <section className="px-6 pb-2 pt-0">
        <Reveal className="mx-auto max-w-[760px] rounded-card border border-dashed border-[#E8C8C6] bg-cream-50 px-6 py-9 text-center">
          <p className="m-0 mb-[10px] text-[12px] font-black tracking-[0.08em] text-cherry">EQUIPA</p>
          <p className="m-0 text-[17px] font-bold leading-[1.55] text-ink-secondary">
            A equipa fundadora será apresentada em breve.
          </p>
        </Reveal>
      </section>

      {/* CLOSING CTA */}
      <section className="px-6 pb-20 pt-14">
        <Reveal className="mx-auto max-w-[760px] rounded-card border border-border-soft bg-[linear-gradient(135deg,#FFF3F1,#FFE6E4)] px-6 py-11 text-center">
          <h3 className="m-0 text-[clamp(24px,3.4vw,32px)] font-black tracking-[-0.025em]">
            Comece com Banzami
          </h3>
          <p className="m-0 mb-[22px] mt-3 text-[16px] font-semibold text-ink-secondary">
            A nova forma de pagar, enviar e receber em Kwanza.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/produto#contacto"
              className="inline-flex items-center gap-2 rounded-pill bg-cherry px-7 py-[14px] text-[15px] font-extrabold text-white no-underline shadow-[0_12px_26px_-10px_rgba(181,16,31,.55)] transition-transform hover:-translate-y-0.5"
            >
              Começar
            </Link>
            <a
              href={mailto()}
              className="inline-flex items-center gap-2 rounded-pill border border-border-softer bg-white px-7 py-[14px] text-[15px] font-extrabold text-cherry-dark no-underline transition-transform hover:-translate-y-0.5"
            >
              Fale connosco
            </a>
          </div>
        </Reveal>
      </section>

      <CTASection />
      <Footer />
    </main>
  );
}
