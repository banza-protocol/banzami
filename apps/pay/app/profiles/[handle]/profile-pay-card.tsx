'use client';

import QRCode from 'react-qr-code';
import { useState } from 'react';

/**
 * Client-side pay card for a public merchant profile.
 *
 *  • Shows a scannable static QR encoding `banza:@{handle}` — any Banzami app
 *    resolves it to a handle payment (QR-004 "QR estático exibido").
 *  • "Pagar agora" deep-links into the app via `banzami://pay/u/{handle}`,
 *    the format the in-app scanner/router understands.
 *  • Share uses the Web Share API (WhatsApp / Instagram / etc.) with a plain
 *    link fallback.
 */
export default function ProfilePayCard({
  handle,
  displayName,
}: {
  handle: string;
  displayName: string;
}) {
  const [copied, setCopied] = useState(false);

  // banza:@handle — the Banzami-native scan-to-pay token the app understands.
  const qrValue = `banza:@${handle}`;
  // Same-device tap → opens the app on the pay-this-handle screen.
  const deepLink = `banzami://pay/u/${handle}`;
  const shareUrl =
    typeof window !== 'undefined' ? window.location.href : `https://pay.banzami.com/profiles/${handle}`;

  async function share() {
    const data = {
      title: `Pagar a ${displayName}`,
      text: `Paga a @${handle} com Banzami`,
      url: shareUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
    } catch {
      // user cancelled or share failed — fall through to copy
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — nothing more we can do */
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Static QR */}
      <div className="bg-white rounded-2xl shadow-sm p-6 flex flex-col items-center gap-3">
        <div className="bg-white p-3 rounded-xl border border-gray-100">
          <QRCode value={qrValue} size={176} fgColor="#B5101F" />
        </div>
        <p className="text-sm text-gray-500 text-center">
          Aponta a câmara do Banzami para pagar a{' '}
          <span className="font-semibold text-gray-800">@{handle}</span>
        </p>
      </div>

      {/* Pay button (same device) */}
      <a
        href={deepLink}
        className="flex items-center justify-center gap-2 h-14 bg-banzami text-white rounded-2xl text-base font-semibold shadow-md hover:bg-banzami/90 transition-colors"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <circle cx="17.5" cy="17.5" r="2.5" />
        </svg>
        Pagar agora
      </a>

      {/* Share */}
      <button
        onClick={share}
        className="flex items-center justify-center gap-2 h-12 bg-white text-gray-700 border border-gray-200 rounded-2xl text-sm font-semibold hover:bg-gray-50 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        {copied ? 'Link copiado!' : 'Partilhar'}
      </button>
    </div>
  );
}
