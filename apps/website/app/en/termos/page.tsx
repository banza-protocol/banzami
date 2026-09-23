import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { TermosPage } from '@/components/marketing/pages/Termos';

export const metadata: Metadata = {
  title: { absolute: 'Terms of Use — Banzami' },
  description: 'Banzami terms of use (provisional version).',
  alternates: {
    canonical: 'https://banzami.com/en/termos',
    languages: { pt: 'https://banzami.com/termos' },
  },
  // Provisional legal document — kept out of the search index until final text lands.
  robots: { index: false },
};

// Terms of Use (EN) — rebuilt entirely from handoff_site_completo on the shared marketing shell.
export default function Page() {
  return (
    <SiteShell lang="en" current="termos">
      <TermosPage lang="en" />
    </SiteShell>
  );
}
