import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { SuportePage } from '@/components/marketing/pages/Suporte';

export const metadata: Metadata = {
  title: { absolute: 'Support — Banzami' },
  description:
    'Frequently asked questions about the Sandbox, @banza and receipts, and direct contact with the Banzami team.',
  alternates: {
    canonical: 'https://banzami.com/en/suporte',
    languages: { pt: 'https://banzami.com/suporte' },
  },
};

// Support (EN) — ported from handoff_site_completo on the shared marketing shell.
export default function Page() {
  return (
    <SiteShell lang="en" current="suporte">
      <SuportePage lang="en" />
    </SiteShell>
  );
}
