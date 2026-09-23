import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { TermosPage } from '@/components/marketing/pages/Termos';

export const metadata: Metadata = {
  title: { absolute: 'Termos de Utilização — Banzami' },
  description: 'Termos de utilização do Banzami (versão provisória).',
  alternates: {
    canonical: 'https://banzami.com/termos',
    languages: { en: 'https://banzami.com/en/termos' },
  },
  // Provisional legal document — kept out of the search index until final text lands.
  robots: { index: false },
};

// Termos de Utilização — rebuilt entirely from handoff_site_completo on the shared marketing shell.
export default function Page() {
  return (
    <SiteShell lang="pt" current="termos">
      <TermosPage lang="pt" />
    </SiteShell>
  );
}
