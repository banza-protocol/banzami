import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { CandidaturaPage } from '@/components/marketing/pages/Candidatura';

export const metadata: Metadata = {
  title: { absolute: 'Register your business — Banzami Business' },
  description: 'Online application to receive payments with Banzami Business.',
  alternates: {
    canonical: 'https://banzami.com/en/comerciantes/candidatura',
    languages: { pt: 'https://banzami.com/comerciantes/candidatura' },
  },
};

// Merchant KYB application (EN) — rebuilt from handoff_site_completo on the shared shell.
export default function Page() {
  return (
    <SiteShell lang="en" current="candidatura">
      <CandidaturaPage lang="en" />
    </SiteShell>
  );
}
