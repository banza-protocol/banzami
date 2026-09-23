import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { VerificarPage } from '@/components/marketing/pages/Verificar';

export const metadata: Metadata = {
  title: { absolute: 'Verify a receipt — Banzami' },
  description: 'Confirm a Banzami receipt is genuine with its BZM- reference.',
  alternates: {
    canonical: 'https://banzami.com/en/verificar',
    languages: { pt: 'https://banzami.com/verificar' },
  },
};

// Verify a receipt (EN) — ported from handoff_site_completo on the shared shell.
export default function Page() {
  return (
    <SiteShell lang="en" current="verificar">
      <VerificarPage lang="en" />
    </SiteShell>
  );
}
