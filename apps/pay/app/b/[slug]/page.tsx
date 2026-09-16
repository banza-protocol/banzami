import { notFound } from 'next/navigation';
import { deepLink as deepLinkFor } from '@/lib/deep-link';
import { getReceivePoint } from '@/lib/api';

interface Props {
  // Next 15: route params arrive as a Promise.
  params: Promise<{ slug: string }>;
}

/**
 * Business Receive Point page: https://pay.banzami.com/b/<slug> (ADR-065).
 *
 * This is the URL a Business's persistent, printable receive QR encodes. A plain
 * phone camera opens this page; the Banzami app intercepts the same universal
 * link and pays there. The QR is persistent — every payment mints a FRESH
 * Payment Session — so this page resolves only the Business's payer-safe identity
 * and sends the payer into the app to enter an amount and pay. It never carries
 * an amount or a session of its own.
 */
export default async function ReceivePointPage({ params }: Props) {
  const { slug } = await params;
  const point = await getReceivePoint(slug);
  if (!point) notFound();

  // Fail closed: a disabled or retired receive point is not payable, and says so
  // rather than sending the payer into the app for a destination that will refuse.
  if (point.status !== 'ACTIVE') {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <svg className="h-7 w-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">QR indisponível</h1>
          <p className="mt-2 text-sm text-gray-400">
            Este QR de recebimento já não está activo.
          </p>
        </div>
      </main>
    );
  }

  // This deployment's scheme; the app refuses one of the other environment (A8-11).
  const deepLink = deepLinkFor(`pay/business/${point.slug}`);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-md">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
          <svg className="h-7 w-7 text-[#B5101F]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z M8 21h8" />
          </svg>
        </div>
        <p className="text-sm text-gray-400">Pagar a</p>
        <h1 className="mt-1 text-xl font-bold text-gray-900">{point.display_name}</h1>
        {point.handle && (
          <p className="mt-1 text-sm font-semibold text-[#B5101F]">@{point.handle}</p>
        )}
        <p className="mt-6 text-sm text-gray-600">
          Leia este QR na app Banzami, escreva o montante e pague — direto para a
          carteira do negócio.
        </p>
        {deepLink && (
          <a
            href={deepLink}
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-[#B5101F] px-4 py-3 text-sm font-semibold text-white"
          >
            Abrir na app Banzami
          </a>
        )}
      </div>
    </main>
  );
}
