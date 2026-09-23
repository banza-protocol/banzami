import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { ComerciantesPage } from '@/components/marketing/pages/Comerciantes';

export const metadata: Metadata = {
  title: { absolute: 'Banzami Business — Receive Kwanza payments' },
  description:
    'QR, payment links, bill splitting and history with receipts for your business. Available in the Banzami Sandbox.',
  alternates: { canonical: 'https://banzami.com/en/comerciantes', languages: { pt: 'https://banzami.com/comerciantes' } },
};

// /en/comerciantes — EN Banzami Business, from handoff_site_completo.
export default function ComerciantesRouteEN() {
  return (
    <SiteShell lang="en" current="comerciantes">
      <ComerciantesPage lang="en" />
    </SiteShell>
  );
}
