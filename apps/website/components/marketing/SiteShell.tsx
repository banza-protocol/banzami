import type { ReactNode } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import type { Lang, RouteKey } from '@/lib/marketing/nav';

/**
 * Shared marketing shell (handoff_site_completo): the blush gradient page
 * background + fixed header (mega-menu, language selector, mobile menu) + the
 * three-block footer with legal bar. Every marketing page renders inside it.
 */
export function SiteShell({ lang, current, children }: { lang: Lang; current: RouteKey; children: ReactNode }) {
  return (
    <div style={{ overflowX: 'clip', background: 'linear-gradient(180deg,#FFF4F3 0%,#FFF7F6 50%,#FDF1F0 100%)', minHeight: '100vh' }}>
      <Header lang={lang} current={current} />
      <main>{children}</main>
      <Footer lang={lang} />
    </div>
  );
}
