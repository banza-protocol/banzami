import Link from 'next/link';
import { PUBLIC_TRUTH } from '@/lib/public-truth';
import { SITE, mailto, DOCS_URL, DEVELOPERS_LOGIN_URL } from '@/lib/site';
import { Logo, BrandMark } from './BrandMark';

// Official Banzami footer (PUBLIC-WEBSITE-RELEASE-001).
// One footer, one hierarchy — grouped links, not a second homepage (§28/§47).
// Groups mirror the canonical IA; one concise description; the global Sandbox/Live
// status stays in the bottom bar. Real routes and legitimate external links only.

type FootLink = { label: string; href: string; external?: boolean };
type FootGroup = { title: string; links: FootLink[] };

const GROUPS: FootGroup[] = [
  {
    title: 'Produto',
    links: [
      { label: 'App Banzami', href: '/produto' },
      { label: 'Comerciantes', href: '/comerciantes' },
      { label: 'Verificar um comprovativo', href: '/verificar' },
      { label: 'Abrir App Banzami Web', href: 'https://app.banzami.com', external: true },
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'Plataforma', href: '/developers' },
      { label: 'Consola', href: DEVELOPERS_LOGIN_URL, external: true },
      { label: 'Documentação', href: `${DOCS_URL}/get-started`, external: true },
      { label: 'API v1', href: `${DOCS_URL}/reference`, external: true },
    ],
  },
  {
    title: 'Confiança',
    links: [
      { label: 'Segurança', href: '/seguranca' },
      { label: 'Estado da plataforma', href: '/suporte#estado' },
      { label: 'Divulgação responsável', href: 'mailto:security@banzami.com' },
    ],
  },
  {
    title: 'Startup',
    links: [
      { label: 'Sobre', href: '/sobre' },
      { label: 'Fundadores', href: '/sobre#fundadores' },
      { label: 'BANZA', href: SITE.protocolUrl, external: true },
    ],
  },
  {
    title: 'Suporte',
    links: [
      { label: 'Ajuda', href: '/suporte' },
      { label: 'Perguntas frequentes', href: '/suporte#faq' },
      { label: 'Contacto', href: mailto('Contacto Banzami') },
    ],
  },
  {
    title: 'Legal',
    links: [{ label: 'Privacidade', href: '/privacidade' }],
  },
];

function FootAnchor({ link }: { link: FootLink }) {
  const cls =
    'inline-flex items-center gap-1 text-[14px] font-semibold text-ink-soft no-underline transition-colors hover:text-cherry focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#B5101F] focus-visible:outline-offset-2';
  const arrow = link.external ? <span aria-hidden="true" className="text-ink-muted">↗</span> : null;
  if (link.external || link.href.startsWith('mailto:')) {
    const ext = link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
    return (
      <a href={link.href} className={cls} {...ext}>
        {link.label}
        {arrow}
      </a>
    );
  }
  return (
    <Link href={link.href} prefetch={link.href.startsWith('/verificar') ? false : undefined} className={cls}>
      {link.label}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-[rgba(181,16,31,0.10)] bg-cream-50 px-6 pb-10 pt-14">
      <div className="mx-auto max-w-container">
        {/* Top: brand + one description, then the link columns */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_2fr]">
          <div className="max-w-[360px]">
            <Link href="/" className="inline-flex no-underline">
              <Logo size={40} markSize={21} />
            </Link>
            <p className="m-0 mt-[16px] text-[16px] font-black leading-[1.3] text-cherry">
              Pagamentos em Kwanza, de carteira para carteira.
            </p>
            <p className="m-0 mt-[10px] text-[14px] font-semibold leading-[1.6] text-ink-soft">
              A startup que está a construir uma rede de pagamentos nativa de carteira para Angola,
              sobre o protocolo aberto BANZA.
            </p>
          </div>

          <nav aria-label="Rodapé" className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
            {GROUPS.map((g) => (
              <div key={g.title}>
                <p className="m-0 mb-[14px] text-[12px] font-black uppercase tracking-[0.08em] text-ink-muted">{g.title}</p>
                <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
                  {g.links.map((l) => (
                    <li key={l.label}>
                      <FootAnchor link={l} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        {/* Bottom bar: global status + legal + BANZA mark */}
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-[rgba(181,16,31,0.10)] pt-6">
          <p className="m-0 flex items-center gap-[9px] text-[13.5px] font-semibold text-ink-soft">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-ink-muted" />
            {PUBLIC_TRUTH.live.name} indisponível · {PUBLIC_TRUTH.sandbox.name} com dinheiro fictício
          </p>
          <p className="m-0 flex items-center gap-[14px] text-[13px] font-semibold text-ink-muted">
            <span className="bz-mono">© 2026 Banzami</span>
          </p>
          <p className="m-0 flex items-center gap-[10px] text-[13.5px] font-black text-ink">
            Construído sobre o BANZA.
            <span className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-tile bg-cherry shadow-[0_6px_14px_-4px_rgba(181,16,31,.5)]">
              <BrandMark size={16} />
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
