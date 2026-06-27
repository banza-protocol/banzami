// Banzami main navigation data (header mega menu + mobile accordion).
// Source of truth: HANDOFF_Banzami_Nav.md. Copy is kept verbatim (PT-PT).
//
// Two handoff adaptations applied for the real website:
//   1. No banzami.org — the open BANZA protocol site is banza.network
//      (SITE.protocolUrl).
//   2. Prototype `*.dc.html` links → the real existing routes
//      (/produto, /comerciantes, /developers, /sobre, /suporte). No new routes,
//      no duplicated pages. "Segurança" maps to /produto#seguranca — the real
//      existing anchor on the KYC/KYB & AML-CFT compliance section.
import { SITE, mailto } from './site';

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
    subtitle: 'Uma forma simples de pagar, receber e acompanhar pagamentos.',
    cta: 'Conhecer a app',
    ctaHref: '/produto',
    visualCaption: 'app banzami',
    links: [
      { label: 'Como funciona', href: '/#como-funciona', desc: 'Scan, confirmar e pago.' },
      { label: 'App Banzami', href: '/produto', desc: 'A carteira digital para utilizadores.' },
      { label: 'Pagar por QR', href: '/produto#solucao', desc: 'Pague com QR de forma clara.' },
      { label: 'Enviar para @banza', href: '/produto#solucao', desc: 'Envie com um nome simples.' },
      { label: 'Receber pagamentos', href: '/produto#solucao', desc: 'Por QR, link ou pedido.' },
      { label: 'Comprovativos e actividade', href: '/produto', desc: 'Movimentos e confirmações num só lugar.' },
    ],
  },
  {
    label: 'Para comerciantes',
    href: '/comerciantes',
    hasMega: true,
    subtitle: 'Ferramentas simples para aceitar pagamentos sem terminais caros.',
    cta: 'Quero aceitar pagamentos',
    ctaHref: '/comerciantes',
    visualCaption: 'qr comerciante',
    links: [
      { label: 'Aceitar pagamentos por QR', href: '/comerciantes', desc: 'Um QR simples e partilhável.' },
      { label: 'Receber sem terminal caro', href: '/comerciantes', desc: 'Alternativa digital para pequenos negócios.' },
      { label: 'QR com valor definido', href: '/comerciantes', desc: 'Pedidos com valor e descrição.' },
      { label: 'Links de pagamento', href: '/comerciantes', desc: 'Partilhe por WhatsApp ou redes.' },
      { label: 'Gestão de vendas', href: '/comerciantes', desc: 'Pagamentos e actividade recente.' },
      { label: 'App Comerciante', href: '/comerciantes', desc: 'Pensada para vendas do dia a dia.' },
      { label: 'Entrar na lista de parceiros', href: mailto('Parceiro'), desc: 'Teste o Banzami no seu negócio.' },
    ],
  },
  {
    label: 'Para empresas',
    href: '/developers',
    hasMega: true,
    subtitle: 'Infraestrutura preparada para integrar pagamentos nas suas aplicações.',
    cta: 'Explorar para empresas',
    ctaHref: '/developers',
    visualCaption: 'apis & sdks',
    note: 'Algumas capacidades encontram-se em desenvolvimento ou teste interno.',
    links: [
      { label: 'Business Dashboard', href: '/developers', desc: 'Actividade, transacções e configurações.' },
      { label: 'APIs e SDKs', href: '/developers#api', desc: 'Integre experiências de pagamento.' },
      { label: 'Checkout e links de pagamento', href: '/developers', desc: 'Fluxos para plataformas digitais.' },
      { label: 'Sandbox', href: '/developers#sandbox', desc: 'Ambiente isolado para testar.' },
      { label: 'Webhooks', href: '/developers#webhooks', desc: 'Eventos para manter tudo sincronizado.' },
      { label: 'Documentação técnica', href: '/developers#docs', desc: 'Guias e referências para equipas.' },
      { label: 'Falar com a equipa', href: mailto(), desc: 'Integrações e parcerias.' },
    ],
  },
  {
    label: 'Segurança',
    href: '/produto#seguranca',
    isLink: true,
  },
  {
    label: 'BANZA',
    href: '/sobre#sobre',
    hasMega: true,
    end: true,
    subtitle: 'Uma base comum para pagamentos mais claros, interoperáveis e preparados para crescer.',
    cta: 'Conhecer o BANZA',
    ctaHref: SITE.protocolUrl,
    visualCaption: 'protocolo banza',
    links: [
      { label: 'O que é o BANZA', href: '/sobre#sobre', desc: 'A visão de uma base comum.' },
      { label: 'Banzami e BANZA', href: '/sobre#sobre', desc: 'Da visão à experiência prática.' },
      { label: 'Visão de interoperabilidade', href: '/sobre#sobre', desc: 'Regras comuns, não integrações isoladas.' },
      { label: 'Princípios técnicos', href: '/sobre#sobre', desc: 'Segurança, consistência e rastreabilidade.' },
      { label: 'Para parceiros e operadores', href: mailto(), desc: 'Colaborar no ecossistema.' },
      { label: 'Ver o protocolo', href: SITE.protocolUrl, desc: 'Princípios e documentação.' },
    ],
  },
  {
    label: 'Sobre nós',
    href: '/sobre',
    hasMega: true,
    end: true,
    subtitle: 'Estamos a construir uma nova experiência de pagamentos digitais para Angola.',
    cta: 'Falar connosco',
    ctaHref: mailto(),
    visualCaption: 'equipa banzami',
    links: [
      { label: 'A Banzami', href: '/sobre', desc: 'A empresa e a visão do produto.' },
      { label: 'Missão', href: '/sobre', desc: 'Pagamentos simples, claros e acessíveis.' },
      { label: 'Equipa fundadora', href: '/sobre', desc: 'As pessoas por trás da Banzami.' },
      { label: 'Roadmap', href: '/sobre', desc: 'O caminho de desenvolvimento.' },
      { label: 'Contacto', href: mailto(), desc: 'Fale connosco.' },
      { label: 'Carreiras', href: mailto('Carreiras'), desc: 'Construir connosco.' },
      { label: 'Imprensa', href: mailto('Imprensa'), desc: 'Informação institucional.' },
    ],
  },
];
