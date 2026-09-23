import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { SobrePage } from '@/components/marketing/pages/Sobre';

export const metadata: Metadata = {
  title: { absolute: 'Sobre — Banzami' },
  description:
    'O Banzami é a startup que está a construir uma rede de pagamentos nativa de carteira para Angola, sobre o protocolo aberto BANZA.',
  alternates: {
    canonical: 'https://banzami.com/sobre',
    languages: { en: 'https://banzami.com/en/sobre' },
  },
};

// Sobre — rebuilt entirely from handoff_site_completo on the shared marketing shell.
export default function Page() {
  return (
    <SiteShell lang="pt" current="sobre">
      <SobrePage lang="pt" />
    </SiteShell>
  );
}
