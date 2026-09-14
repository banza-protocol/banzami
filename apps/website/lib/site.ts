// Shared site configuration for the Banzami website.
// Source of truth: ~/Downloads/design_handoff_banzami_site/README.md.
// Every navigation label names something that exists today: no roadmap items,
// no banking licence claims. Availability facts live in lib/public-truth.ts.

export const SITE = {
  name: 'Banzami',
  domain: 'banzami.com',
  url: 'https://banzami.com',
  email: 'contact@banzami.com',
  // The open BANZA protocol is governed independently of Banzami; its site is
  // banza.network.
  protocolUrl: 'https://banza.network',
  tagline: 'Pagamentos em Kwanza, de carteira para carteira.',
} as const;

export const mailto = (subject?: string) =>
  subject ? `mailto:${SITE.email}?subject=${encodeURIComponent(subject)}` : `mailto:${SITE.email}`;

// Developer Console entry point (design handoff §"Ponto de entrada"). The
// homepage "Começar" CTA leads here. This is the Console *frontend* host — a
// full, keyboard-navigable browser route — NOT the backend API. The browser
// must never be sent to developer-api.banzami.com directly; that host is an
// authenticated API reached only via fetch() from the loaded Console. The
// absolute host is deliberate: the Console must load on developers.banzami.com
// (the only origin the developer-api allows via CORS), so a relative
// "/login" from banzami.com would land it on the wrong origin. The console
// lives at the host root (no /developers segment); see lib/console-routing.ts.
export const DEVELOPERS_LOGIN_URL = 'https://developers.banzami.com/login';

/** The canonical developer documentation. Technical detail lives there only. */
export const DOCS_URL = 'https://developers.banzami.com/docs';
