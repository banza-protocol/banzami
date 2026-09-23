import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SiteShell } from '@/components/marketing/SiteShell';
import { ComerciantesActivarPage } from '@/components/marketing/pages/ComerciantesActivar';

export const metadata: Metadata = {
  title: { absolute: 'Ativar o negócio — Banzami Business' },
  description: 'Conclua a ativação do seu negócio no Banzami Business.',
  alternates: {
    canonical: 'https://banzami.com/comerciantes/activar',
    languages: { en: 'https://banzami.com/en/comerciantes/activar' },
  },
};

// Business activation (accepts ?codigo=) — rebuilt from handoff_site_completo.
export default function Page() {
  return (
    <SiteShell lang="pt" current="activar">
      <Suspense>
        <ComerciantesActivarPage lang="pt" />
      </Suspense>
    </SiteShell>
  );
}
