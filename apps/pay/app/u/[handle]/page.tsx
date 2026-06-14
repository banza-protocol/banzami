import type { Metadata } from 'next';
import { formatAmount } from '@/lib/api';

interface Props {
  params:       { handle: string };
  searchParams: { amount?: string; currency?: string };
}

export function generateMetadata({ params }: Props): Metadata {
  return {
    title: `Pagar @${params.handle} — Banza`,
    description: `Envie dinheiro instantaneamente para @${params.handle} pelo Banza.`,
  };
}

export default function UserPayPage({ params, searchParams }: Props) {
  const handle    = params.handle;
  const rawAmount = searchParams.amount ? parseInt(searchParams.amount, 10) : null;
  const currency  = searchParams.currency ?? 'AOA';

  const amountMinor   = rawAmount != null && !isNaN(rawAmount) ? rawAmount : null;
  const amountDisplay = amountMinor != null ? formatAmount(amountMinor, currency) : null;

  const deepLink = amountMinor != null
    ? `banza://pay/u/${handle}?amount=${amountMinor}&currency=${currency}`
    : `banza://pay/u/${handle}`;

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
              Pagar com Banza
            </a>

            <p className="text-center text-xs text-gray-400 leading-relaxed">
              Precisa de ter a app Banza instalada.
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Pagamentos via{' '}
          <span className="font-semibold text-banzami">Banza</span>
        </p>
      </div>
    </main>
  );
}
