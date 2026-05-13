'use client';

import { useEffect, useRef, useState } from 'react';
import { getPaymentLinkStatus } from '@/lib/api';

interface Props {
  slug:          string;
  amountDisplay: string | null;
  currency:      string;
  description:   string | null;
  deepLink:      string;
  expiresAt:     string | null;
}

const POLL_INTERVAL = 3000;

export default function PayClient({
  slug,
  amountDisplay,
  description,
  deepLink,
  expiresAt,
}: Props) {
  const qrRef           = useRef<HTMLDivElement>(null);
  const [paid, setPaid] = useState(false);
  const [expired, setExpired] = useState(false);

  // Generate QR code once qrcode.js is loaded
  useEffect(() => {
    const generate = () => {
      if (typeof window === 'undefined') return;
      const w = window as any;
      if (!w.QRCode || !qrRef.current) return;
      qrRef.current.innerHTML = '';
      new w.QRCode(qrRef.current, {
        text:         deepLink,
        width:        200,
        height:       200,
        colorDark:    '#6D071A',
        colorLight:   '#ffffff',
        correctLevel: w.QRCode.CorrectLevel.M,
      });
    };
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.integrity = 'sha512-CNgIRecGo7nphbeZ04Sc13ka07paqdeTu0WR1IM4kNcpmBAUSHSe7Vg2urhSgkXxmYWJDnOAUBxmBKMgNxIDg==';
    script.crossOrigin = 'anonymous';
    script.onload = generate;
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, [deepLink]);

  // Check expiry on mount
  useEffect(() => {
    if (!expiresAt) return;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) { setExpired(true); return; }
    const t = setTimeout(() => setExpired(true), remaining);
    return () => clearTimeout(t);
  }, [expiresAt]);

  // Poll for payment
  useEffect(() => {
    if (paid || expired) return;
    const id = setInterval(async () => {
      try {
        const { paid: isPaid } = await getPaymentLinkStatus(slug);
        if (isPaid) {
          setPaid(true);
          clearInterval(id);
        }
      } catch { /* network error — keep polling */ }
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [slug, paid, expired]);

  if (paid) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Pagamento confirmado!</h1>
          <p className="mt-2 text-sm text-gray-400">Obrigado. O pagamento foi recebido com sucesso.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-off-white p-4">
      <div className="w-full max-w-sm space-y-4">

        {/* Amount / header */}
        <div className="rounded-2xl p-6 text-center text-white" style={{ background: '#6D071A' }}>
          <p className="text-xs uppercase tracking-widest opacity-70">
            {description ?? 'Valor a pagar'}
          </p>
          {amountDisplay ? (
            <p className="mt-1 text-4xl font-bold tabular-nums">{amountDisplay}</p>
          ) : (
            <p className="mt-1 text-lg font-semibold opacity-80">Valor livre</p>
          )}
        </div>

        {/* QR + actions */}
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="mb-4 text-sm text-gray-700">
            Abra a app Banzami e digitalize o código QR, ou toque no botão abaixo.
          </p>

          <div ref={qrRef} className="flex justify-center mb-4" />

          <a
            href={deepLink}
            className="inline-block w-full rounded-xl py-3 text-center font-semibold text-white text-sm"
            style={{ background: '#6D071A' }}
          >
            Abrir app Banzami
          </a>

          {expired ? (
            <p className="mt-4 text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              O tempo de pagamento expirou.
            </p>
          ) : (
            <p className="mt-4 text-xs text-gray-400">
              A aguardar confirmação de pagamento…
            </p>
          )}
        </div>

        <p className="text-center text-xs text-gray-400">
          Não feche esta página. Será notificado automaticamente após o pagamento.
        </p>
      </div>
    </main>
  );
}
