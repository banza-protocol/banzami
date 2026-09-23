import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { PrivacidadePage } from '@/components/marketing/pages/Privacidade';

export const metadata: Metadata = {
  title: { absolute: 'Política de Privacidade — Banzami' },
  description: 'Como o Banzami trata os seus dados pessoais (versão provisória).',
  alternates: {
    canonical: 'https://banzami.com/privacidade',
    languages: { en: 'https://banzami.com/en/privacidade' },
  },
  // Provisional legal document — kept out of the search index until final text lands.
  robots: { index: false },
};

// Política de Privacidade — rebuilt entirely from handoff_site_completo on the shared marketing shell.
export default function Page() {
  return (
    <SiteShell lang="pt" current="privacidade">
      <PrivacidadePage lang="pt" />
    </SiteShell>
  );
}
