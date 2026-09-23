import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { HomeHero } from '@/components/marketing/HomeHero';
import { HowItWorks } from '@/components/site/HowItWorks';
import { ForBusiness } from '@/components/site/ForBusiness';
import { ForDevelopers } from '@/components/site/ForDevelopers';

export const metadata: Metadata = {
  title: 'Banzami — Kwanza payments, from wallet to wallet',
  alternates: { canonical: 'https://banzami.com/en', languages: { pt: 'https://banzami.com/' } },
};

// EN home — /en (handoff_site_completo). Hero is bilingual; section EN copy
// is being translated in a follow-up pass.
export default function HomePageEN() {
  return (
    <SiteShell lang="en" current="home">
      <HomeHero lang="en" />
      <HowItWorks />
      <ForBusiness />
      <ForDevelopers />
    </SiteShell>
  );
}
