import Link from 'next/link';
import { Reveal } from '@/components/Reveal';

// Two ways into Banzami — receive as a business, or integrate as a developer.
// A deepening of the hero's two audience cards, not a repeat: each names its own
// tools and links to its own surface. Kept compact and premium — no feature list.

const DEVELOPERS_URL = 'https://developers.banzami.com/login';
const DOCS_URL = 'https://developers.banzami.com/docs';

function Arrow() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HomePaths() {
  const card = 'flex flex-col rounded-[28px] border border-border-soft bg-white p-[clamp(24px,3vw,38px)] shadow-[0_30px_70px_-56px_rgba(181,16,31,.4)]';
  const iconTile = 'mb-6 grid h-14 w-14 place-items-center rounded-[16px]';
  const eyebrow = 'm-0 mb-3 text-[12px] font-black tracking-[0.12em]';
  const title = 'm-0 text-[clamp(23px,2.4vw,30px)] font-black leading-[1.08] tracking-[-0.02em] text-ink';
  const body = 'm-0 mt-3 max-w-[380px] text-[15.5px] font-semibold leading-[1.55] text-ink-secondary';

  return (
    <section className="bg-[#FFF7F6] px-6 py-[clamp(64px,9vw,108px)]">
      <div className="mx-auto grid max-w-container grid-cols-1 gap-[clamp(18px,2.4vw,28px)] lg:grid-cols-2">
        {/* Negócios */}
        <Reveal className={card}>
          <span className={`${iconTile} bg-pink-100 text-cherry`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8.5 5.2 5h13.6L20 8.5M4 8.5h16M4 8.5v10a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-10M9 8.5v3M15 8.5v3" />
            </svg>
          </span>
          <p className={`${eyebrow} text-cherry`}>NEGÓCIOS</p>
          <h3 className={title}>Receba com Banzami</h3>
          <p className={body}>Use QR, links e ferramentas de cobrança para receber pagamentos na Sandbox.</p>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/comerciantes" className="inline-flex items-center gap-2 text-[15px] font-black text-cherry no-underline transition hover:gap-2.5 hover:text-cherry-dark">
              Explorar para negócios <Arrow />
            </Link>
          </div>
        </Reveal>

        {/* Developers */}
        <Reveal delay={80} className={card}>
          <span className={`${iconTile} bg-ink text-white`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8.5 8 4.5 12l4 4M15.5 8l4 4-4 4" />
            </svg>
          </span>
          <p className={`${eyebrow} text-ink-muted`}>DEVELOPERS</p>
          <h3 className={title}>Integre Banzami</h3>
          <p className={body}>APIs, SDKs e webhooks para testar pagamentos diretamente no seu produto.</p>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
            <a href={DEVELOPERS_URL} className="inline-flex items-center gap-2 text-[15px] font-black text-cherry no-underline transition hover:gap-2.5 hover:text-cherry-dark">
              Portal Developers <Arrow />
            </a>
            <a href={DOCS_URL} className="inline-flex items-center gap-2 text-[15px] font-bold text-ink-secondary no-underline transition hover:text-ink">
              Documentação <Arrow />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
