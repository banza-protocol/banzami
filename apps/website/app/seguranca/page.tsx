import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { SegurancaPage } from '@/components/marketing/pages/Seguranca';

export const metadata: Metadata = {
  title: { absolute: 'Segurança — Banzami' },
  description:
    'Ledger double-entry imutável, idempotência, TLS, comprovativos verificáveis e Financial Live fail-closed. Reporte vulnerabilidades para security@banzami.com.',
  alternates: {
    canonical: 'https://banzami.com/seguranca',
    languages: { en: 'https://banzami.com/en/seguranca' },
  },
};

// Segurança — rebuilt entirely from handoff_site_completo on the shared marketing shell.
export default function Page() {
  return (
    <SiteShell lang="pt" current="seguranca">
      <SegurancaPage lang="pt" />
    </SiteShell>
  );
}
