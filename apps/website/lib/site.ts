// Shared site configuration for the Banzami website.
// Content and claims are bound by BANZAMI_REFERENCIA.md (§24 allowed, §25 forbidden).

export const SITE = {
  name: 'Banzami',
  domain: 'banzami.com',
  url: 'https://banzami.com',
  email: 'contact@banzami.com',
  // The open BANZA protocol is owned and governed independently of Banzami.
  // Its current website is banzami.org (temporary, per the protocol team).
  protocolUrl: 'https://banzami.org',
  tagline: 'A carteira Kwanza de Angola. O dinheiro move-se à velocidade da internet.',
} as const;

export const NAV_LINKS = [
  { label: 'Produto', href: '/produto' },
  { label: 'Comerciantes', href: '/comerciantes' },
  { label: 'Programadores', href: '/programadores' },
  { label: 'Transparência', href: '/conformance' },
  { label: 'Sobre', href: '/sobre' },
] as const;

export const mailto = (subject?: string) =>
  subject ? `mailto:${SITE.email}?subject=${encodeURIComponent(subject)}` : `mailto:${SITE.email}`;
