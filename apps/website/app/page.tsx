import Link from 'next/link';
import { SiteHeader } from '@/components/site/SiteHeader';
import { BrandMark, Logo } from '@/components/site/BrandMark';
import { AppDemo } from '@/components/app/AppDemo';
import { SITE, mailto } from '@/lib/site';

// Merchant handles for the hero marquee (duplicated so the -50% loop is seamless).
const MERCHANTS = [
  { initial: 'C', handle: '@cantina-alex', bg: '#FBD2D0', fg: '#B5101F' },
  { initial: 'P', handle: '@padaria-luanda', bg: '#F8B4B1', fg: '#9A1B22' },
  { initial: 'M', handle: '@mercado-k', bg: '#E8434B', fg: '#fff' },
  { initial: 'F', handle: '@farmacia-vida', bg: '#FFE0DE', fg: '#B5101F' },
  { initial: 'T', handle: '@taxi-luanda', bg: '#F8B4B1', fg: '#9A1B22' },
  { initial: 'L', handle: '@loja-bita', bg: '#FBD2D0', fg: '#B5101F' },
];

function MerchantChip({ m }: { m: (typeof MERCHANTS)[number] }) {
  return (
    <span className="inline-flex flex-none items-center gap-[9px] rounded-pill border border-border-soft bg-white py-[7px] pl-[7px] pr-[15px] shadow-[0_6px_16px_-10px_rgba(181,16,31,.25)]">
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black"
        style={{ background: m.bg, color: m.fg }}
      >
        {m.initial}
      </span>
      <span className="bz-mono whitespace-nowrap text-[12.5px] font-semibold text-[#3a2a2e]">{m.handle}</span>
    </span>
  );
}

