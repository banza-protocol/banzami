import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { PrivacidadePage } from '@/components/marketing/pages/Privacidade';

export const metadata: Metadata = {
  title: { absolute: 'Privacy Policy — Banzami' },
  description: 'How Banzami processes your personal data (provisional version).',
  alternates: {
    canonical: 'https://banzami.com/en/privacidade',
    languages: { pt: 'https://banzami.com/privacidade' },
  },
  // Provisional legal document — kept out of the search index until final text lands.
  robots: { index: false },
};

// Privacy Policy (EN) — rebuilt entirely from handoff_site_completo on the shared marketing shell.
export default function Page() {
  return (
    <SiteShell lang="en" current="privacidade">
      <PrivacidadePage lang="en" />
    </SiteShell>
  );
}
