import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { getPaymentLink } from '@/lib/api';
import { formatAmount } from '@/lib/format';
import CheckoutShell from '@/components/checkout-shell';
import CheckoutClient from './pay-client';

interface Props {
  params: { slug: string };
}

export default async function CheckoutPage({ params }: Props) {
  const link = await getPaymentLink(params.slug);
  if (!link) notFound();

  if (link.status === 'USED') {
    return (
      <CheckoutShell>
        <div className="rounded-2xl bg-white p-10 text-center shadow-card">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-success-bg">
            <svg className="h-8 w-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Pagamento recebido</h1>
          <p className="mt-2 text-sm text-gray-400">Este link de pagamento já foi utilizado.</p>
          <p className="mt-8 text-xs text-gray-400">
            Powered by <span className="font-semibold text-wine">Banzami</span>
          </p>
        </div>
      </CheckoutShell>
    );
  }

  if (link.status === 'EXPIRED') {
    return (
      <CheckoutShell>
        <div className="rounded-2xl bg-white p-10 text-center shadow-card">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-warning-bg">
            <svg className="h-8 w-8 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Link expirado</h1>
          <p className="mt-2 text-sm text-gray-400">O tempo de pagamento deste link expirou.</p>
          <p className="mt-8 text-xs text-gray-400">
            Powered by <span className="font-semibold text-wine">Banzami</span>
          </p>
        </div>
      </CheckoutShell>
    );
  }

  if (link.status === 'CANCELLED') {
    return (
      <CheckoutShell>
        <div className="rounded-2xl bg-white p-10 text-center shadow-card">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-error-bg">
            <svg className="h-8 w-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Link cancelado</h1>
          <p className="mt-2 text-sm text-gray-400">Este link de pagamento foi cancelado.</p>
          <p className="mt-8 text-xs text-gray-400">
            Powered by <span className="font-semibold text-wine">Banzami</span>
          </p>
        </div>
      </CheckoutShell>
    );
  }

  // Generate QR server-side — no client-side flash, no CDN script loading
  const deepLink  = `banzami://pay/link/${link.slug}`;
  const qrDataUrl = await QRCode.toDataURL(deepLink, {
    width:                220,
    margin:               2,
    color:                { dark: '#990011', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });

  const amountDisplay = link.amount_minor != null
    ? formatAmount(link.amount_minor, link.currency)
    : null;

  return (
    <CheckoutClient
      slug={link.slug}
      merchantName={link.merchant_name}
      amountDisplay={amountDisplay}
      description={link.description}
      deepLink={deepLink}
      expiresAt={link.expires_at}
      qrDataUrl={qrDataUrl}
    />
  );
}
