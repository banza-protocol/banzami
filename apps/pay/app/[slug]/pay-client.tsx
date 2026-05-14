'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AcquiringPayment, getPaymentLinkStatus, initiatePay } from '@/lib/api';

interface Props {
  slug:          string;
  amountDisplay: string | null;
  amountMinor:   number | null;
  currency:      string;
  description:   string | null;
  deepLink:      string;
  expiresAt:     string | null;
}

type Step =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'instructions'; payment: AcquiringPayment }
  | { type: 'confirmed' }
  | { type: 'error'; message: string };

const POLL_INTERVAL = 3000;

export default function PayClient({
  slug,
  amountDisplay,
  amountMinor,
  currency,
  description,
  deepLink,
  expiresAt,
}: Props) {
  const qrRef              = useRef<HTMLDivElement>(null);
  const [step, setStep]    = useState<Step>({ type: 'idle' });
  const [expired, setExpired] = useState(false);

  // Generate QR code once qrcode.js is loaded (for deep-link QR)
  useEffect(() => {
    const generate = () => {
      if (typeof window === 'undefined') return;
      const w = window as any;
      if (!w.QRCode || !qrRef.current) return;
      qrRef.current.innerHTML = '';
      new w.QRCode(qrRef.current, {
        text:         deepLink,
        width:        180,
        height:       180,
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

  // Check link expiry
  useEffect(() => {
    if (!expiresAt) return;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) { setExpired(true); return; }
    const t = setTimeout(() => setExpired(true), remaining);
    return () => clearTimeout(t);
  }, [expiresAt]);

  // Poll for payment confirmation (once instructions are shown)
  useEffect(() => {
    if (step.type !== 'instructions' && step.type !== 'idle') return;
    const id = setInterval(async () => {
      try {
        const { paid } = await getPaymentLinkStatus(slug);
        if (paid) {
          setStep({ type: 'confirmed' });
          clearInterval(id);
        }
      } catch { /* network error — keep polling */ }
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [slug, step.type]);

  const handlePayWithMulticaixa = useCallback(async () => {
    setStep({ type: 'loading' });
    try {
      const payment = await initiatePay(slug, amountMinor ?? undefined);
      setStep({ type: 'instructions', payment });
    } catch (e: any) {
      setStep({ type: 'error', message: e.message ?? 'Erro ao iniciar pagamento.' });
    }
  }, [slug, amountMinor]);

  // Confirmed state
  if (step.type === 'confirmed') {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Pagamento confirmado!</h1>
          <p className="mt-2 text-sm text-gray-500">Obrigado. O pagamento foi recebido com sucesso.</p>
        </div>
      </main>
    );
  }

  // Instructions state — show entity + reference
  if (step.type === 'instructions') {
    const { instructions, expires_at } = step.payment;
    const expiryLabel = expires_at
      ? new Date(expires_at).toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })
      : null;

    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-sm space-y-4">

          {/* Header */}
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

          {/* Multicaixa Express instructions */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-center text-sm font-semibold text-gray-700 mb-4">
              Pagar via Multicaixa Express
            </h2>

            <div className="space-y-3">
              <InstructionStep n={1} label="Abra a app Multicaixa Express" />
              <InstructionStep n={2} label="Seleccione «Pagamentos de Serviços»" />
              <InstructionStep n={3} label="Introduza a entidade e a referência abaixo" />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Entidade</p>
                <p className="text-2xl font-bold tracking-widest text-gray-900">{instructions.entity}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Referência</p>
                <p className="text-2xl font-bold tracking-widest text-gray-900">
                  {instructions.reference.replace(/(\d{3})(?=\d)/g, '$1 ')}
                </p>
              </div>
            </div>

            {expiryLabel && (
              <p className="mt-4 text-center text-xs text-amber-600">
                Válido até às {expiryLabel}
              </p>
            )}

            <div className="mt-5 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2">
              <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              <p className="text-xs text-blue-700">A aguardar confirmação de pagamento…</p>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400">
            Não feche esta página. Será notificado automaticamente.
          </p>
        </div>
      </main>
    );
  }

  // Default idle / loading state — show payment options
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
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

        {/* Error */}
        {step.type === 'error' && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {step.message}
          </div>
        )}

        {/* Multicaixa Express CTA */}
        <div className="rounded-2xl bg-white p-6 shadow-sm space-y-4">
          <button
            onClick={handlePayWithMulticaixa}
            disabled={step.type === 'loading' || expired}
            className="w-full rounded-xl py-3.5 text-center font-semibold text-white text-sm disabled:opacity-50 transition"
            style={{ background: '#6D071A' }}
          >
            {step.type === 'loading' ? 'A preparar…' : 'Pagar com Multicaixa Express'}
          </button>

          <div className="flex items-center gap-3 text-gray-300">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs">ou</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div>
            <p className="mb-3 text-center text-sm text-gray-500">
              Abra a app Banzami e digitalize o código QR
            </p>
            <div ref={qrRef} className="flex justify-center mb-4" />
            <a
              href={deepLink}
              className="inline-block w-full rounded-xl py-3 text-center font-semibold text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
            >
              Abrir app Banzami
            </a>
          </div>

          {expired ? (
            <p className="text-center text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              O tempo de pagamento expirou.
            </p>
          ) : (
            <p className="text-center text-xs text-gray-400">
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

function InstructionStep({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: '#6D071A' }}>
        {n}
      </span>
      <p className="text-sm text-gray-600 pt-0.5">{label}</p>
    </div>
  );
}
