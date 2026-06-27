import Link from 'next/link';
import type { ReactNode } from 'react';
import { SITE, mailto } from '@/lib/site';
import { Logo, BrandMark } from './BrandMark';

// Official Banzami footer — faithful port of the Claude Design reference.
// Three blocks (institutional · Explorar · red CTA card) + a bottom bar.
// Real routes only; no banzami.org, no .dc.html.

type IconKey =
  | 'produtos' | 'sobre' | 'comerciantes' | 'contacto' | 'developers'
  | 'waitlist' | 'suporte' | 'banza' | 'qr' | 'at' | 'shieldcheck' | 'lock';

/** Inline SVG icons — stroke style consistent with the navigation. */
function Icon({ name, size = 18 }: { name: IconKey; size?: number }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const svg: Record<IconKey, ReactNode> = {
    produtos: (<><path d="M12 3l8 4v10l-8 4-8-4V7l8-4z" {...p} /><path d="M4 7l8 4 8-4M12 11v10" {...p} /></>),
    sobre: (<><circle cx="12" cy="12" r="9" {...p} /><path d="M12 16.5v-5" {...p} /><circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none" /></>),
    comerciantes: (<><path d="M4 9l1-4h14l1 4a2.5 2.5 0 01-5 0 2.5 2.5 0 01-5 0 2.5 2.5 0 01-5 0z" {...p} /><path d="M5 11v8h14v-8" {...p} /><path d="M9.5 19v-4h5v4" {...p} /></>),
    contacto: (<><rect x="3" y="5" width="18" height="14" rx="2.5" {...p} /><path d="M3.5 7.5l8.5 6 8.5-6" {...p} /></>),
    developers: (<path d="M8.5 8l-4 4 4 4M15.5 8l4 4-4 4" {...p} />),
    waitlist: (<><circle cx="9" cy="8" r="3.4" {...p} /><path d="M3.5 19a5.5 5.5 0 0111 0" {...p} /><path d="M18.5 8v5M16 10.5h5" {...p} /></>),
    suporte: (<><path d="M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6l7-3z" {...p} /></>),
    banza: (<><path d="M12 3l9 5-9 5-9-5 9-5z" {...p} /><path d="M3 13l9 5 9-5" {...p} /></>),
    qr: (<><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" {...p} /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" {...p} /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" {...p} /><path d="M13.5 13.5h3M20 13.5v.01M13.5 20h6.5M20 16.5v.01M16.5 16.5v3.5" {...p} /></>),
    at: (<><circle cx="12" cy="12" r="3.6" {...p} /><path d="M15.6 12v1.6a2.4 2.4 0 004.8 0V12a8.4 8.4 0 10-3.3 6.7" {...p} /></>),
    shieldcheck: (<><path d="M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6l7-3z" {...p} /><path d="M9.2 11.6l1.9 1.9 3.7-3.7" {...p} /></>),
    lock: (<><rect x="5" y="11" width="14" height="9" rx="2.5" {...p} /><path d="M8 11V8a4 4 0 018 0v3" {...p} /></>),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {svg[name]}
    </svg>
  );
}

/** Chevron (internal) / external arrow for the Explorar tiles. */
function TileArrow({ external }: { external?: boolean }) {
  return external ? (
    <svg className="bz-foot-arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg className="bz-foot-arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type ExploreLink = { label: string; href: string; icon: IconKey; external?: boolean };

// Mirrors the official navbar taxonomy, in order (row-major across the grid),
// followed by Suporte and Contacto.
const EXPLORE: ExploreLink[] = [
  { label: 'Produto', href: '/produto', icon: 'produtos' },
  { label: 'Para comerciantes', href: '/comerciantes', icon: 'comerciantes' },
  { label: 'Para empresas', href: '/developers', icon: 'developers' },
  { label: 'Segurança', href: '/produto#seguranca', icon: 'shieldcheck' },
  { label: 'BANZA', href: SITE.protocolUrl, icon: 'banza', external: true },
  { label: 'Sobre nós', href: '/sobre', icon: 'sobre' },
  { label: 'Suporte', href: '/suporte', icon: 'suporte' },
  { label: 'Contacto', href: '/produto#contacto', icon: 'contacto' },
];

const CHIPS: { label: string; icon: IconKey }[] = [
  { label: 'Pagamentos por QR', icon: 'qr' },
  { label: '@banza', icon: 'at' },
  { label: 'Comprovativo vivo', icon: 'shieldcheck' },
];

/** Internal `/` routes use next/link; mailto/external use a plain anchor. */
function ExploreTile({ link }: { link: ExploreLink }) {
  const cls =
    'bz-foot-tile group flex items-center gap-[14px] rounded-[16px] bg-cream-50 p-[14px] no-underline transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#B5101F] focus-visible:outline-offset-2';
  const inner = (
    <>
      <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-white text-cherry shadow-[0_4px_10px_-6px_rgba(181,16,31,0.5)]">
        <Icon name={link.icon} />
      </span>
      <span className="flex-1 text-[15px] font-extrabold leading-[1.2] text-ink">{link.label}</span>
      <span className="flex-none text-ink-muted">
        <TileArrow external={link.external} />
      </span>
    </>
  );
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    );
  }
  if (link.href.startsWith('mailto:')) {
    return (
      <a href={link.href} className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={link.href} className={cls}>
      {inner}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="bg-cream-50 px-6 pb-12 pt-14">
      <div className="mx-auto grid max-w-container grid-cols-1 gap-5 lg:grid-cols-[1fr_1.32fr_1fr]">
        {/* ---------- A · Institutional ---------- */}
        <section className="rounded-[28px] border border-[rgba(181,16,31,0.10)] bg-white p-[clamp(26px,2.6vw,36px)] shadow-[0_20px_50px_-40px_rgba(181,16,31,0.35)]">
          <Link href="/" className="inline-flex no-underline">
            <Logo size={42} markSize={22} />
          </Link>
          <p className="m-0 mt-[18px] text-[18px] font-black leading-[1.25] text-cherry">
            A carteira Kwanza de Angola.
          </p>
          <p className="m-0 mt-[14px] max-w-[340px] text-[14.5px] font-semibold leading-[1.6] text-ink-soft">
            Simples, segura e feita para todos. Pagamentos instantâneos, QR e @handles numa
            experiência pensada para o dia a dia em Angola.
          </p>
          <div className="mt-[22px] flex flex-wrap gap-[10px]">
            {CHIPS.map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-[7px] rounded-pill bg-cream-100 px-[13px] py-[9px] text-[13px] font-extrabold text-cherry-dark"
              >
                <Icon name={c.icon} size={16} />
                {c.label}
              </span>
            ))}
          </div>
        </section>

        {/* ---------- B · Explorar ---------- */}
        <section className="rounded-[28px] border border-[rgba(181,16,31,0.10)] bg-white p-[clamp(26px,2.6vw,36px)] shadow-[0_20px_50px_-40px_rgba(181,16,31,0.35)]">
          <p className="m-0 mb-[18px] text-[22px] font-black tracking-[-0.01em] text-ink">Explorar</p>
          <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
            {EXPLORE.map((l) => (
              <ExploreTile key={l.label} link={l} />
            ))}
          </div>
          <p className="m-0 mt-[20px] text-[13.5px] font-semibold leading-[1.55] text-ink-muted">
            Tudo o que precisas para usar, integrar e confiar no Banzami.
          </p>
        </section>

        {/* ---------- C · Red CTA card ---------- */}
        <section
          className="relative overflow-hidden rounded-[28px] p-[clamp(26px,2.6vw,36px)] text-white shadow-[0_24px_60px_-34px_rgba(181,16,31,0.7)]"
          style={{ background: 'linear-gradient(158deg,#B5101F,#9A1B22)' }}
        >
          {/* faint concentric rings, decorative */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -right-20 h-[260px] w-[260px] rounded-full"
            style={{ border: '40px solid rgba(255,255,255,0.05)' }}
          />
          <div className="relative">
            <p className="m-0 text-[24px] font-black tracking-[-0.01em]">Explorar Banzami</p>
            <p className="m-0 mt-[14px] text-[15px] font-semibold leading-[1.55] text-white/85">
              Baixa a app ou junta-te à waitlist e sê um dos primeiros a experimentar o futuro dos
              pagamentos em Angola.
            </p>

            <a
              href="/app-demo"
              className="bz-foot-cta mt-[22px] flex items-center justify-between rounded-[16px] bg-white px-[20px] py-[16px] text-[15px] font-extrabold text-cherry no-underline transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
            >
              Ver a app
              <svg className="bz-foot-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="#B5101F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>

            <a
              href={mailto('Waitlist Banzami')}
              className="bz-foot-cta mt-[12px] flex items-center justify-between rounded-[16px] border border-white/25 bg-white/[0.12] px-[20px] py-[16px] text-[15px] font-extrabold text-white no-underline transition hover:bg-white/[0.2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
            >
              Entrar na waitlist
              <svg className="bz-foot-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>

            <p className="m-0 mt-[18px] text-[13px] font-semibold leading-[1.5] text-white/70">
              Banzami é construído sobre o protocolo aberto <span className="font-black text-white">BANZA</span>.
            </p>
          </div>
        </section>
      </div>

      {/* ---------- Bottom bar ---------- */}
      <div className="mx-auto mt-5 max-w-container">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-[rgba(181,16,31,0.10)] bg-white px-[clamp(20px,2.4vw,30px)] py-[18px]">
          <p className="m-0 flex items-center gap-[9px] text-[13.5px] font-semibold text-ink-soft">
            <span className="text-ink-muted"><Icon name="lock" size={16} /></span>
            Seguro por design. Privacidade por padrão.
          </p>
          <p className="bz-mono m-0 text-[13px] font-semibold text-ink-muted">© 2026 Banzami</p>
          <p className="m-0 flex items-center gap-[10px] text-[14px] font-black text-ink">
            Banzami é como Angola paga.
            <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-tile bg-cherry shadow-[0_6px_14px_-4px_rgba(181,16,31,.5)]">
              <BrandMark size={17} />
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
