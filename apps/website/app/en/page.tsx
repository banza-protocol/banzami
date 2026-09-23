import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { HomeHero } from '@/components/marketing/HomeHero';
import { HomeComoFunciona, HomeNegocios, HomeDevelopers } from '@/components/marketing/HomeSections';

export const metadata: Metadata = {
  title: 'Banzami — Kwanza payments, from wallet to wallet',
  alternates: { canonical: 'https://banzami.com/en', languages: { pt: 'https://banzami.com/' } },
};

// EN home — /en (handoff_site_completo), entirely from the dossier.
export default function HomePageEN() {
  return (
    <SiteShell lang="en" current="home">
      <HomeHero lang="en" />
      <HomeComoFunciona lang="en" />
      <HomeNegocios lang="en" />
      <HomeDevelopers lang="en" />
    </SiteShell>
  );
}
