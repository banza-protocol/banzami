import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { CandidaturaPage } from '@/components/marketing/pages/Candidatura';

export const metadata: Metadata = {
  title: { absolute: 'Registar o negócio — Banzami Business' },
  description: 'Candidatura online para receber pagamentos com o Banzami Business.',
  alternates: {
    canonical: 'https://banzami.com/comerciantes/candidatura',
    languages: { en: 'https://banzami.com/en/comerciantes/candidatura' },
  },
};

// Merchant KYB application — rebuilt from handoff_site_completo on the shared shell.
export default function Page() {
  return (
    <SiteShell lang="pt" current="candidatura">
      <CandidaturaPage lang="pt" />
    </SiteShell>
  );
}
