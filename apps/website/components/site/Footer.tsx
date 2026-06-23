import Link from 'next/link';
import { SITE } from '@/lib/site';
import { Logo } from './BrandMark';
import { ComingSoonBadge } from './ComingSoonBadge';

// Footer aligned with the final navigation taxonomy. "Em breve" items are
// non-navigable (badge only). Kept light: no domain line, no waitlist, no
// secondary tagline sentence — contact is a link, not a primary action.
type FooterLink = { label: string; href?: string; external?: boolean; soon?: boolean };

const COLS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Produtos',
    links: [
      { label: 'Solução', href: '/produto#solucao' },
      { label: 'Como funciona', href: '/produto#como-funciona' },
      { label: 'Produtos', href: '/produto#produtos' },
      { label: 'Banzami Business', href: '/comerciantes' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'Documentação', href: '/developers' },
      { label: 'API', soon: true },
      { label: 'SDKs', soon: true },
      { label: 'Webhooks', soon: true },
    ],
  },
  {
    title: 'Suporte',
    links: [
      { label: 'Segurança', href: '/suporte' },
      { label: 'Estado da plataforma', href: '/suporte' },
      { label: 'Contacto', href: `mailto:${SITE.email}` },
    ],
  },
  {
    title: 'Empresa',
    links: [
      { label: 'Sobre', href: '/sobre' },
      { label: 'Protocolo BANZA ↗', href: SITE.protocolUrl, external: true },
    ],
  },
];

function FooterItem({ link }: { link: FooterLink }) {
  if (link.soon) {
    return (
      <span className="flex items-center gap-2 text-ink-muted">
        {link.label}
        <ComingSoonBadge />
      </span>
    );
  }
  const cls = 'text-ink-soft no-underline transition-colors hover:text-cherry';
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={cls}>
        {link.label}
      </a>
    );
  }
  if (link.href?.startsWith('mailto:')) {
    return (
      <a href={link.href} className={cls}>
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href ?? '#'} className={cls}>
      {link.label}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="bg-cream-50 px-6 pb-[34px] pt-14">
      <div className="mx-auto max-w-container">
        <div className="bz-footer grid grid-cols-1 gap-[34px] border-b border-[rgba(181,16,31,0.12)] pb-[38px] sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Link href="/" className="mb-[14px] inline-flex no-underline">
              <Logo size={28} markSize={16} />
            </Link>
            <p className="m-0 max-w-[300px] text-[14.5px] font-semibold leading-[1.6] text-ink-soft">
              A carteira Kwanza de Angola.
            </p>
            <p className="bz-mono m-0 mt-4 text-[13px] font-semibold text-cherry">{SITE.email}</p>
          </div>

          {COLS.map((col) => (
            <div key={col.title}>
              <p className="m-0 mb-[13px] text-[13px] font-black text-ink">{col.title}</p>
              <div className="flex flex-col gap-[10px] text-[14px] font-bold">
                {col.links.map((l) => (
                  <FooterItem key={l.label} link={l} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <p className="m-0 max-w-[600px] text-[13px] font-semibold leading-[1.6] text-ink-muted">
            O Banzami é construído sobre o{' '}
            <a
              href={SITE.protocolUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-cherry no-underline"
            >
              protocolo aberto BANZA ↗
            </a>
            . BANZA é o protocolo; Banzami é como Angola paga. Em desenvolvimento ativo — não é um
            banco nem um operador certificado.
          </p>
          <p className="bz-mono m-0 text-[13px] text-ink-muted">© Banzami</p>
        </div>
      </div>
    </footer>
  );
}
