import { notFound } from 'next/navigation';
import { getPaymentLink, getPlatformMode, formatAmount } from '@/lib/api';
import PayClient from './pay-client';

interface Props {
  // Next 15: route params arrive as a Promise.
  params: Promise<{ slug: string }>;
}

/**
 * Canonical payment-link page: https://pay.banzami.com/pay/<slug>.
 *
 * This is the URL the SDK emits (qrValue/paymentUrl) and the host the
 * Banzami mobile app deep-links via Universal Link / App Link. The bare
 * /<slug> route redirects here for backward compatibility.
 */
export default async function PayPage({ params }: Props) {
  const { slug } = await params;
  const link = await getPaymentLink(slug);
  if (!link) notFound();

  if (link.status === 'USED') {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Pagamento recebido</h1>
          <p className="mt-2 text-sm text-gray-400">Este link de pagamento já foi utilizado.</p>
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
            {link.status === 'EXPIRED' ? 'Este link de pagamento expirou.' : 'Este link foi cancelado.'}
          </p>
        </div>
      </main>
    );
  }

  const amountDisplay = link.amount_minor != null
    ? formatAmount(link.amount_minor, link.currency)
    : null;

  const deepLink = `banzami://pay/link/${link.slug}`;

  // External acquiring rails are a separate governance decision and are not
  // approved. Offering the button while the platform is in SANDBOX would
  // advertise a rail the platform itself records as unavailable — an overclaim
  // rendered as a control. Resolved server-side so the option is absent, not
  // merely hidden.
  const mode = await getPlatformMode();

  return (
    <PayClient
      externalRailAvailable={mode === 'LIVE'}
      slug={link.slug}
      merchantName={link.merchant_name}
      amountDisplay={amountDisplay}
      amountMinor={link.amount_minor}
      currency={link.currency}
      description={link.description}
      deepLink={deepLink}
      expiresAt={link.expires_at}
    />
  );
}
