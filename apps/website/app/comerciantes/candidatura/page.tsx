import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Footer } from '@/components/site/Footer';
import { CandidaturaForm } from './CandidaturaForm';

export const metadata: Metadata = {
  title: 'Criar conta Banzami Business',
  description:
    'Candidate-se para aceitar pagamentos com o Banzami Business. Preencha os dados do seu negócio e a equipa Banzami irá analisar a candidatura.',
};

export default function CandidaturaPage() {
  return (
    <main className="min-h-screen bg-white">
      <SiteHeader />
      <section className="px-6 pb-24 pt-[clamp(110px,16vw,130px)]">
        <div className="mx-auto max-w-[680px]">
          <h1 className="m-0 text-[clamp(30px,4.4vw,46px)] font-black leading-[1.05] tracking-[-0.03em] text-ink">
            Criar conta Banzami Business
          </h1>
          <p className="m-0 mt-4 max-w-[560px] text-[clamp(15px,1.5vw,18px)] font-semibold leading-[1.55] text-ink-secondary">
            Preencha os dados do seu negócio. A equipa Banzami irá analisar a candidatura.
          </p>
          <CandidaturaForm />
        </div>
      </section>
      <Footer />
    </main>
  );
}