const STATS = [
  {
    value: '0',
    label: 'UTILIZADORES',
    icon: (
      <>
        <circle cx="9" cy="8.5" r="3" stroke="#B5101F" strokeWidth="1.9" />
        <path d="M3.5 19a5.5 5.5 0 0111 0" stroke="#B5101F" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M16 6a3 3 0 010 5.6M16.5 13.5a5.5 5.5 0 014 5.3" stroke="#B5101F" strokeWidth="1.9" strokeLinecap="round" />
      </>
    ),
  },
  {
    value: '0',
    label: 'COMERCIANTES',
    icon: (
      <>
        <path d="M4 10v8a1 1 0 001 1h14a1 1 0 001-1v-8" stroke="#B5101F" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M3 6h18l-1.2 4.2a2.2 2.2 0 01-4.2 0 2.2 2.2 0 01-4.4 0 2.2 2.2 0 01-4.4 0A2.2 2.2 0 014.2 10L3 6z" stroke="#B5101F" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M9 19v-4h4v4" stroke="#B5101F" strokeWidth="1.9" strokeLinejoin="round" />
      </>
    ),
  },
  {
    value: '0',
    label: 'TRANSAÇÕES/DIA',
    icon: (
      <>
        <rect x="3" y="6" width="13" height="11" rx="2.5" stroke="#B5101F" strokeWidth="1.9" />
        <path d="M3 10h13" stroke="#B5101F" strokeWidth="1.9" />
        <path d="M17 13h4m0 0l-2-2m2 2l-2 2" stroke="#B5101F" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    value: '18',
    label: 'PROVÍNCIAS',
    icon: (
      <>
        <path d="M12 21s6.5-5.4 6.5-10.5A6.5 6.5 0 005.5 10.5C5.5 15.6 12 21 12 21z" stroke="#B5101F" strokeWidth="1.9" strokeLinejoin="round" />
        <circle cx="12" cy="10.3" r="2.4" stroke="#B5101F" strokeWidth="1.9" />
      </>
    ),
  },
];

const EXPLORE: { label: string; href: string; external?: boolean; mailto?: boolean; arrow: 'chev' | 'out'; icon: React.ReactNode }[] = [
  { label: 'Produtos', href: '/produto', arrow: 'chev', icon: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" stroke="#B5101F" strokeWidth="1.7" strokeLinejoin="round" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" stroke="#B5101F" strokeWidth="1.7" strokeLinejoin="round" /></> },
  { label: 'Sobre', href: '/sobre', arrow: 'chev', icon: <><circle cx="12" cy="12" r="9" stroke="#B5101F" strokeWidth="1.7" /><path d="M12 11.5v4.5M12 8h.01" stroke="#B5101F" strokeWidth="1.7" strokeLinecap="round" /></> },
  { label: 'Comerciantes', href: '/comerciantes', arrow: 'chev', icon: <><path d="M4 10v8a1 1 0 001 1h14a1 1 0 001-1v-8" stroke="#B5101F" strokeWidth="1.7" strokeLinejoin="round" /><path d="M3 6h18l-1.2 4.2a2.2 2.2 0 01-4.2 0 2.2 2.2 0 01-4.4 0 2.2 2.2 0 01-4.4 0A2.2 2.2 0 014.2 10L3 6z" stroke="#B5101F" strokeWidth="1.7" strokeLinejoin="round" /></> },
  { label: 'Contacto', href: mailto(), mailto: true, arrow: 'chev', icon: <><rect x="3" y="5" width="18" height="14" rx="3" stroke="#B5101F" strokeWidth="1.7" /><path d="M4 7.5l8 5 8-5" stroke="#B5101F" strokeWidth="1.7" strokeLinecap="round" /></> },
  { label: 'Developers', href: '/developers', arrow: 'chev', icon: <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" stroke="#B5101F" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /> },
  { label: 'Waitlist', href: mailto('Waitlist Banzami'), mailto: true, arrow: 'chev', icon: <><circle cx="9" cy="9" r="3" stroke="#B5101F" strokeWidth="1.7" /><path d="M3.5 19a5.5 5.5 0 0111 0" stroke="#B5101F" strokeWidth="1.7" strokeLinecap="round" /><path d="M16 7a3 3 0 010 5.6" stroke="#B5101F" strokeWidth="1.7" strokeLinecap="round" /></> },
  { label: 'Suporte', href: '/suporte', arrow: 'chev', icon: <path d="M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6l7-3z" stroke="#B5101F" strokeWidth="1.7" strokeLinejoin="round" /> },
  { label: 'Protocolo BANZA', href: SITE.protocolUrl, external: true, arrow: 'out', icon: <><path d="M12 3l9 5-9 5-9-5 9-5z" stroke="#B5101F" strokeWidth="1.7" strokeLinejoin="round" /><path d="M3 12l9 5 9-5" stroke="#B5101F" strokeWidth="1.7" strokeLinejoin="round" /></> },
];

function ExploreTile({ tile }: { tile: (typeof EXPLORE)[number] }) {
  const inner = (
    <>
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[8px] bg-white">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">{tile.icon}</svg>
      </span>
      <span className="flex-1 text-[13.5px] font-extrabold text-ink">{tile.label}</span>
      {tile.arrow === 'chev' ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="#c2a8aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17L17 7M17 7H9M17 7v8" stroke="#c2a8aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      )}
    </>
  );
  const cls = 'flex items-center gap-[9px] rounded-[12px] bg-cream-50 px-3 py-[9px] no-underline transition-colors hover:bg-[#FBE6E4]';
  if (tile.external) return <a href={tile.href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>;
  if (tile.mailto) return <a href={tile.href} className={cls}>{inner}</a>;
  return <Link href={tile.href} className={cls}>{inner}</Link>;
}

export default function HomePage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <SiteHeader />

      {/* ===================== HERO ===================== */}
      <section id="inicio" className="relative overflow-hidden px-6 pb-2 pt-[78px]">
        <div className="pointer-events-none absolute -right-[120px] -top-[120px] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.7),rgba(251,210,208,0)_66%)]" />
        <div className="pointer-events-none absolute -left-[160px] top-[240px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(232,67,75,.12),rgba(232,67,75,0)_66%)]" />
        <div className="bz-herogrid relative mx-auto grid max-w-container grid-cols-1 items-center gap-12 md:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="mb-6 inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2 text-[13px] font-extrabold text-cherry shadow-[0_6px_18px_-8px_rgba(181,16,31,.3)]">
              <span className="block h-2 w-2 rounded-full bg-cherry" />A carteira Kwanza de Angola
            </span>
            <h1 className="m-0 text-[clamp(32px,5.4vw,56px)] font-black leading-[1.02] tracking-[-0.03em] text-ink">
              O novo caminho do Kwanza.
            </h1>
            <p className="m-0 mt-[22px] max-w-[520px] text-[clamp(16px,1.5vw,19px)] font-semibold leading-[1.55] text-ink-secondary">
              Cada conta é uma carteira em Kwanza. Paga por QR, envia para um{' '}
              <span className="bz-mono font-semibold text-cherry">@banza</span> e recebe em segundos
              — sem dinheiro físico, sem comprovativos.
            </p>
            <div className="mt-[18px] flex flex-wrap gap-3">
              <Link href="/produto#contacto" className="inline-flex items-center gap-[11px] rounded-[16px] bg-gradient-to-b from-cherry to-cherry-deeper px-5 py-[11px] no-underline shadow-[0_16px_32px_-12px_rgba(181,16,31,.5)] transition-transform hover:-translate-y-0.5">
                <svg width="21" height="23" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.88 2.65 3.22 2.6 1.29-.05 1.78-.83 3.34-.83 1.55 0 2 .83 3.37.81 1.39-.03 2.27-1.27 3.12-2.53.98-1.45 1.39-2.85 1.41-2.92-.03-.01-2.7-1.04-2.73-4.11z" /><path d="M14.69 4.86c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-2.99 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.3-.58 3.01-1.44z" /></svg>
                <span className="flex flex-col leading-[1.12]">
                  <span className="text-[10px] font-bold tracking-[0.07em] text-white/70">DISPONÍVEL NA</span>
                  <span className="text-[17px] font-extrabold text-white">App Store</span>
                </span>
              </Link>
              <Link href="/produto#contacto" className="inline-flex items-center gap-[11px] rounded-[16px] bg-gradient-to-b from-cherry to-cherry-deeper px-5 py-[11px] no-underline shadow-[0_16px_32px_-12px_rgba(181,16,31,.5)] transition-transform hover:-translate-y-0.5">
                <svg width="21" height="23" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M5 3.5v17l14-8.5z" /></svg>
                <span className="flex flex-col leading-[1.12]">
                  <span className="text-[10px] font-bold tracking-[0.07em] text-white/70">DISPONÍVEL NA</span>
                  <span className="text-[17px] font-extrabold text-white">Google Play</span>
                </span>
              </Link>
            </div>
            <div className="mt-[30px] max-w-[540px]">
              <p className="m-0 mb-3 text-[12px] font-black tracking-[0.08em] text-ink-muted">COMERCIANTES &amp; EMPRESAS</p>
              <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)] [-webkit-mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
                <div className="anim-marquee flex w-max gap-[10px]">
                  {[...MERCHANTS, ...MERCHANTS].map((m, i) => (
                    <MerchantChip key={i} m={m} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* interactive app demo */}
          <div className="relative flex min-h-[680px] flex-col items-center justify-center">
            <div className="absolute h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,rgba(232,67,75,.1),rgba(232,67,75,0)_70%)]" />
            <div className="anim-floatyB absolute left-[14px] top-10 h-[60px] w-[60px] rounded-[20px] bg-pink-200" />
            <div className="anim-floaty-5 absolute bottom-24 right-1 h-11 w-11 rounded-[13px] bg-cherry-coral opacity-[0.85]" />
            <AppDemo />
            <span className="mt-5 inline-flex items-center gap-2 rounded-pill bg-white px-4 py-[9px] text-[12.5px] font-extrabold text-cherry-dark shadow-[0_10px_24px_-12px_rgba(181,16,31,.35)]">
              <span className="block h-[7px] w-[7px] rounded-full bg-cherry" />Toca para navegar na app
            </span>
          </div>
        </div>
      </section>

      {/* ===================== STATS STRIP ===================== */}
      <section className="px-6 pb-4 pt-2">
        <div className="relative mx-auto max-w-container overflow-hidden rounded-[26px] border border-white/70 bg-[linear-gradient(135deg,#FFFCFB_0%,#FFF3F1_58%,#FFE9E7_100%)] p-[clamp(18px,2.4vw,26px)] shadow-[0_30px_70px_-50px_rgba(181,16,31,.5)]">
          <div className="bz-stats grid grid-cols-2 gap-3 lg:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="flex items-center gap-[13px] rounded-[18px] border border-border-soft bg-white px-[15px] py-[13px] shadow-[0_14px_30px_-26px_rgba(181,16,31,.3)] transition-all hover:-translate-y-[3px]">
                <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[13px] bg-[linear-gradient(150deg,#FBD2D0,#FFE7E5)]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">{s.icon}</svg>
                </span>
                <div className="min-w-0">
                  <p className="m-0 text-[clamp(24px,2.6vw,33px)] font-black leading-none tracking-[-0.03em] text-cherry">{s.value}</p>
                  <p className="m-0 mt-[5px] whitespace-nowrap text-[11px] font-extrabold tracking-[0.08em] text-ink-muted">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== ZONA FINAL ===================== */}
      <section className="px-6 pb-[18px] pt-2">
        <div className="bz-footgrid mx-auto grid max-w-container grid-cols-1 gap-4 md:grid-cols-[1fr_1.1fr_0.9fr]">
          {/* brand card */}
          <div className="relative overflow-hidden rounded-card border border-border-soft bg-white p-7 shadow-[0_20px_50px_-36px_rgba(181,16,31,.3)]">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(232,67,75,.08),rgba(232,67,75,0)_70%)]" />
            <Logo />
            <p className="m-0 mt-3 text-[14px] font-extrabold text-cherry">A carteira Kwanza de Angola.</p>
            <p className="m-0 mb-[18px] mt-[10px] text-[14px] font-semibold leading-[1.55] text-ink-soft">
              Simples, segura e feita para todos. Pagamentos instantâneos, QR e @handles numa
              experiência pensada para o dia a dia em Angola.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-[6px] rounded-pill border border-border-soft bg-cream-100 px-3 py-[6px] text-[12px] font-extrabold text-cherry-dark">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#9A1B22" strokeWidth="1.9" /><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#9A1B22" strokeWidth="1.9" /><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="#9A1B22" strokeWidth="1.9" /><path d="M14 14h3v3M21 14v7h-7" stroke="#9A1B22" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Pagamentos por QR
              </span>
              <span className="inline-flex items-center gap-[6px] rounded-pill border border-border-soft bg-cream-100 px-3 py-[6px] text-[12px] font-extrabold text-cherry-dark">
                <span className="bz-mono text-[14px] font-semibold leading-none text-cherry-dark">@</span>@banza
              </span>
              <span className="inline-flex items-center gap-[6px] rounded-pill border border-border-soft bg-cream-100 px-3 py-[6px] text-[12px] font-extrabold text-cherry-dark">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6l7-3z" stroke="#9A1B22" strokeWidth="1.9" strokeLinejoin="round" /><path d="M9.2 11.6l1.9 1.9 3.7-3.7" stroke="#9A1B22" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Comprovativo vivo
              </span>
            </div>
          </div>

          {/* explore card */}
          <div className="rounded-card border border-border-soft bg-white p-7 shadow-[0_20px_50px_-36px_rgba(181,16,31,.3)]">
            <h3 className="m-0 mb-4 text-[18px] font-black text-ink">Explorar</h3>
            <div className="grid grid-cols-1 gap-[9px] sm:grid-cols-2">
              {EXPLORE.map((t) => (
                <ExploreTile key={t.label} tile={t} />
              ))}
            </div>
            <p className="m-0 mt-4 text-[13px] font-semibold text-ink-muted">
              Tudo o que precisas para usar, integrar e confiar no Banzami.
            </p>
          </div>

          {/* red CTA card */}
          <div className="relative overflow-hidden rounded-card bg-[linear-gradient(150deg,#B5101F,#6E0E14)] p-7 text-white shadow-[0_26px_56px_-30px_rgba(122,16,22,.6)]">
            <div className="pointer-events-none absolute -bottom-20 -right-[60px] h-60 w-60 rounded-full border border-white/[0.12]" />
            <div className="pointer-events-none absolute -bottom-10 -right-5 h-40 w-40 rounded-full border border-white/10" />
            <h3 className="relative m-0 text-[20px] font-black">Explorar Banzami</h3>
            <p className="relative m-0 mb-5 mt-3 text-[14px] font-semibold leading-[1.55] text-white/85">
              Baixa a app ou junta-te à waitlist e sê um dos primeiros a experimentar o futuro dos
              pagamentos em Angola.
            </p>
            <div className="relative flex flex-col gap-[10px]">
              <Link href="/app-demo" className="flex items-center justify-between gap-2 rounded-[14px] bg-white px-4 py-[13px] text-[14px] font-extrabold text-cherry-dark no-underline">
                Ver a app
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="#9A1B22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
              <a href={mailto('Waitlist Banzami')} className="flex items-center justify-between gap-2 rounded-[14px] border border-white/[0.28] bg-white/[0.12] px-4 py-[13px] text-[14px] font-extrabold text-white no-underline">
                Entrar na waitlist
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </a>
            </div>
            <p className="relative m-0 mt-4 text-[12px] font-semibold text-white/70">
              Banzami é construído sobre o protocolo aberto <strong className="text-white">BANZA</strong>.
            </p>
          </div>
        </div>

        {/* mini-footer */}
        <div className="mx-auto mt-[14px] flex max-w-container flex-wrap items-center justify-between gap-3 rounded-[18px] border border-border-soft bg-white px-[22px] py-[14px]">
          <span className="flex items-center gap-2 text-[13px] font-bold text-ink-soft">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2.5" stroke="#9a8a8e" strokeWidth="1.7" /><path d="M8 11V8a4 4 0 018 0v3" stroke="#9a8a8e" strokeWidth="1.7" /></svg>
            Seguro por design. Privacidade por padrão.
          </span>
          <span className="text-[13px] font-bold text-ink-muted">© 2026 Banzami</span>
          <span className="flex items-center gap-[10px] text-[13px] font-extrabold text-ink">
            Banzami é como Angola paga.
            <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-tile bg-cherry">
              <BrandMark size={17} />
            </span>
          </span>
        </div>
      </section>
    </main>
  );
}
