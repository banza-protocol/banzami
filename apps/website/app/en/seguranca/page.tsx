import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { SegurancaPage } from '@/components/marketing/pages/Seguranca';

export const metadata: Metadata = {
  title: { absolute: 'Security — Banzami' },
  description:
    'Immutable double-entry ledger, idempotency, TLS, verifiable receipts and fail-closed real-money operations. Report vulnerabilities to security@banzami.com.',
  alternates: {
    canonical: 'https://banzami.com/en/seguranca',
    languages: { pt: 'https://banzami.com/seguranca' },
  },
};

// Security (EN) — rebuilt entirely from handoff_site_completo on the shared marketing shell.
export default function Page() {
  return (
    <SiteShell lang="en" current="seguranca">
      <SegurancaPage lang="en" />
    </SiteShell>
  );
}
