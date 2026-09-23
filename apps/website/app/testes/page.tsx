import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { TestesPage } from '@/components/marketing/pages/Testes';

export const metadata: Metadata = {
  title: { absolute: 'Programa Beta — Banzami' },
  description:
    'Inscreva-se no Programa Beta do Banzami: Beta Web, iPhone (TestFlight) e Android, na Sandbox.',
  alternates: {
    canonical: 'https://banzami.com/testes',
    languages: { en: 'https://banzami.com/en/testes' },
  },
};

// Programa Beta — rebuilt entirely from handoff_site_completo on the shared marketing shell.
export default function Page() {
  return (
    <SiteShell lang="pt" current="testes">
      <TestesPage lang="pt" />
    </SiteShell>
  );
}
