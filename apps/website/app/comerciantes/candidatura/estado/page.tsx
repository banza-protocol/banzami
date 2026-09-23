import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { CandidaturaEstadoPage } from '@/components/marketing/pages/CandidaturaEstado';

export const metadata: Metadata = {
  title: { absolute: 'Estado da candidatura — Banzami Business' },
  description: 'Consulte o estado da candidatura do seu negócio ao Banzami Business.',
  alternates: {
    canonical: 'https://banzami.com/comerciantes/candidatura/estado',
    languages: { en: 'https://banzami.com/en/comerciantes/candidatura/estado' },
  },
};

// Application status lookup — rebuilt from handoff_site_completo on the shared shell.
export default function Page() {
  return (
    <SiteShell lang="pt" current="estado">
      <CandidaturaEstadoPage lang="pt" />
    </SiteShell>
  );
}
