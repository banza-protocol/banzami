import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Footer } from '@/components/site/Footer';
import { HowItWorks } from '@/components/site/HowItWorks';
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

      {/* ===================== COMO FUNCIONA ===================== */}
      <HowItWorks />

      {/* ===================== FOOTER (componente partilhado) ===================== */}
      <Footer />
    </main>
  );
}
