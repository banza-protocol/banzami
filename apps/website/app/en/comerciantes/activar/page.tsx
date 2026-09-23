import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SiteShell } from '@/components/marketing/SiteShell';
import { ComerciantesActivarPage } from '@/components/marketing/pages/ComerciantesActivar';

export const metadata: Metadata = {
  title: { absolute: 'Activate your business — Banzami Business' },
  description: 'Complete the activation of your business on Banzami Business.',
  alternates: {
    canonical: 'https://banzami.com/en/comerciantes/activar',
    languages: { pt: 'https://banzami.com/comerciantes/activar' },
  },
};

// Business activation (EN, accepts ?codigo=) — rebuilt from handoff_site_completo.
export default function Page() {
  return (
    <SiteShell lang="en" current="activar">
      <Suspense>
        <ComerciantesActivarPage lang="en" />
      </Suspense>
    </SiteShell>
  );
}
