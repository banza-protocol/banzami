import Link from 'next/link';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Footer } from '@/components/site/Footer';

export default function NotFound() {
  return (
    <main className="overflow-x-hidden bg-white">
      <SiteHeader />
      <section className="bz-section px-6 pt-[160px]">
        <div className="mx-auto max-w-[560px] text-center">
          <p className="bz-eyebrow">ERRO 404</p>
          <h1 className="m-0 text-[clamp(32px,5.4vw,56px)] font-black leading-[1.02] tracking-[-0.03em] text-ink">
            Página não encontrada.
          </h1>
          <p className="mx-auto mt-4 max-w-[420px] text-[17px] font-semibold leading-[1.55] text-ink-secondary">
            O endereço que procuras não existe ou foi movido.
          </p>
          <Link href="/" className="bz-btn-primary mt-8 !px-7 !py-4 !text-[16px]">
            Voltar ao início
          </Link>
        </div>
      </section>
      <Footer />
    </main>
  );
}
