import { Reveal } from '@/components/Reveal';

// The homepage's three pillars — the most recognisable things Banzami does,
// stated in plain words. Premium and spacious: one icon, one title, one line.
// No feature grid, no dashboard, no Sandbox repetition.

type Pillar = { icon: React.ReactNode; title: string; body: string };

const PILLARS: Pillar[] = [
  {
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <path d="M14 14h3v3M21 14v.01M17 21h4M21 17.5v3.5M14 21h.01" />
      </svg>
    ),
    title: 'Pague e receba por QR',
    body: 'Uma forma direta de pagar e cobrar com a Banzami.',
  },
  {
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M16 8v5a3 3 0 0 0 5 0v-1a9 9 0 1 0-3.6 7.2" />
      </svg>
    ),
    title: 'Envie para um @banza',
    body: 'Use um identificador simples para pessoas e negócios.',
  },
  {
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 3h9l5 5v10.5A2.5 2.5 0 0 1 17.5 21h-11A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3" />
        <path d="M14 3v5h5" />
        <path d="M8.5 14l2.5 2.5 4.5-5" />
      </svg>
    ),
    title: 'Comprovativos verificáveis',
    body: 'Cada pagamento deixa um registo claro e consultável.',
  },
];

export function HomeBenefits() {
  return (
    <section className="bg-white px-6 py-[clamp(64px,9vw,108px)]">
      <div className="mx-auto max-w-container">
        <Reveal className="mx-auto mb-[clamp(40px,5vw,64px)] max-w-[620px] text-center">
          <p className="m-0 mb-3 text-[13px] font-black tracking-[0.14em] text-cherry">O ESSENCIAL</p>
          <h2 className="m-0 text-[clamp(28px,4.2vw,46px)] font-black leading-[1.05] tracking-[-0.025em] text-ink">
            Simples de usar. Claro de confirmar.
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-[clamp(20px,3vw,40px)] md:grid-cols-3">
          {PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={i * 90} className="text-center md:text-left">
              <span className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-[18px] bg-pink-100 text-cherry md:mx-0">
                {p.icon}
              </span>
              <h3 className="m-0 text-[clamp(20px,1.6vw,23px)] font-black leading-[1.15] tracking-[-0.01em] text-ink">
                {p.title}
              </h3>
              <p className="m-0 mt-[10px] text-[15.5px] font-semibold leading-[1.55] text-ink-secondary">
                {p.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
