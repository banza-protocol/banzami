import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Footer } from '@/components/site/Footer';
import { Reveal } from '@/components/Reveal';
import { PhoneFrame } from '@/components/app/PhoneFrame';
import { AppScreen, type FrameName } from '@/components/app/AppScreen';

export const metadata: Metadata = { title: 'Ecrãs da app' };

// The 8 gallery screens (mono labels mirror Banza App.dc.html).
const SCREENS: { label: string; frame: FrameName }[] = [
  { label: '01 · Splash', frame: 'splash' },
  { label: '02 · Boas-vindas', frame: 'welcome' },
  { label: '03 · Criar conta', frame: 'criar' },
  { label: '04 · Entrar', frame: 'entrar' },
  { label: '05 · Início', frame: 'inicio' },
  { label: '06 · Enviar', frame: 'enviar' },
  { label: '07 · Confirmar envio', frame: 'confenvio' },
  { label: '08 · Comprovativo', frame: 'comprovativo' },
];

export default function AppGalleryPage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <SiteHeader />
      <section className="bz-section" style={{ paddingTop: 96 }}>
        <div className="bz-container">
          <div className="mx-auto max-w-[760px] text-center">
            <Reveal>
              <p className="bz-eyebrow">Protótipo</p>
              <h1
                style={{
                  margin: 0,
                  fontSize: 'clamp(32px,5.4vw,56px)',
                  fontWeight: 900,
                  letterSpacing: '-.03em',
                  color: '#2a2024',
                }}
              >
                Ecrãs da app Banzami
              </h1>
              <p style={{ margin: '14px 0 0', fontSize: 17, fontWeight: 600, lineHeight: 1.5, color: '#6a5a5e' }}>
                Os ecrãs principais da app — carteira em Kwanza, @banza, QR e histórico.
                Envie e receba dinheiro instantaneamente em Angola.
              </p>
            </Reveal>
          </div>

          <div className="mt-12 flex flex-wrap items-start justify-center" style={{ gap: '44px 38px' }}>
            {SCREENS.map((s, i) => (
              <Reveal key={s.frame} delay={i * 60}>
                <div className="flex flex-col items-center" style={{ gap: 14 }}>
                  <span className="bz-mono" style={{ fontSize: 12, fontWeight: 600, color: '#9a8a8e' }}>{s.label}</span>
                  <PhoneFrame float>
                    <AppScreen frame={s.frame} />
                  </PhoneFrame>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
