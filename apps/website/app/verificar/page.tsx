import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { VerificarPage } from '@/components/marketing/pages/Verificar';

export const metadata: Metadata = {
  title: { absolute: 'Verificar comprovativo — Banzami' },
  description: 'Confirme que um comprovativo Banzami é verdadeiro com a referência BZM-.',
  alternates: {
    canonical: 'https://banzami.com/verificar',
    languages: { en: 'https://banzami.com/en/verificar' },
  },
};

// Verificar — ported from handoff_site_completo on the shared marketing shell.
export default function Page() {
  return (
    <SiteShell lang="pt" current="verificar">
      <VerificarPage lang="pt" />
    </SiteShell>
  );
}
