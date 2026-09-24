import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { TermosPage } from '@/components/marketing/pages/Termos';

export const metadata: Metadata = {
  title: { absolute: 'Terms of Service — Banzami' },
  description: 'Banzami Terms of Service for the Beta Sandbox.',
  alternates: {
    canonical: 'https://banzami.com/en/termos',
    languages: { pt: 'https://banzami.com/termos' },
  },
};

// Terms of Use (EN) — rebuilt entirely from handoff_site_completo on the shared marketing shell.
export default function Page() {
  return (
    <SiteShell lang="en" current="termos">
      <TermosPage lang="en" />
    </SiteShell>
  );
}
