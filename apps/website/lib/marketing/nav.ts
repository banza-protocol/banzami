// Bilingual navigation + route map for the full-site rebuild (handoff_site_completo).
// Source of truth: handoff_site_completo/reference/site-kit.js (MEGA/NAV) and the
// rendered PT/EN home headers. PT is default; EN lives under /en/*.

export type Lang = 'pt' | 'en';
export type Loc = { pt: string; en: string };

export const APP_URL = 'https://app.banzami.com/';
export const DOCS_URL = '/developers/docs';
export const CONSOLE_URL = '/developers/login';

// Every marketing route, PT and its /en pair.
export const ROUTES = {
  home: { pt: '/', en: '/en' },
  produto: { pt: '/produto', en: '/en/produto' },
  comerciantes: { pt: '/comerciantes', en: '/en/comerciantes' },
  candidatura: { pt: '/comerciantes/candidatura', en: '/en/comerciantes/candidatura' },
  estado: { pt: '/comerciantes/candidatura/estado', en: '/en/comerciantes/candidatura/estado' },
  activar: { pt: '/comerciantes/activar', en: '/en/comerciantes/activar' },
  developers: { pt: '/developers', en: '/en/developers' },
  seguranca: { pt: '/seguranca', en: '/en/seguranca' },
  sobre: { pt: '/sobre', en: '/en/sobre' },
  suporte: { pt: '/suporte', en: '/en/suporte' },
  verificar: { pt: '/verificar', en: '/en/verificar' },
  testes: { pt: '/testes', en: '/en/testes' },
  termos: { pt: '/termos', en: '/en/termos' },
  privacidade: { pt: '/privacidade', en: '/en/privacidade' },
} as const;

export type RouteKey = keyof typeof ROUTES;

/** Resolve a route key (+ optional hash) to a concrete href for a language. */
export function route(key: RouteKey, lang: Lang, hash = ''): string {
  return ROUTES[key][lang] + hash;
}

export type NavLink = {
  label: Loc;
  desc: Loc;
  /** Internal route key (+ optional hash), or an external/absolute href. */
  to?: { key: RouteKey; hash?: string };
  external?: string;
};

export type NavItem = {
  key: string;
  label: Loc;
  /** Top-level target (route key + optional hash). */
  to: { key: RouteKey; hash?: string };
  mega?: {
    title: Loc;
    desc: Loc;
    cta: { label: Loc; to: { key: RouteKey; hash?: string } };
    tile: Loc;
    status?: Loc;
    links: NavLink[];
  };
};

const L = (pt: string, en: string): Loc => ({ pt, en });

