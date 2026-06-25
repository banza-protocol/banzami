import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Footer } from '@/components/site/Footer';
import { ActivarFlow } from './ActivarFlow';

export const metadata: Metadata = {
  title: 'Ativar conta Banzami Business',
  description: 'Ative a sua conta Banzami Business e defina o seu PIN.',
  robots: { index: false, follow: false },
};

export default function ActivarPage() {
  return (
    <main className="min-h-screen bg-white">
      <SiteHeader />
      <section className="px-6 pb-24 pt-[clamp(110px,16vw,130px)]">
        <div className="mx-auto max-w-[520px]">
          <h1 className="m-0 mb-6 text-[clamp(26px,3.6vw,38px)] font-black leading-[1.05] tracking-[-0.03em] text-ink">
            Ativar a sua conta Business
          </h1>
          <Suspense fallback={<p className="text-ink-secondary">A carregar…</p>}>
            <ActivarFlow />
          </Suspense>
        </div>
      </section>
      <Footer />
    </main>
  );
}
