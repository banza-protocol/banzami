import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { HomeHero } from '@/components/marketing/HomeHero';
import { HomeComoFunciona, HomeNegocios, HomeDevelopers } from '@/components/marketing/HomeSections';

export const metadata: Metadata = {
  title: 'Banzami — A tua carteira Kwanza, num toque',
  description: 'O Banzami é a rede de pagamentos wallet-native de Angola. Carteira em Kwanza, paga por QR ou para um @banza, recebe em segundos. Construído sobre o protocolo aberto BANZA.',
  alternates: { canonical: 'https://banzami.com/', languages: { en: 'https://banzami.com/en' } },
};

// Home — rebuilt entirely from handoff_site_completo on the shared marketing shell.
export default function HomePage() {
  return (
    <SiteShell lang="pt" current="home">
      <HomeHero lang="pt" />
      <HomeComoFunciona lang="pt" />
      <HomeNegocios lang="pt" />
      <HomeDevelopers lang="pt" />
    </SiteShell>
  );
}
