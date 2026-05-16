interface QrDisplayProps {
  qrDataUrl: string;
}

/**
 * QR code with Banzami "B" mark overlaid at the center.
 * The QR is generated server-side and passed as a base64 data URL.
 */
export default function QrDisplay({ qrDataUrl }: QrDisplayProps) {
  return (
    <div className="flex justify-center">
      <div className="relative inline-block rounded-2xl border-2 border-wine/20 p-4 shadow-card bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt="QR code de pagamento"
          width={220}
          height={220}
          className="block"
        />
        {/* Center overlay: Banzami logo — white square background, no rounding */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-11 w-11 items-center justify-center bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/banzami-icon.png" alt="Banzami" width={36} height={36} />
          </div>
        </div>
      </div>
    </div>
  );
}
