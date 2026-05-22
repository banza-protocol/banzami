import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getConsumerPayLink, formatAmount } from '@/lib/api';

interface Props {
  params: { code: string };
}

export function generateMetadata({ params }: Props): Metadata {
  return {
    title:       `Pedido de pagamento — Banza`,
    description: `Pague de forma rápida e segura com o Banza.`,
  };
}

export default async function PaymentRequestPage({ params }: Props) {
  const link = await getConsumerPayLink(params.code);
  if (!link) notFound();

  if (link.status === 'PAID') {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Pagamento recebido</h1>
          <p className="mt-2 text-sm text-gray-400">Este pedido de pagamento já foi liquidado.</p>
        </div>
      </main>
    );
  }

  if (link.status === 'EXPIRED' || link.status === 'CANCELLED') {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <svg className="h-7 w-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Link inválido</h1>
          <p className="mt-2 text-sm text-gray-400">
            {link.status === 'EXPIRED' ? 'Este pedido de pagamento expirou.' : 'Este pedido foi cancelado.'}
          </p>
        </div>
      </main>
    );
  }

  const handle       = link.receiver_handle;
  const displayName  = link.receiver_display_name;
  const amountDisplay = link.amount_minor != null
    ? formatAmount(link.amount_minor, link.currency)
    : null;
  const initial      = (displayName ?? handle)[0]?.toUpperCase() ?? 'B';

  // Use the pay-link code path so Flutter calls payConsumerPayLink(),
  // not sendByHandle() — this enforces backend amount authority and link lifecycle.
  const deepLink = `banza://pay?request=${params.code}`;

  return (
    <main className="min-h-screen bg-off-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="bg-white rounded-3xl shadow-card overflow-hidden">
          {/* Wine header */}
          <div className="bg-wine-gradient px-6 pt-8 pb-10 flex flex-col items-center gap-3">
            <div className="h-16 w-16 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <span className="text-2xl font-bold text-white select-none">{initial}</span>
            </div>

            <div className="text-center">
              {displayName && (
                <p className="text-white font-semibold text-base">{displayName}</p>
              )}
              <p className="text-white/70 text-sm mt-0.5">@{handle}</p>
              <p className="text-white/50 text-xs mt-1">Solicitou um pagamento</p>
            </div>

            {amountDisplay && (
              <div className="mt-1 bg-white/15 rounded-xl px-5 py-2">
                <p className="text-white text-2xl font-bold tracking-tight">{amountDisplay}</p>
              </div>
            )}
          </div>

          {/* Optional note */}
          {link.note && (
            <div className="px-6 pt-4 pb-0">
              <p className="text-center text-sm text-gray-500 italic">{link.note}</p>
            </div>
          )}

          {/* CTA */}
          <div className="px-6 py-6 flex flex-col gap-3">
            <a
              href={deepLink}
              className="flex items-center justify-center gap-2 w-full h-14 bg-wine text-white rounded-2xl text-base font-semibold shadow-sm active:bg-wine/90 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3"  y="3"  width="7" height="7" rx="1" />
                <rect x="14" y="3"  width="7" height="7" rx="1" />
                <rect x="3"  y="14" width="7" height="7" rx="1" />
                <circle cx="17.5" cy="17.5" r="2.5" />
              </svg>
              {amountDisplay ? `Pagar ${amountDisplay}` : 'Pagar com Banza'}
            </a>

            <p className="text-center text-xs text-gray-400 leading-relaxed">
              Precisa de ter a app Banza instalada.
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Pagamentos via{' '}
          <span className="font-semibold text-wine">Banza</span>
        </p>
      </div>
    </main>
  );
}
