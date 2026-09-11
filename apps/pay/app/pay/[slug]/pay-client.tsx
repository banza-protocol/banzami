'use client';

import { useCallback, useEffect, useState } from 'react';
import { banzamiQrSvgDataUri } from '@/lib/banzami-qr';
import { AcquiringPayment, getPaymentLinkStatus, initiatePay } from '@/lib/api';
import { formatWatTime } from '@/lib/money';
import { paidToLabel, payeeDisplay, type Payee } from '@/lib/payee';

interface Props {
  slug:          string;
  merchantName:  string;
  merchantHandle: string | null;
  amountDisplay: string | null;
  amountMinor:   number | null;
  currency:      string;
  description:   string | null;
  deepLink:      string;
  expiresAt:     string | null;
  /** Whether the external acquiring rail may be offered (LIVE only). */
  externalRailAvailable: boolean;
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
  merchantName,
  merchantHandle,
  amountDisplay,
  amountMinor,
  currency,
  description,
  deepLink,
  expiresAt,
  externalRailAvailable,
}: Props) {
  const [step, setStep]     = useState<Step>({ type: 'idle' });
  const [expired, setExpired] = useState(false);
  const [copied, setCopied]  = useState(false);

  // Link expiry timer
  useEffect(() => {
    if (!expiresAt) return;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) { setExpired(true); return; }
    const t = setTimeout(() => setExpired(true), remaining);
    return () => clearTimeout(t);
  }, [expiresAt]);

  // Poll for payment confirmation
  useEffect(() => {
    if (step.type !== 'instructions' && step.type !== 'idle') return;
    const id = setInterval(async () => {
      try {
        const { paid } = await getPaymentLinkStatus(slug);
        if (paid) { setStep({ type: 'confirmed' }); clearInterval(id); }
      } catch { /* keep polling */ }
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

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {}
  }, []);

  const payee = payeeDisplay(merchantName, merchantHandle);

  // ── Confirmed ─────────────────────────────────────────────────────────────
  if (step.type === 'confirmed') {
    const paidTo = paidToLabel(merchantName, merchantHandle);
    return (
      <main className="bz-page">
        <div className="bz-card animate-fade-up max-w-sm text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-success-bg">
            <svg className="h-8 w-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Pagamento confirmado!</h1>
          {paidTo && (
            <p className="mt-2 text-sm text-gray-600">{paidTo}</p>
          )}
        </div>
      </main>
    );
  }

  // ── Multicaixa Express instructions ───────────────────────────────────────
  if (step.type === 'instructions') {
    const { instructions, expires_at } = step.payment;
    const expiryLabel = expires_at
      ? formatWatTime(expires_at)
      : null;

    return (
      <main className="bz-page">
        <div className="w-full max-w-sm space-y-4 animate-fade-up">
          <HeroCard
            payee={payee}
            amountDisplay={amountDisplay}
            description={description}
          />

          <div className="bz-card space-y-5">
            <h2 className="text-center text-sm font-semibold text-gray-900">
              Pagar via Multicaixa Express
            </h2>

            <div className="space-y-3">
              <InstructionStep n={1} label="Abra a app Multicaixa Express" />
              <InstructionStep n={2} label="Seleccione «Pagamentos de Serviços»" />
              <InstructionStep n={3} label="Introduza a entidade e referência abaixo" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <RefBox label="Entidade" value={instructions.entity} />
              <RefBox
                label="Referência"
                value={instructions.reference.replace(/(\d{3})(?=\d)/g, '$1 ')}
              />
            </div>

            {expiryLabel && (
              <p className="text-center text-xs text-warning">Válido até às {expiryLabel}</p>
            )}

            <div className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-banzami animate-pulse" />
              <p className="text-xs text-gray-600">A aguardar confirmação de pagamento…</p>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400">
            Não feche esta página. Será notificado automaticamente.
          </p>
        </div>
      </main>
    );
  }

  // ── Idle / loading / error ────────────────────────────────────────────────
  return (
    <main className="bz-page">
      <div className="w-full max-w-sm space-y-4 animate-fade-up">

        {/* Hero card */}
        <HeroCard
          payee={payee}
          amountDisplay={amountDisplay}
          description={description}
        />

        {/* Error banner */}
        {step.type === 'error' && (
          <div className="rounded-xl bg-error-bg px-4 py-3 text-sm text-error">
            {step.message}
          </div>
        )}

        {/* Expired banner */}
        {expired && (
          <div className="rounded-xl bg-warning-bg px-4 py-3 text-center text-sm font-medium text-warning">
            O tempo de pagamento expirou.
          </div>
        )}

        {/* Sandbox disclosure.
            Rendered from the mode the SERVER resolved, not from a browser fetch.
            The floating PlatformBadge needs JavaScript and a successful call to
            /v1/platform-mode; a payer with either blocked would have seen a page
            that looks exactly like a real payment. A disclosure that can fail
            open is not a disclosure. */}
        {!externalRailAvailable && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-center">
            <p className="text-xs font-extrabold uppercase tracking-wide text-amber-900">
              SANDBOX — ambiente de testes
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Nenhum dinheiro real é movimentado.
            </p>
          </div>
        )}

        {/* QR + CTAs */}
        <div className="bz-card space-y-5">

          {/* Security label */}
          <div className="flex items-center justify-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            <p className="text-xs font-medium text-success">Pagamento seguro Banzami</p>
          </div>

          {/* Floating QR frame */}
          <div className="flex justify-center">
            <div className="bz-qr-frame animate-float">
              {/* Canonical Banzami QR Engine — ECC H, red finders, centre logo. */}
              <img
                src={banzamiQrSvgDataUri(deepLink)}
                width={172}
                height={172}
                alt="QR de pagamento Banzami"
                className="block"
              />
            </div>
          </div>

          <p className="text-center text-xs text-gray-400">
            Abra a app Banzami e digitalize o código QR
          </p>

          {/* Open app — primary CTA */}
          <a href={deepLink} className="bz-btn-primary">
            Abrir app Banzami
          </a>

          {/* Divider + external rail — LIVE only. */}
          {externalRailAvailable && (
          <>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">ou</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <button
            onClick={handlePayWithMulticaixa}
            disabled={step.type === 'loading' || expired}
            className="w-full rounded-2xl border border-gray-200 py-3.5 text-center text-sm
                       font-semibold text-gray-700 transition duration-200
                       hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {step.type === 'loading' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-banzami border-t-transparent animate-spin" />
                A preparar…
              </span>
            ) : (
              'Pagar com Multicaixa Express'
            )}
          </button>
          </>
          )}

          {/* Copy link */}
          <button onClick={handleCopyLink} className="bz-btn-glass w-full">
            {copied ? '✓ Link copiado' : 'Copiar link de pagamento'}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400">
          Não feche esta página. Será notificado automaticamente.
        </p>
      </div>
    </main>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function HeroCard({
  payee,
  amountDisplay,
  description,
}: {
  payee:         Payee;
  amountDisplay: string | null;
  description:   string | null;
}) {
  return (
    <div className="bz-hero-card">
      {/* Metallic sweep shimmer */}
      <div className="bz-hero-sweep" aria-hidden="true" />

      <div className="relative z-10 flex flex-col items-center">
        {/* Brand label + security badge */}
        <div className="flex w-full items-center justify-between">
          {/*
            Banzami, not BANZA. This is the page a payer looks at, and the two
            names are different things: BANZA is the protocol, Banzami is the
            operator whose product this is (BANZA ADR-002 §15.2). Everything
            else on the card already says Banzami — "Pagamento seguro Banzami",
            "Abrir app Banzami" — so the wordmark was the one place naming the
            protocol at someone about to pay.
          */}
          <span className="text-[10px] font-bold tracking-[0.22em] text-white/40 uppercase">
            Banzami
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5
                           text-[10px] font-semibold text-white/75 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            Seguro
          </span>
        </div>

        {/* Payee: the Business's public name, its @banza under it. */}
        {payee.primary && (
          <p className="mt-4 text-sm font-semibold text-white/80">
            {payee.primary}
          </p>
        )}
        {payee.secondary && (
          <p className="text-xs font-medium text-white/55">
            {payee.secondary}
          </p>
        )}

        {/* Amount */}
        {amountDisplay ? (
          <p className="mt-1 text-[2.75rem] font-bold leading-none tabular-nums text-white">
            {amountDisplay}
          </p>
        ) : (
          <p className="mt-1 text-2xl font-semibold text-white/65">Valor livre</p>
        )}

        {/* Description */}
        {description && (
          <p className="mt-1.5 text-xs text-white/45">{description}</p>
        )}
      </div>
    </div>
  );
}

function InstructionStep({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full
                       bg-banzami text-xs font-bold text-white">
        {n}
      </span>
      <p className="pt-0.5 text-sm text-gray-600">{label}</p>
    </div>
  );
}

function RefBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-100 p-3 text-center">
      <p className="mb-1 text-xs text-gray-400">{label}</p>
      <p className="text-2xl font-bold tabular-nums tracking-widest text-gray-900">{value}</p>
    </div>
  );
}
