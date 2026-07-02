// Shared site configuration for the Banzami website.
// Source of truth: ~/Downloads/design_handoff_banzami_site/README.md.
// Honest tone — metrics at 0, "Em breve" items are non-navigable badges,
// no exposed "sandbox", no banking licence claims.

export const SITE = {
  name: 'Banzami',
  domain: 'banzami.com',
  url: 'https://banzami.com',
  email: 'contact@banzami.com',
  // The open BANZA protocol is governed independently of Banzami; its site is
  // banza.network.
  protocolUrl: 'https://banza.network',
  tagline: 'A carteira Kwanza de Angola. O dinheiro move-se à velocidade da internet.',
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

// ---------------------------------------------------------------------------
// Navigation taxonomy (README §"Sistema de navegação").
// Order is fixed: Produtos · Developers · Suporte · FAQ · Sobre · Começar.
// `soon: true` → rendered as a disabled text + "Em breve" badge (NO link).
// ---------------------------------------------------------------------------

export type NavItem = {
  label: string;
  sub?: string;
  href?: string; // internal route or in-page #anchor
  mailto?: string;
  external?: string;
  soon?: boolean;
};

export type NavColumn = { heading?: string; items: NavItem[] };

export type NavMenu = {
  key: string; // active-state key
  label: string;
  href: string; // the label is itself clickable
  width: number; // mega-menu panel width (px)
  columns: NavColumn[];
  active: string[]; // pathnames that light this item up
};

export type NavLink = { key: string; label: string; href: string; active: string[] };

export const NAV_MENUS: NavMenu[] = [
  {
    key: 'produtos',
    label: 'Produtos',
    href: '/produto',
    width: 560,
    active: ['/produto', '/comerciantes'],
    columns: [
      {
        heading: 'PAGAMENTOS',
        items: [
          { label: 'Banzami Wallet', sub: 'A carteira digital para gerir o seu dinheiro.', href: '/produto' },
          { label: 'Pagamentos QR', sub: 'Scan. Confirmar. Pago.', href: '/produto#como-funciona' },
          { label: '@banza', sub: 'Envie dinheiro sem IBAN, apenas com um nome.', href: '/produto#solucao' },
          { label: 'Dividir pagamentos', sub: 'Partilhe contas com amigos e grupos.', soon: true },
          { label: 'Pedidos de pagamento', sub: 'Peça dinheiro em segundos.', soon: true },
        ],
      },
      {
        heading: 'EXPERIÊNCIA',
        items: [
          { label: 'Comprovativos digitais', sub: 'Recibos claros depois de cada pagamento.', href: '/produto' },
          { label: 'Histórico', sub: 'Todos os movimentos num só lugar.', href: '/produto' },
          { label: 'Banzami Business', sub: 'Ferramentas para negócios e comerciantes.', href: '/comerciantes' },
        ],
      },
    ],
  },
  {
    key: 'developers',
    label: 'Developers',
    href: '/developers',
    width: 320,
    active: ['/developers'],
    columns: [
      {
        items: [
          { label: 'Documentação', sub: 'Comece aqui — guia de início.', href: '/developers#docs' },
          { label: 'API Reference', sub: 'Endpoints, requests e respostas.', href: '/developers#api' },
          { label: 'SDKs', sub: 'JavaScript, iOS, Android e REST.', href: '/developers#sdks' },
          { label: 'Sandbox', sub: 'Teste pagamentos, webhooks e falhas.', href: '/developers#sandbox' },
          { label: 'Webhooks', sub: 'Eventos de pagamento em tempo real.', href: '/developers#webhooks' },
          { label: 'Exemplos', sub: 'Checkout, QR e transferências.', href: '/developers#examples' },
        ],
      },
    ],
  },
  {
    key: 'suporte',
    label: 'Suporte',
    href: '/suporte',
    width: 300,
    active: ['/suporte'],
    columns: [
      {
        items: [
          { label: 'Segurança da conta', sub: 'Proteja o acesso à sua carteira.', href: '/suporte' },
          { label: 'Estado da plataforma', sub: 'Disponibilidade dos serviços Banzami.', href: '/suporte' },
          { label: 'Contactar suporte', sub: 'Fale com a equipa Banzami.', mailto: mailto() },
          { label: 'Centro de ajuda', sub: 'Guias e respostas rápidas.', soon: true },
        ],
      },
    ],
  },
];

export const NAV_LINKS: NavLink[] = [
  { key: 'faq', label: 'FAQ', href: '/faq', active: ['/faq'] },
  { key: 'sobre', label: 'Sobre', href: '/sobre', active: ['/sobre'] },
];

export const NAV_CTA = { label: 'Começar', href: DEVELOPERS_LOGIN_URL } as const;

// Active top-level key for a given pathname (README §"Estado ativo por página").
export function activeNavKey(pathname: string): string | null {
  const all: { key: string; active: string[] }[] = [...NAV_MENUS, ...NAV_LINKS];
  for (const item of all) {
    if (item.active.some((p) => pathname === p || pathname.startsWith(p + '/'))) return item.key;
  }
  return null; // Home → none
}
