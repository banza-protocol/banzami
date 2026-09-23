import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Footer } from '@/components/site/Footer';
import { HowItWorks } from '@/components/site/HowItWorks';
import { ForBusiness } from '@/components/site/ForBusiness';
import { ForDevelopers } from '@/components/site/ForDevelopers';
import { HeroLaunch } from '@/components/site/HeroLaunch';
import { PUBLIC_TRUTH } from '@/lib/public-truth';

export const metadata: Metadata = {
  alternates: { canonical: 'https://banzami.com/' },
};

export default function HomePage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <SiteHeader />

      {/* ===================== HERO ===================== */}
      {/* The environment model (Sandbox available / Financial Live unavailable)
          is stated in the hero copy itself (liveSummaryShort). */}
      <HeroLaunch
        sandboxName={PUBLIC_TRUTH.sandbox.name}
        liveSummaryShort={PUBLIC_TRUTH.live.summaryShort}
      />

      {/* ===================== 01 · COMO FUNCIONA ===================== */}
      <HowItWorks />

      {/* ===================== 02 · PARA NEGÓCIOS (banda tonalizada) ===================== */}
      <ForBusiness />

      {/* ===================== 03 · PARA DEVELOPERS ===================== */}
      <ForDevelopers />

      {/* ===================== FOOTER (o bloco vermelho é o CTA final) ===================== */}
      <Footer />
    </main>
  );
}
