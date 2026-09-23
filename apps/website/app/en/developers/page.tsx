import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { DevelopersPage } from '@/components/marketing/pages/Developers';

// banzami.com/en/developers — public developer platform landing (EN), rebuilt
// from handoff_site_completo on the shared marketing shell.
export const metadata: Metadata = {
  title: { absolute: 'Banzami Developers — Integrate Kwanza payments' },
  description: 'API v1, TypeScript SDK and signed webhooks to integrate Kwanza payments. Sandbox available.',
  alternates: { canonical: 'https://banzami.com/en/developers', languages: { pt: 'https://banzami.com/developers' } },
};

export default function DevelopersLandingPageEN() {
  return (
    <SiteShell lang="en" current="developers">
      <DevelopersPage lang="en" />
    </SiteShell>
  );
}
