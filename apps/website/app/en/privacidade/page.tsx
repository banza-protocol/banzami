import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { PrivacidadePage } from '@/components/marketing/pages/Privacidade';

export const metadata: Metadata = {
  title: { absolute: 'Privacy Policy — Banzami' },
  description: 'How Banzami processes your personal data in the Beta Sandbox.',
  alternates: {
    canonical: 'https://banzami.com/en/privacidade',
    languages: { pt: 'https://banzami.com/privacidade' },
  },
};

// Privacy Policy (EN) — rebuilt entirely from handoff_site_completo on the shared marketing shell.
export default function Page() {
  return (
    <SiteShell lang="en" current="privacidade">
      <PrivacidadePage lang="en" />
    </SiteShell>
  );
}
