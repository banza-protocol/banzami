import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { HomeHero } from '@/components/marketing/HomeHero';
import { HomeComoFunciona, HomeNegocios, HomeDevelopers } from '@/components/marketing/HomeSections';

export const metadata: Metadata = {
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
