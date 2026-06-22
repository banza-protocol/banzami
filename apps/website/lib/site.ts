// Shared site configuration for the Banzami website.
// Source of truth: ~/Downloads/design_handoff_banzami_site/README.md.
// Honest tone — metrics at 0, "Em breve" items are non-navigable badges,
// no exposed "sandbox", no banking licence claims.

export const SITE = {
  name: 'Banzami',
  domain: 'banzami.com',
  url: 'https://banzami.com',
  email: 'contact@banzami.com',
  // The open BANZA protocol is governed independently of Banzami.
  protocolUrl: 'https://banzami.org',
  tagline: 'A carteira Kwanza de Angola. O dinheiro move-se à velocidade da internet.',
} as const;

export const mailto = (subject?: string) =>
  subject ? `mailto:${SITE.email}?subject=${encodeURIComponent(subject)}` : `mailto:${SITE.email}`;

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
    width: 300,
    active: ['/developers'],
    columns: [
      {
        items: [
          { label: 'Documentação', sub: 'Guias técnicos para integrar Banzami.', href: '/developers' },
          { label: 'API', sub: 'Integre pagamentos Banzami no seu produto.', soon: true },
          { label: 'SDKs', sub: 'iOS, Android e Web.', soon: true },
          { label: 'Sandbox', sub: 'Teste integrações com segurança.', soon: true },
          { label: 'Webhooks', sub: 'Eventos de pagamento em tempo real.', soon: true },
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

export const NAV_CTA = { label: 'Começar', href: '/produto#contacto' } as const;

// Active top-level key for a given pathname (README §"Estado ativo por página").
export function activeNavKey(pathname: string): string | null {
  const all: { key: string; active: string[] }[] = [...NAV_MENUS, ...NAV_LINKS];
  for (const item of all) {
    if (item.active.some((p) => pathname === p || pathname.startsWith(p + '/'))) return item.key;
  }
  return null; // Home → none
}
