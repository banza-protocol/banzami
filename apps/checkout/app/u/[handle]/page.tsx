import { banzamiQrSvgDataUri, QR_SIZE } from '@/lib/banzami-qr';
import { formatAmount } from '@/lib/format';
import HandlePayClient from './handle-client';

interface Props {
  params:      { handle: string };
  searchParams: { amount?: string };
}

export default async function HandlePayPage({ params, searchParams }: Props) {
  const handle = params.handle;
  const amountMinor = searchParams.amount ? parseInt(searchParams.amount, 10) : null;
  const validAmount = amountMinor && amountMinor > 0 ? amountMinor : null;

  const qrPayload = validAmount
    ? `banzami:@${handle}?amount=${validAmount}&currency=AOA`
    : `banzami:@${handle}`;

  const shareUrl = validAmount
    ? `https://pay.banzami.com/u/${handle}?amount=${validAmount}`
    : `https://pay.banzami.com/u/${handle}`;

  // Canonical Banzami QR Engine — ECC H, quiet zone 4, red finders, centre logo.
  const qrDataUrl = banzamiQrSvgDataUri(qrPayload, { size: QR_SIZE.MD });

  const amountLabel = validAmount ? formatAmount(validAmount, 'AOA') : null;

  return (
    <HandlePayClient
      handle={handle}
      amountLabel={amountLabel}
      deepLink={qrPayload}
      shareUrl={shareUrl}
      qrDataUrl={qrDataUrl}
    />
  );
}
