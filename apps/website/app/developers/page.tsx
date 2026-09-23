import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { DevelopersPage } from '@/components/marketing/pages/Developers';

// banzami.com/developers — public developer platform landing (PT), rebuilt from
// handoff_site_completo on the shared marketing shell. Console/docs subroutes
// live under app/developers/* and are untouched by this page.
export const metadata: Metadata = {
  title: 'Banzami Developers — Integre pagamentos em Kwanza',
  description: 'API v1, SDK TypeScript e webhooks assinados para integrar pagamentos em Kwanza. Sandbox disponível.',
  alternates: { canonical: 'https://banzami.com/developers', languages: { en: 'https://banzami.com/en/developers' } },
};

export default function DevelopersLandingPage() {
  return (
    <SiteShell lang="pt" current="developers">
      <DevelopersPage lang="pt" />
    </SiteShell>
  );
}
