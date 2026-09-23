import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { SuportePage } from '@/components/marketing/pages/Suporte';

export const metadata: Metadata = {
  title: { absolute: 'Suporte — Banzami' },
  description:
    'Perguntas frequentes sobre a Sandbox, @banza e comprovativos, e contacto direto com a equipa do Banzami.',
  alternates: {
    canonical: 'https://banzami.com/suporte',
    languages: { en: 'https://banzami.com/en/suporte' },
  },
};

// Suporte — ported from handoff_site_completo on the shared marketing shell.
export default function Page() {
  return (
    <SiteShell lang="pt" current="suporte">
      <SuportePage lang="pt" />
    </SiteShell>
  );
}
