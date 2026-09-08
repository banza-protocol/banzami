import type { Metadata } from 'next';
import { formatAmount } from '@/lib/api';

interface Props {
  // Next 15: both arrive as Promises.
  params:       Promise<{ handle: string }>;
  searchParams: Promise<{ amount?: string; currency?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  return {
    title: `Pagar @${handle} — Banzami`,
    description: `Envie dinheiro instantaneamente para @${handle} pelo Banzami.`,
  };
}

export default async function UserPayPage({ params, searchParams }: Props) {
  const [{ handle }, sp] = await Promise.all([params, searchParams]);
  const rawAmount = sp.amount ? parseInt(sp.amount, 10) : null;
  const currency  = sp.currency ?? 'AOA';

  const amountMinor   = rawAmount != null && !isNaN(rawAmount) ? rawAmount : null;
  const amountDisplay = amountMinor != null ? formatAmount(amountMinor, currency) : null;

  const deepLink = amountMinor != null
    ? `banzami://pay/u/${handle}?amount=${amountMinor}&currency=${currency}`
    : `banzami://pay/u/${handle}`;

  const initial = handle[0]?.toUpperCase() ?? 'B';

  return (
    <main className="min-h-screen bg-off-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="bg-white rounded-3xl shadow-card overflow-hidden">
          {/* Wine header strip */}
          <div className="bg-banzami-gradient px-6 pt-8 pb-10 flex flex-col items-center gap-3">
            <div className="h-16 w-16 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <span className="text-2xl font-bold text-white select-none">{initial}</span>
            </div>

            <div className="text-center">
              <p className="text-white/60 text-sm">Pagar a</p>
              <h1 className="text-white text-xl font-bold mt-0.5">@{handle}</h1>
            </div>

            {amountDisplay && (
              <div className="mt-1 bg-white/15 rounded-xl px-5 py-2">
                <p className="text-white text-2xl font-bold tracking-tight">{amountDisplay}</p>
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="px-6 py-6 flex flex-col gap-3">
            <a
              href={deepLink}
              className="flex items-center justify-center gap-2 w-full h-14 bg-banzami text-white rounded-2xl text-base font-semibold shadow-sm active:bg-banzami/90 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3"  y="3"  width="7" height="7" rx="1" />
                <rect x="14" y="3"  width="7" height="7" rx="1" />
                <rect x="3"  y="14" width="7" height="7" rx="1" />
                <circle cx="17.5" cy="17.5" r="2.5" />
              </svg>
              Pagar com Banzami
            </a>

            <p className="text-center text-xs text-gray-400 leading-relaxed">
              Precisa de ter a app Banzami instalada.
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Pagamentos via{' '}
          <span className="font-semibold text-banzami">Banzami</span>
        </p>
      </div>
    </main>
  );
}
