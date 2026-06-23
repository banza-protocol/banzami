import Link from 'next/link';
import { SITE, mailto } from '@/lib/site';
import { Reveal } from '../Reveal';

// Final developer CTA (Stripe-style): documentation is the primary action,
// examples secondary, contact only as a discreet support helper. Used as the
// closing CTA on /developers.
export function DeveloperCTA() {
  return (
    <section className="px-6 py-[clamp(56px,8vw,100px)]">
      <Reveal className="relative mx-auto max-w-[1080px] overflow-hidden rounded-[36px] bg-[linear-gradient(150deg,#B5101F,#9A1B22)] p-[clamp(40px,6vw,76px)] text-center">
        <div className="pointer-events-none absolute -left-[60px] -top-[100px] h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,rgba(232,67,75,.6),rgba(232,67,75,0)_64%)]" />
        <div className="pointer-events-none absolute -bottom-[120px] -right-[50px] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.32),rgba(251,210,208,0)_64%)]" />
        <div className="relative">
          <h2 className="m-0 text-[clamp(30px,5vw,52px)] font-black leading-[1.04] tracking-[-0.025em] text-white">
            Pronto para integrar?
          </h2>
          <p className="mx-auto mt-[18px] max-w-[560px] text-[17px] font-semibold leading-[1.55] text-pink-200">
            Comece pela documentação, teste em sandbox e prepare a sua integração.
          </p>
          <div className="mt-[30px] flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/developers#docs"
              className="inline-flex items-center gap-2 rounded-[40px] bg-white px-[30px] py-4 text-[16px] font-extrabold text-cherry no-underline transition-transform hover:-translate-y-0.5"
            >
              Ver documentação
            </Link>
            <Link
              href="/developers#examples"
              className="inline-flex items-center gap-2 rounded-[40px] border border-white/30 bg-white/[0.14] px-7 py-4 text-[16px] font-extrabold text-white no-underline transition-transform hover:-translate-y-0.5"
            >
              Ver exemplos
            </Link>
          </div>
          <p className="m-0 mt-[22px] text-[14px] font-semibold text-pink-200">
            Precisa de ajuda?{' '}
            <a
              href={mailto('Apoio a programadores Banzami')}
              className="bz-mono font-extrabold text-white underline-offset-2 hover:underline"
            >
              {SITE.email}
            </a>
          </p>
        </div>
      </Reveal>
    </section>
  );
}
