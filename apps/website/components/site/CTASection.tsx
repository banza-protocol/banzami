import Link from 'next/link';
import { SITE, mailto } from '@/lib/site';
import { PUBLIC_TRUTH } from '@/lib/public-truth';
import { Reveal } from '../Reveal';

// Shared final CTA. It points at what exists — the public Sandbox — rather than a
// waitlist, and speaks to the reader as "você", like the rest of the site.
export function CTASection({ id }: { id?: string }) {
  return (
    <section id={id} className="px-6 py-[clamp(56px,8vw,100px)]">
      <Reveal className="relative mx-auto max-w-[1080px] overflow-hidden rounded-[36px] bg-[linear-gradient(150deg,#B5101F,#9A1B22)] p-[clamp(40px,6vw,76px)] text-center">
        <div className="pointer-events-none absolute -left-[60px] -top-[100px] h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,rgba(232,67,75,.6),rgba(232,67,75,0)_64%)]" />
        <div className="pointer-events-none absolute -bottom-[120px] -right-[50px] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.32),rgba(251,210,208,0)_64%)]" />
        <div className="relative">
          <h2 className="m-0 text-[clamp(30px,5vw,52px)] font-black leading-[1.04] tracking-[-0.025em] text-white">
            Construa com o Banzami.
          </h2>
          <p className="mx-auto mt-[18px] max-w-[540px] text-[17px] font-semibold leading-[1.55] text-pink-200">
            A {PUBLIC_TRUTH.sandbox.name} está aberta a developers, sem aprovação e com dinheiro fictício.
            Para parcerias ou dúvidas, fale connosco.
          </p>
          <div className="mt-[30px] flex flex-wrap justify-center gap-3">
            <Link
              href="/developers"
              className="inline-flex items-center gap-2 rounded-[40px] bg-white px-[30px] py-4 text-[16px] font-extrabold text-cherry no-underline transition-transform hover:-translate-y-0.5"
            >
              Plataforma para developers
            </Link>
            <a
              href={mailto()}
              className="inline-flex items-center gap-2 rounded-[40px] border border-white/30 bg-white/[0.14] px-7 py-4 text-[16px] font-extrabold text-white no-underline transition-colors hover:bg-white/20"
            >
              Falar connosco
            </a>
          </div>
          <p className="bz-mono mt-[26px] text-[13px] text-pink-200">{SITE.email}</p>
        </div>
      </Reveal>
    </section>
  );
}
