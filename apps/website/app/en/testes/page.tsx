import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { TestesPage } from '@/components/marketing/pages/Testes';

export const metadata: Metadata = {
  title: { absolute: 'Beta Programme — Banzami' },
  description:
    'Join the Banzami Beta Programme: Beta Web, iPhone (TestFlight) and Android, in the Sandbox.',
  alternates: {
    canonical: 'https://banzami.com/en/testes',
    languages: { pt: 'https://banzami.com/testes' },
  },
};

// Beta Programme (EN) — rebuilt entirely from handoff_site_completo on the shared marketing shell.
export default function Page() {
  return (
    <SiteShell lang="en" current="testes">
      <TestesPage lang="en" />
    </SiteShell>
  );
}
