import { notFound } from 'next/navigation';
import { deepLink as deepLinkFor } from '@/lib/deep-link';
import { getPaymentLink, getPlatformMode, formatAmount, linkIsPaid } from '@/lib/api';
import { paidToLabel } from '@/lib/payee';
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

  // Paid is the gateway's answer to "has the payment this link asked for been
  // made?" — true for a used link AND for a link retired because its Payment
  // Session was paid by QR. That second link is CANCELLED, and used to be shown
  // to the payer as "Link inválido · Este link foi cancelado".
  if (linkIsPaid(link)) {
    const paidTo = paidToLabel(link.merchant_name, link.merchant_handle);
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Pagamento já feito</h1>
          <p className="mt-2 text-sm text-gray-400">Este pagamento já foi feito.</p>
          {paidTo && <p className="mt-1 text-sm text-gray-600">{paidTo}</p>}
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

  // This deployment's scheme; the app refuses one of the other environment (A8-11).
  const deepLink = deepLinkFor(`pay/link/${link.slug}`);

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
      merchantHandle={link.merchant_handle}
      amountDisplay={amountDisplay}
      amountMinor={link.amount_minor}
      currency={link.currency}
      description={link.description}
      deepLink={deepLink}
      payUrl={`https://pay.banzami.com/pay/${link.slug}`}
      expiresAt={link.expires_at}
    />
  );
}
