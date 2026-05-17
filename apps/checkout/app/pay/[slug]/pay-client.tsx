'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getPaymentLinkStatus } from '@/lib/api';
import CheckoutShell from '@/components/checkout-shell';
import AmountDisplay from '@/components/amount-display';
import QrDisplay from '@/components/qr-display';
import CountdownTimer from '@/components/countdown-timer';
import StatusBadge from '@/components/status-badge';

interface Props {
  slug:          string;
  merchantName:  string;
  amountDisplay: string | null;
  description:   string | null;
  deepLink:      string;
  expiresAt:     string | null;
  qrDataUrl:     string;
}

type CheckoutState = 'active' | 'confirmed' | 'expired' | 'error';

const POLL_INTERVAL = 3000;

export default function CheckoutClient({
  slug,
  merchantName,
  amountDisplay,
  description,
  deepLink,
  expiresAt,
  qrDataUrl,
}: Props) {
  const [state, setState]         = useState<CheckoutState>('active');
  const [copyLabel, setCopyLabel] = useState('Copiar link');
  const pollRef                   = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
  };

  // Poll for payment confirmation
  useEffect(() => {
    if (state !== 'active') return;

    pollRef.current = setInterval(async () => {
      try {
        const { paid } = await getPaymentLinkStatus(slug);
        if (paid) {
          stopPolling();
          setState('confirmed');
        }
      } catch {
        // Network hiccup — keep polling without surfacing noise to the user
      }
    }, POLL_INTERVAL);

    return stopPolling;
  }, [slug, state]);

  const handleExpired = useCallback(() => {
    stopPolling();
    setState('expired');
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyLabel('Copiado!');
      setTimeout(() => setCopyLabel('Copiar link'), 2000);
    } catch {
      // Clipboard unavailable — silently ignore
    }
  }, []);

  // ── Confirmed state ───────────────────────────────────────────────────────
  if (state === 'confirmed') {
    return (
      <CheckoutShell>
        <div className="animate-fade-up rounded-2xl bg-white p-10 text-center shadow-card">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-success-bg">
            <svg
              className="animate-checkmark h-10 w-10 text-success"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Pagamento confirmado!</h2>
          <p className="mt-2 text-sm text-gray-400">
            Obrigado. O pagamento foi recebido com sucesso.
          </p>
          <p className="mt-10 text-xs text-gray-400">
            Powered by <span className="font-semibold text-wine">Banzami</span>
          </p>
        </div>
      </CheckoutShell>
    );
  }

  // ── Expired state (timer fired while page was open) ───────────────────────
  if (state === 'expired') {
    return (
      <CheckoutShell>
        <div className="animate-fade-up rounded-2xl bg-white p-10 text-center shadow-card">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-warning-bg">
            <svg
              className="h-8 w-8 text-warning"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Link expirado</h2>
          <p className="mt-2 text-sm text-gray-400">
            O tempo de pagamento deste link expirou.
          </p>
          <p className="mt-10 text-xs text-gray-400">
            Powered by <span className="font-semibold text-wine">Banzami</span>
          </p>
        </div>
      </CheckoutShell>
    );
  }

  // ── Active state ──────────────────────────────────────────────────────────
  return (
    <CheckoutShell>
      <div className="space-y-3">

        {/* Wine header card */}
        <div className="rounded-2xl bg-wine-gradient px-6 py-7 shadow-elevated">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-white/70">
              {merchantName}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-white/60">
              <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse-dot" />
              Seguro
            </span>
          </div>
          <AmountDisplay amountDisplay={amountDisplay} description={description} />
        </div>

        {/* Main card */}
        <div className="rounded-2xl bg-white shadow-card">

          {/* QR section */}
          <div className="px-6 pt-7 pb-5">
            <QrDisplay qrDataUrl={qrDataUrl} />
          </div>

          {/* Divider */}
          <div className="mx-6 h-px bg-gray-100" />

          {/* Countdown + status */}
          <div className="px-6 py-5 space-y-4">
            {expiresAt && (
              <CountdownTimer expiresAt={expiresAt} onExpired={handleExpired} />
            )}

            <div className="flex justify-center">
              <StatusBadge variant="waiting" label="A aguardar pagamento…" />
            </div>
          </div>

          {/* Divider */}
          <div className="mx-6 h-px bg-gray-100" />

          {/* Action buttons */}
          <div className="px-6 py-5 space-y-3">
            {/* Primary — deep link into the Banzami app */}
            <a
              href={deepLink}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-wine-gradient py-3.5 text-sm font-semibold text-white shadow-card transition hover:opacity-90 active:opacity-80"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
              Abrir app Banzami
            </a>

            {/* Secondary — copy page URL */}
            <button
              onClick={handleCopyLink}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 active:bg-gray-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copyLabel}
            </button>
          </div>

        </div>

        {/* Footer */}
        <p className="pb-4 text-center text-xs text-gray-400">
          Não feche esta página — será notificado automaticamente.
        </p>

        <p className="pb-2 text-center text-xs text-gray-400">
          Powered by <span className="font-semibold text-wine">Banzami</span>
        </p>

      </div>
    </CheckoutShell>
  );
}
