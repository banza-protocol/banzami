import { PUBLIC_TRUTH } from './public-truth';
import { mailto } from './site';

// PUBLIC-WEBSITE-CLOSING-CTA-001 — one canonical closing CTA, page-owned content.
//
// Every marketing page ends with exactly one <CTASection>. Its copy is NOT
// hardcoded in the component: it comes from here, keyed by the owner page, so
// the closing CTA always speaks to that page's audience (consumer / business /
// developer / institutional / support) instead of repeating a generic developer
// pitch everywhere. Keep copy short (headline + one line + at most two actions)
// and never imply Financial Live is available.

export type ClosingAction = { label: string; href: string };

export type ClosingCta = {
  /** For the route-ownership guard — who this closing speaks to. */
  audience: 'consumer' | 'business' | 'developer' | 'institutional' | 'support';
  eyebrow?: string;
  title: string;
  description: string;
  primary: ClosingAction;
  secondary?: ClosingAction;
  /** Show the contact email line under the buttons. */
  showContact?: boolean;
};

const APP_WEB = 'https://app.banzami.com';

export const CLOSING_CTAS = {
  // /produto — App Banzami / consumer: lead the visitor to try the app.
  produto: {
    audience: 'consumer',
    title: 'Experimente a App Banzami.',
    description: `Use a ${PUBLIC_TRUTH.sandbox.name} com dinheiro fictício e conheça a experiência Banzami.`,
    primary: { label: 'Abrir App Banzami Web', href: APP_WEB },
    secondary: { label: 'Participar nos testes', href: '/testes' },
  },

  // /comerciantes — merchant / Business experience.
  comerciantes: {
    audience: 'business',
    title: 'Teste o Banzami para o seu negócio.',
    description: `Explore a experiência da App Banzami Business na ${PUBLIC_TRUTH.sandbox.name}, com dinheiro fictício.`,
    primary: { label: 'Começar a testar', href: '/comerciantes/candidatura' },
    secondary: { label: 'Falar connosco', href: mailto('Banzami Business') },
  },

  // /developers — Developer Platform discovery.
  developers: {
    audience: 'developer',
    title: 'Comece a construir com o Banzami.',
    description: 'Crie um projeto na Sandbox e teste a integração com a API v1.',
    primary: { label: 'Abrir Console', href: PUBLIC_TRUTH.consoleUrl },
    secondary: { label: 'Ler documentação', href: PUBLIC_TRUTH.docsUrl },
  },

  // /sobre — startup / institutional / contact.
  sobre: {
    audience: 'institutional',
    title: 'Fale com o Banzami.',
    description:
      'Quer saber mais sobre a startup, estabelecer uma parceria ou falar connosco? Estamos disponíveis.',
    primary: { label: 'Falar connosco', href: mailto() },
    secondary: { label: 'Conhecer a plataforma', href: '/produto' },
    showContact: true,
  },

  // /suporte — help / contact.
  suporte: {
    audience: 'support',
    title: 'Ainda precisa de ajuda?',
    description: 'Fale connosco e indique-nos o que aconteceu.',
    primary: { label: 'Falar connosco', href: mailto('Ajuda Banzami') },
    secondary: { label: 'Ver perguntas frequentes', href: '/suporte#faq' },
  },
} as const satisfies Record<string, ClosingCta>;

export type ClosingCtaKey = keyof typeof CLOSING_CTAS;
