import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { SobrePage } from '@/components/marketing/pages/Sobre';

export const metadata: Metadata = {
  title: { absolute: 'About — Banzami' },
  description:
    'Banzami is the startup building a wallet-native payment network for Angola, on the open BANZA protocol.',
  alternates: {
    canonical: 'https://banzami.com/en/sobre',
    languages: { pt: 'https://banzami.com/sobre' },
  },
};

// About (EN) — rebuilt entirely from handoff_site_completo on the shared marketing shell.
export default function Page() {
  return (
    <SiteShell lang="en" current="sobre">
      <SobrePage lang="en" />
    </SiteShell>
  );
}
