// Banzami main navigation data (header mega menu + mobile accordion).
// Source of truth: HANDOFF_Banzami_Nav.md. Copy is kept verbatim (PT-PT).
//
// Two handoff adaptations applied for the real website:
//   1. No banzami.org — the open BANZA protocol site is banza.network
//      (SITE.protocolUrl).
//   2. Prototype `*.dc.html` links → the real existing routes
//      (/produto, /comerciantes, /developers, /sobre, /suporte). No new routes,
//      no duplicated pages. "Segurança" maps to /produto#seguranca.
//
// PUBLIC-TRUTH-001: every entry names something that exists today and lands on a
// real page or anchor. Developer detail links to the canonical documentation
// rather than to sections of banzami.com/developers, which no longer carries it.
import { SITE, mailto, DOCS_URL, DEVELOPERS_LOGIN_URL } from './site';

export type MegaLink = { label: string; href: string; desc: string };

export type NavItem = {
  label: string;
  href: string;
  hasMega?: boolean;
  isLink?: boolean;
  end?: boolean; // right-align the mega panel (rightmost items)
  subtitle?: string;
  cta?: string;
  ctaHref?: string;
  visualCaption?: string;
  note?: string;
  links?: MegaLink[];
};

export const navMenus: NavItem[] = [
  {
    label: 'Produto',
    href: '/produto',
    hasMega: true,
    subtitle: 'Pagar por QR ou para um @banza, com um comprovativo verificável.',
    cta: 'Ver o produto',
    ctaHref: '/produto',
    visualCaption: 'app banzami',
    links: [
      { label: 'Como funciona', href: '/#como-funciona', desc: 'Ler, confirmar, pago.' },
      { label: 'App Banzami', href: '/produto#app', desc: 'Em testes no iPhone e Android.' },
      { label: 'Pagar por QR', href: '/produto#solucao', desc: 'Um QR por pagamento.' },
      { label: 'Pagar para um @banza', href: '/produto#solucao', desc: 'Um nome em vez de um IBAN.' },
      { label: 'Verificar um comprovativo', href: '/verificar', desc: 'Confirme uma referência.' },
      { label: 'Demonstração da app', href: '/app-demo', desc: 'Os ecrãs, com dados de exemplo.' },
    ],
  },
  {
    label: 'Para comerciantes',
    href: '/comerciantes',
    hasMega: true,
    subtitle: 'Receber pagamentos por QR e por link, sem terminal.',
    cta: 'Ver para comerciantes',
    ctaHref: '/comerciantes',
    visualCaption: 'qr comerciante',
    links: [
      { label: 'Receber por QR', href: '/comerciantes#como', desc: 'Um QR com valor e descrição.' },
      { label: 'Links de pagamento', href: '/comerciantes#como', desc: 'Um endereço para partilhar.' },
      { label: 'Candidatura de negócio', href: '/comerciantes/candidatura', desc: 'Registar o seu negócio.' },
      { label: 'Falar com a equipa', href: mailto('Comerciantes'), desc: 'Perguntas sobre o seu negócio.' },
    ],
  },
  {
    label: 'Developers',
    href: '/developers',
    hasMega: true,
    subtitle: 'Integre pagamentos nativos de carteira na sua aplicação.',
    cta: 'Plataforma para developers',
    ctaHref: '/developers',
    visualCaption: 'api & sdk',
    note: 'Sandbox pública disponível, com dinheiro fictício. Financial Live indisponível.',
    links: [
      { label: 'Consola', href: DEVELOPERS_LOGIN_URL, desc: 'Workspaces, projetos, chaves e webhooks.' },
      { label: 'Documentação', href: `${DOCS_URL}/get-started`, desc: 'Guia de início e conceitos.' },
      { label: 'Referência da API', href: `${DOCS_URL}/reference`, desc: 'Endpoints, pedidos e respostas.' },
      { label: 'SDKs', href: `${DOCS_URL}/sdk`, desc: 'Os pacotes publicados.' },
      { label: 'Testes na Sandbox', href: `${DOCS_URL}/testing`, desc: 'Pagadores de teste e cenários.' },
      { label: 'Webhooks', href: `${DOCS_URL}/webhooks`, desc: 'Eventos assinados e entregas.' },
    ],
  },
  {
    label: 'Segurança',
    href: '/produto#seguranca',
    isLink: true,
  },
  {
    label: 'BANZA',
    href: '/sobre#banza',
    hasMega: true,
    end: true,
    subtitle: 'O protocolo aberto sobre o qual o Banzami é construído.',
    cta: 'Conhecer o BANZA',
    ctaHref: SITE.protocolUrl,
    visualCaption: 'protocolo banza',
    links: [
      { label: 'BANZA e Banzami', href: '/sobre#banza', desc: 'O protocolo e o operador.' },
      { label: 'Ver o protocolo', href: SITE.protocolUrl, desc: 'banza.network' },
    ],
  },
  {
    label: 'Sobre nós',
    href: '/sobre',
    hasMega: true,
    end: true,
    subtitle: 'A empresa que constrói a rede de pagamentos Banzami.',
    cta: 'Falar connosco',
    ctaHref: mailto(),
    visualCaption: 'banzami',
    links: [
      { label: 'O Banzami', href: '/sobre', desc: 'A empresa e a missão.' },
      { label: 'Suporte', href: '/suporte', desc: 'Estado da plataforma e contactos.' },
      { label: 'Perguntas frequentes', href: '/faq', desc: 'Respostas curtas.' },
      { label: 'Contacto', href: mailto(), desc: 'Fale connosco.' },
    ],
  },
];
