import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Footer } from '@/components/site/Footer';
import { AppDemo } from '@/components/app/AppDemo';

export const metadata: Metadata = { title: 'Demo da app' };

export default function AppDemoPage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <SiteHeader />
      <section className="bz-section relative overflow-hidden">
        {/* radial glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(circle at 50% 18%,#FFF1F0,#FFFFFF 60%)' }}
        />
        {/* floating decorative blobs (like the home hero) */}
        <div
          aria-hidden
          className="anim-floaty pointer-events-none absolute"
          style={{ top: 80, left: '8%', width: 120, height: 120, borderRadius: 34, background: '#FBD2D0', opacity: 0.5, filter: 'blur(2px)' }}
        />
        <div
          aria-hidden
          className="anim-floatyB pointer-events-none absolute"
          style={{ bottom: 90, right: '9%', width: 150, height: 150, borderRadius: 40, background: '#E8434B', opacity: 0.18, filter: 'blur(4px)' }}
        />

        <div className="bz-container relative">
          <div className="mx-auto max-w-[680px] text-center">
            <p className="bz-eyebrow">Demo interativa</p>
            <h1
              style={{
                margin: 0,
                fontSize: 'clamp(32px,5.4vw,56px)',
                fontWeight: 900,
                letterSpacing: '-.03em',
                color: '#2a2024',
              }}
            >
              Experimente a app Banzami
            </h1>
            <p style={{ margin: '14px 0 0', fontSize: 17, fontWeight: 600, lineHeight: 1.5, color: '#6a5a5e' }}>
              Crie conta, envie dinheiro e veja o comprovativo — tudo aqui mesmo.
            </p>
          </div>

          <div className="mt-12 flex justify-center">
            <AppDemo />
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
