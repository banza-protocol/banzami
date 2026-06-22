import Link from 'next/link';
import { SITE } from '@/lib/site';
import { Logo } from './BrandMark';

// 4-column footer — verbatim from BanzamiCTAFooter.dc.html. Anchors that the
// design points at the (old) home now live on /produto in this IA, so they
// target /produto#… ; Programadores→/developers, Transparência→/suporte.
const COLS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: 'Produto',
    links: [
      { label: 'Solução', href: '/produto#solucao' },
      { label: 'Como funciona', href: '/produto#como-funciona' },
      { label: 'Comerciantes', href: '/comerciantes' },
    ],
  },
  {
    title: 'Plataforma',
    links: [
      { label: 'Developers', href: '/developers' },
      { label: 'Transparência', href: '/suporte' },
      { label: 'Tecnologia', href: '/produto#tecnologia' },
    ],
  },
  {
    title: 'Empresa',
    links: [
      { label: 'Sobre', href: '/sobre' },
      { label: 'Contacto', href: `mailto:${SITE.email}` },
      { label: 'Waitlist', href: `mailto:${SITE.email}?subject=Waitlist%20Banzami` },
      { label: 'Protocolo BANZA ↗', href: SITE.protocolUrl, external: true },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-cream-50 px-6 pb-[34px] pt-14">
      <div className="mx-auto max-w-container">
        <div className="bz-footer grid grid-cols-1 gap-[34px] border-b border-[rgba(181,16,31,0.12)] pb-[38px] sm:grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="mb-[14px] inline-flex no-underline">
              <Logo size={28} markSize={16} />
            </Link>
            <p className="m-0 max-w-[320px] text-[14.5px] font-semibold leading-[1.6] text-ink-soft">
              {SITE.tagline}
            </p>
            <p className="bz-mono m-0 mt-4 text-[13px] font-semibold text-cherry">{SITE.email}</p>
            <p className="bz-mono m-0 mt-[5px] text-[13px] text-ink-muted">{SITE.domain}</p>
          </div>

          {COLS.map((col) => (
            <div key={col.title}>
              <p className="m-0 mb-[13px] text-[13px] font-black text-ink">{col.title}</p>
              <div className="flex flex-col gap-[10px] text-[14px] font-bold">
                {col.links.map((l) =>
                  l.external || l.href.startsWith('mailto:') ? (
                    <a
                      key={l.label}
                      href={l.href}
                      {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className="text-ink-soft no-underline transition-colors hover:text-cherry"
                    >
                      {l.label}
                    </a>
                  ) : (
                    <Link
                      key={l.label}
                      href={l.href}
                      className="text-ink-soft no-underline transition-colors hover:text-cherry"
                    >
                      {l.label}
                    </Link>
                  ),
                )}
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
