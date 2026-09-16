// Banzami main navigation data (header mega menu + mobile accordion).
//
// PUBLIC-WEBSITE-RELEASE-001 — canonical information architecture:
//   Produto · Comerciantes · Developers · Segurança · BANZA · Sobre
// One concept, one owner page. A dropdown helps CHOOSE a destination; it does not
// re-explain the page (§11). Every entry names something that exists today and
// lands on a real page or anchor (§39). Developer technical detail lives only on
// developers.banzami.com (§7). Banzami is a startup — never described here as an
// "empresa" (§1).
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
    subtitle: 'A app para pagar por QR ou para um @banza, com um comprovativo verificável.',
    cta: 'Ver o produto',
    ctaHref: '/produto',
    visualCaption: 'app banzami',
    links: [
      { label: 'App Banzami', href: '/produto', desc: 'Uma app: Web, iPhone e Android.' },
      { label: 'Pagar e enviar', href: '/produto#pagar', desc: 'Por QR ou para um @banza.' },
      { label: 'Receber', href: '/produto#receber', desc: 'QR e @banza.' },
      { label: 'Comprovativos', href: '/produto#comprovativos', desc: 'Verificáveis por qualquer pessoa.' },
    ],
  },
  {
    label: 'Comerciantes',
    href: '/comerciantes',
    hasMega: true,
    subtitle: 'Receber pagamentos por QR e por link, sem terminal.',
    cta: 'Ver para comerciantes',
    ctaHref: '/comerciantes',
    visualCaption: 'qr comerciante',
    links: [
      { label: 'Receber por QR', href: '/comerciantes#como', desc: 'Um QR com valor e descrição.' },
      { label: 'Links de pagamento', href: '/comerciantes#como', desc: 'Um endereço para partilhar.' },
      { label: 'Histórico e comprovativos', href: '/comerciantes#vantagens', desc: 'Cada venda, registada.' },
      { label: 'Registar o negócio', href: '/comerciantes/candidatura', desc: 'Candidatura de negócio.' },
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
      { label: 'Plataforma para developers', href: '/developers', desc: 'O que pode construir.' },
      { label: 'Consola', href: DEVELOPERS_LOGIN_URL, desc: 'Workspaces, projetos e chaves.' },
      { label: 'Documentação', href: `${DOCS_URL}/get-started`, desc: 'Início e conceitos.' },
      { label: 'API v1', href: `${DOCS_URL}/reference`, desc: 'Endpoints e respostas.' },
      { label: 'SDK', href: `${DOCS_URL}/sdk`, desc: 'Os pacotes publicados.' },
    ],
  },
  {
    label: 'Segurança',
    href: '/seguranca',
    isLink: true,
  },
  {
    label: 'BANZA',
    href: '/sobre#banza',
    hasMega: true,
    end: true,
    subtitle: 'O protocolo aberto sobre o qual o Banzami é construído.',
    cta: 'Ver banza.network',
    ctaHref: SITE.protocolUrl,
    visualCaption: 'protocolo banza',
    links: [
      { label: 'Banzami e BANZA', href: '/sobre#banza', desc: 'O protocolo e o operador.' },
      { label: 'Ver o protocolo', href: SITE.protocolUrl, desc: 'banza.network ↗' },
    ],
  },
  {
    label: 'Sobre',
    href: '/sobre',
    hasMega: true,
    end: true,
    subtitle: 'A startup que está a construir a rede de pagamentos Banzami.',
    cta: 'Falar connosco',
    ctaHref: mailto(),
    visualCaption: 'banzami',
    links: [
      { label: 'A startup', href: '/sobre', desc: 'Missão e princípios.' },
      { label: 'Estado atual', href: '/sobre#estado', desc: 'O que está disponível hoje.' },
      { label: 'Suporte', href: '/suporte', desc: 'Ajuda e estado da plataforma.' },
      { label: 'Contacto', href: mailto(), desc: 'Fale connosco.' },
    ],
  },
];
