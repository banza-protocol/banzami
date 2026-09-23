import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { ComerciantesPage } from '@/components/marketing/pages/Comerciantes';

export const metadata: Metadata = {
  title: { absolute: 'Banzami Business — Receba pagamentos em Kwanza' },
  description:
    'QR, links de pagamento, dividir a conta e histórico com comprovativos para o seu negócio. Disponível na Sandbox do Banzami.',
  alternates: { canonical: 'https://banzami.com/comerciantes', languages: { en: 'https://banzami.com/en/comerciantes' } },
};

// /comerciantes — Banzami Business, rebuilt from handoff_site_completo on the
// shared marketing shell. Anchors: #como, #dividir, #vantagens.
export default function ComerciantesRoute() {
  return (
    <SiteShell lang="pt" current="comerciantes">
      <ComerciantesPage lang="pt" />
    </SiteShell>
  );
}
