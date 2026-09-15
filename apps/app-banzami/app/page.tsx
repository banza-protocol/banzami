import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/session';
import { BrandMark } from '@/components/Brand';
import { SandboxBadge } from '@/components/SandboxBadge';

export const dynamic = 'force-dynamic';

// Welcome — the public entry. A returning consumer with a live session goes
// straight to Home; there is no anonymous financial state (§17).
export default async function Welcome() {
  const s = await readSession();
  if (s) redirect('/inicio');
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[460px] flex-col px-6 pb-10 pt-14">
      <div className="flex items-center justify-between">
        <BrandMark />
        <SandboxBadge />
      </div>

      <div className="mt-14 flex-1">
        <h1 className="text-[clamp(30px,8vw,40px)] font-black leading-[1.05] tracking-[-0.03em] text-ink">
          A sua carteira Banzami, agora no browser.
        </h1>
        <p className="mt-4 text-[16px] font-medium leading-[1.55] text-ink-soft">
          Pague por QR ou para um <span className="font-bold text-cherry">@banza</span>, em Kwanza. A mesma conta Banzami
          no Web, no iPhone e no Android — com dinheiro fictício, na Sandbox.
        </p>
      </div>

      <div className="space-y-3">
        <Link
          href="/criar-conta"
          className="flex w-full items-center justify-center rounded-[16px] bg-gradient-to-b from-cherry to-cherry-dark px-5 py-4 text-[16px] font-black text-white shadow-[0_16px_34px_-14px_rgba(181,16,31,.55)] transition active:scale-[0.99]"
        >
          Criar conta
        </Link>
        <Link
          href="/entrar"
          className="flex w-full items-center justify-center rounded-[16px] border border-[#EBE3E3] bg-white px-5 py-4 text-[16px] font-black text-cherry-dark transition active:scale-[0.99]"
        >
          Entrar
        </Link>
        <p className="pt-2 text-center text-[12.5px] font-medium leading-relaxed text-ink-muted">
          Ambiente de testes. Nenhum dinheiro real é movimentado; o Financial Live está indisponível.
        </p>
      </div>
    </main>
  );
}