export const NAV: NavItem[] = [
  {
    key: 'produto',
    label: L('Produto', 'Product'),
    to: { key: 'produto' },
    mega: {
      title: L('Produto', 'Product'),
      desc: L(
        'A app para pagar por QR ou para um @banza, com um comprovativo verificável.',
        'The app to pay by QR or to a @banza, with a verifiable receipt.',
      ),
      cta: { label: L('Ver o produto', 'See the product'), to: { key: 'produto' } },
      tile: L('app banzami', 'banzami app'),
      links: [
        { label: L('App Banzami', 'Banzami app'), desc: L('Uma app: Web, iPhone e Android.', 'One app: Web, iPhone and Android.'), to: { key: 'produto' } },
        { label: L('Pagar e enviar', 'Pay and send'), desc: L('Por QR ou para um @banza.', 'By QR or to a @banza.'), to: { key: 'produto', hash: '#pagar' } },
        { label: L('Receber', 'Receive'), desc: L('QR e @banza.', 'QR and @banza.'), to: { key: 'produto', hash: '#receber' } },
        { label: L('Comprovativos', 'Receipts'), desc: L('Verificáveis por qualquer pessoa.', 'Verifiable by anyone.'), to: { key: 'produto', hash: '#comprovativos' } },
      ],
    },
  },
  {
    key: 'comerciantes',
    label: L('Comerciantes', 'Merchants'),
    to: { key: 'comerciantes' },
    mega: {
      title: L('Comerciantes', 'Merchants'),
      desc: L('Receber pagamentos por QR e por link, sem terminal.', 'Get paid by QR and by link, no terminal needed.'),
      cta: { label: L('Ver para comerciantes', 'See for merchants'), to: { key: 'comerciantes' } },
      tile: L('qr comerciante', 'merchant qr'),
      links: [
        { label: L('Receber por QR', 'Get paid by QR'), desc: L('Um QR com valor e descrição.', 'A QR with amount and description.'), to: { key: 'comerciantes', hash: '#como' } },
        { label: L('Links de pagamento', 'Payment links'), desc: L('Um endereço para partilhar.', 'A link to share.'), to: { key: 'comerciantes', hash: '#como' } },
        { label: L('Dividir a conta', 'Split the bill'), desc: L('Rachar por várias pessoas.', 'Split between several people.'), to: { key: 'comerciantes', hash: '#dividir' } },
        { label: L('Histórico e comprovativos', 'History and receipts'), desc: L('Cada venda, registada.', 'Every sale, recorded.'), to: { key: 'comerciantes', hash: '#vantagens' } },
        { label: L('Registar o negócio', 'Register your business'), desc: L('Candidatura de negócio.', 'Business application.'), to: { key: 'candidatura' } },
      ],
    },
  },
  {
    key: 'developers',
    label: L('Developers', 'Developers'),
    to: { key: 'developers' },
    mega: {
      title: L('Developers', 'Developers'),
      desc: L('Integre pagamentos nativos de carteira na sua aplicação.', 'Integrate wallet-native payments into your application.'),
      cta: { label: L('Plataforma para developers', 'Developer platform'), to: { key: 'developers' } },
      tile: L('api & sdk', 'api & sdk'),
      status: L(
        'Sandbox pública disponível, com dinheiro fictício. Operações com dinheiro real indisponíveis.',
        'Public Sandbox available, with test money. Real-money operations unavailable.',
      ),
      links: [
        { label: L('Plataforma para developers', 'Developer platform'), desc: L('O que pode construir.', 'What you can build.'), to: { key: 'developers' } },
        { label: L('Consola', 'Console'), desc: L('Workspaces, projetos e chaves.', 'Workspaces, projects and keys.'), external: CONSOLE_URL },
        { label: L('Documentação', 'Documentation'), desc: L('Início e conceitos.', 'Getting started and concepts.'), external: DOCS_URL },
        { label: L('API v1', 'API v1'), desc: L('Endpoints e respostas.', 'Endpoints and responses.'), external: DOCS_URL },
        { label: L('SDK', 'SDK'), desc: L('Os pacotes publicados.', 'Published packages.'), to: { key: 'developers', hash: '#sdks' } },
      ],
    },
  },
  {
    key: 'seguranca',
    label: L('Segurança', 'Security'),
    to: { key: 'seguranca' },
  },
  {
    key: 'banza',
    label: L('BANZA', 'BANZA'),
    to: { key: 'sobre', hash: '#banza' },
    mega: {
      title: L('BANZA', 'BANZA'),
      desc: L('O protocolo aberto sobre o qual o Banzami é construído.', 'The open protocol Banzami is built on.'),
      cta: { label: L('Conhecer o BANZA', 'Discover BANZA'), to: { key: 'sobre', hash: '#banza' } },
      tile: L('protocolo banza', 'banza protocol'),
      links: [
        { label: L('Protocolo BANZA', 'BANZA protocol'), desc: L('As regras abertas.', 'The open rules.'), to: { key: 'sobre', hash: '#banza' } },
        { label: L('BANZA e Banzami', 'BANZA and Banzami'), desc: L('Protocolo e operador.', 'Protocol and operator.'), to: { key: 'sobre', hash: '#banza' } },
        { label: L('Segurança', 'Security'), desc: L('Como protegemos o sistema.', 'How we protect the system.'), to: { key: 'seguranca' } },
      ],
    },
  },
  {
    key: 'sobre',
    label: L('Sobre', 'About'),
    to: { key: 'sobre' },
    mega: {
      title: L('Sobre', 'About'),
      desc: L('A startup que está a construir a rede de pagamentos Banzami.', 'The startup building the Banzami payment network.'),
      cta: { label: L('Falar connosco', 'Talk to us'), to: { key: 'suporte', hash: '#contacto' } },
      tile: L('banzami', 'banzami'),
      links: [
        { label: L('A startup', 'The startup'), desc: L('Missão e princípios.', 'Mission and principles.'), to: { key: 'sobre', hash: '#missao' } },
        { label: L('Fundadores', 'Founders'), desc: L('Fidel Monteiro e Jesus Monteiro.', 'Fidel Monteiro and Jesus Monteiro.'), to: { key: 'sobre', hash: '#fundador' } },
        { label: L('Suporte', 'Support'), desc: L('Ajuda e estado da plataforma.', 'Help and platform status.'), to: { key: 'suporte' } },
        { label: L('Contacto', 'Contact'), desc: L('Fale connosco.', 'Get in touch.'), to: { key: 'suporte', hash: '#contacto' } },
      ],
    },
  },
  {
    key: 'suporte',
    label: L('Suporte', 'Support'),
    to: { key: 'suporte' },
  },
];

// Shared header/menu strings.
export const UI = {
  portalDevelopers: L('Portal Developers', 'Portal Developers'),
  openBetaWeb: L('Abrir Beta Web', 'Open Beta Web'),
  menu: L('Abrir menu', 'Menu'),
  langLabel: L('Idioma: PT', 'Language: EN'),
  langPt: L('Português', 'Português'),
  langEn: L('English', 'English'),
  homeAria: L('Banzami — início', 'Banzami — home'),
};

export function navHref(link: NavLink, lang: Lang): string {
  if (link.external) return link.external;
  if (link.to) return route(link.to.key, lang, link.to.hash ?? '');
  return '#';
}
