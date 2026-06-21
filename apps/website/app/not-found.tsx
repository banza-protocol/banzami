import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

export default function NotFound() {
  return (
    <main className="overflow-x-hidden bg-white">
      <Nav />
      <section className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
        <p className="bz-mono m-0 text-[15px] font-semibold text-banzami">404</p>
        <h1 className="m-0 mt-3 text-[clamp(28px,4vw,44px)] font-black tracking-[-0.02em]">
          Página não encontrada.
        </h1>
        <p className="m-0 mt-4 max-w-[440px] text-[16px] font-semibold leading-[1.55] text-ink-secondary">
          A página que procuras não existe ou foi movida. Volta ao início para continuar.
        </p>
        <Link href="/" className="bz-btn-primary mt-7">
          Voltar ao início
        </Link>
      </section>
      <Footer />
    </main>
  );
}
