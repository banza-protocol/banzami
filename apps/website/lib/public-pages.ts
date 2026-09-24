// The public pages of banzami.com: what the marketing sitemap lists, and what
// the public-truth gate and link audit read. A page that is noindex (the
// activation link, an application's status, a proof page) is not here.
export const MARKETING_ORIGIN = 'https://banzami.com';

export const MARKETING_PAGES: { path: string; file: string }[] = [
  { path: '/', file: 'app/page.tsx' },
  { path: '/produto', file: 'app/produto/page.tsx' },
  { path: '/comerciantes', file: 'app/comerciantes/page.tsx' },
  { path: '/comerciantes/candidatura', file: 'app/comerciantes/candidatura/page.tsx' },
  { path: '/developers', file: 'app/developers/page.tsx' },
  { path: '/seguranca', file: 'app/seguranca/page.tsx' },
  { path: '/sobre', file: 'app/sobre/page.tsx' },
  { path: '/suporte', file: 'app/suporte/page.tsx' },
  { path: '/testes', file: 'app/testes/page.tsx' },
  { path: '/termos', file: 'app/termos/page.tsx' },
  { path: '/privacidade', file: 'app/privacidade/page.tsx' },
  { path: '/verificar', file: 'app/verificar/page.tsx' },
];
