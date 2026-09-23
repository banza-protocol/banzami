import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { CandidaturaEstadoPage } from '@/components/marketing/pages/CandidaturaEstado';

export const metadata: Metadata = {
  title: { absolute: 'Application status — Banzami Business' },
  description: 'Check the status of your Banzami Business application.',
  alternates: {
    canonical: 'https://banzami.com/en/comerciantes/candidatura/estado',
    languages: { pt: 'https://banzami.com/comerciantes/candidatura/estado' },
  },
};

// Application status lookup (EN) — rebuilt from handoff_site_completo on the shared shell.
export default function Page() {
  return (
    <SiteShell lang="en" current="estado">
      <CandidaturaEstadoPage lang="en" />
    </SiteShell>
  );
}
