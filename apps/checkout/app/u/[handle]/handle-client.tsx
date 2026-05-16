'use client';

import { useCallback, useState } from 'react';
import CheckoutShell from '@/components/checkout-shell';
import QrDisplay from '@/components/qr-display';

interface Props {
  handle:      string;
  amountLabel: string | null;
  deepLink:    string;
  shareUrl:    string;
  qrDataUrl:   string;
}

export default function HandlePayClient({ handle, amountLabel, deepLink, shareUrl, qrDataUrl }: Props) {
  const [copyLabel, setCopyLabel] = useState('Copiar link');

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyLabel('Copiado!');
      setTimeout(() => setCopyLabel('Copiar link'), 2000);
    } catch {
      // Clipboard unavailable — silently ignore
    }
  }, [shareUrl]);

  return (
    <CheckoutShell>
      <div className="space-y-3">

        {/* Header card */}
        <div className="rounded-2xl bg-wine-gradient px-6 py-7 shadow-elevated">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-white/50">
              Banzami
            </span>
            <span className="flex items-center gap-1.5 text-xs text-white/60">
              <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse-dot" />
              Seguro
            </span>
          </div>
          <div className="mt-2 text-center">
            {amountLabel && (
              <p className="text-3xl font-bold text-white">{amountLabel}</p>
            )}
            <p className={`font-semibold text-white/90 ${amountLabel ? 'mt-1 text-base' : 'text-2xl'}`}>
              @{handle}
            </p>
            {!amountLabel && (
              <p className="mt-1 text-sm text-white/60">Montante livre</p>
            )}
          </div>
        </div>

        {/* QR card */}
        <div className="rounded-2xl bg-white shadow-card">
          <div className="px-6 pt-7 pb-5">
            <QrDisplay qrDataUrl={qrDataUrl} />
          </div>

          <div className="mx-6 h-px bg-gray-100" />

          <div className="px-6 py-5 text-center">
            <p className="text-sm text-gray-400">
              Aponte a câmara da app Banzami para pagar
            </p>
          </div>

          <div className="mx-6 h-px bg-gray-100" />

          <div className="px-6 py-5 space-y-3">
            {/* Open app */}
            <a
              href={deepLink}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-wine-gradient py-3.5 text-sm font-semibold text-white shadow-card transition hover:opacity-90 active:opacity-80"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
              Abrir app Banzami
            </a>

            {/* Copy link */}
            <button
              onClick={handleCopy}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 active:bg-gray-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copyLabel}
            </button>
          </div>
        </div>

        <p className="pb-2 text-center text-xs text-gray-400">
          Powered by <span className="font-semibold text-wine">Banzami</span>
        </p>

      </div>
    </CheckoutShell>
  );
}
