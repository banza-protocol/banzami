'use client';

import { useEffect, useRef, useState } from 'react';
import type { ConsumerPayLink } from '@/lib/api';

type Phase = 'loading' | 'success' | 'not_found' | 'network_error' | 'timeout';

function formatAmt(amountMinor: number, currency: string): string {
  const major = amountMinor / 100;
  if (currency.toUpperCase() === 'AOA') {
    return `${major.toLocaleString('pt-AO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Kz`;
  }
  return new Intl.NumberFormat('pt-AO', { style: 'currency', currency, minimumFractionDigits: 2 }).format(major);
}

// ── Environment badges ──────────────────────────────────────────────────────

function SandboxBadge({ extra }: { extra?: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-yellow-400 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700">
      SANDBOX{extra ? ` • ${extra}` : ''}
    </span>
  );
}

function LiveBadge({ extra }: { extra?: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-banzami bg-white px-3 py-1 text-xs font-semibold text-banzami">
      Banza LIVE{extra ? ` • ${extra}` : ''}
    </span>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function LoadingUI() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-banzami border-t-transparent" />
        <p className="text-sm text-gray-400">A carregar pedido…</p>
      </div>
    </main>
  );
}

function NotFoundUI({ sandbox }: { sandbox: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-md">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
          <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          {sandbox ? 'Pedido sandbox inválido' : 'Pedido inválido'}
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          Esta ligação não existe, expirou ou pertence a outro ambiente.
        </p>
        {sandbox && (
          <div className="mt-4 flex justify-center">
            <SandboxBadge extra="Dinheiro de teste" />
          </div>
        )}
        <a
          href="banza://open"
          className="mt-6 inline-block w-full rounded-2xl bg-banzami py-3 text-sm font-semibold text-white active:bg-banzami-medium"
        >
          Abrir Banza
        </a>
      </div>
    </main>
  );
}

function ErrorUI({ title, body, sandbox }: { title: string; body: string; sandbox: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-md">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-error-bg">
          <svg className="h-7 w-7 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-400">{body}</p>
        {sandbox && (
          <div className="mt-4 flex justify-center">
            <SandboxBadge />
          </div>
        )}
        <button
          onClick={() => window.location.reload()}
          className="mt-6 w-full rounded-2xl bg-banzami py-3 text-sm font-semibold text-white active:bg-banzami-medium"
        >
          Tentar novamente
        </button>
      </div>
    </main>
  );
}

function PaidUI({ environment }: { environment: 'SANDBOX' | 'LIVE' }) {
  const isSandbox = environment === 'SANDBOX';
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-md">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          {isSandbox ? 'Pagamento de teste recebido' : 'Pagamento recebido'}
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          {isSandbox
            ? 'Este pedido foi liquidado em ambiente sandbox.'
            : 'Este pedido de pagamento foi liquidado.'}
        </p>
        <div className="mt-4 flex justify-center">
          {isSandbox
            ? <SandboxBadge extra="Dinheiro de teste" />
            : <LiveBadge extra="Pagamento real" />}
        </div>
        {isSandbox && (
          <p className="mt-3 text-xs text-yellow-600">Sem valor financeiro real.</p>
        )}
      </div>
    </main>
  );
}

function TerminalUI({
  environment,
  status,
}: {
  environment: 'SANDBOX' | 'LIVE';
  status: 'EXPIRED' | 'CANCELLED';
}) {
  const isSandbox  = environment === 'SANDBOX';
  const isCancelled = status === 'CANCELLED';

  const title = isCancelled
    ? (isSandbox ? 'Pedido de teste cancelado'    : 'Pedido cancelado')
    : (isSandbox ? 'Pedido de teste expirado'     : 'Pedido expirado');

  const body = isCancelled
    ? (isSandbox ? 'Este pedido sandbox foi cancelado.'              : 'Este pedido de pagamento foi cancelado.')
    : (isSandbox ? 'Esta ligação sandbox já não está disponível.'    : 'Esta ligação de pagamento já não está disponível.');

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-md">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <svg className="h-7 w-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-400">{body}</p>
        <div className="mt-4 flex justify-center">
          {isSandbox
            ? <SandboxBadge extra="Sem valor financeiro real" />
            : <LiveBadge />}
        </div>
      </div>
    </main>
  );
}

// ── Main client component ───────────────────────────────────────────────────

type OpenPhase = 'idle' | 'opening' | 'app_opened' | 'not_installed';

export default function PayRequestClient({ code, sandbox }: { code: string; sandbox: boolean }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [link,  setLink]  = useState<ConsumerPayLink | null>(null);
  const [openPhase, setOpenPhase] = useState<OpenPhase>('idle');
  const openPhaseRef = useRef<OpenPhase>('idle');
  const [returnedToBrowser, setReturnedToBrowser] = useState(false);

  function setOpen(p: OpenPhase) {
    openPhaseRef.current = p;
    setOpenPhase(p);
  }

  function openApp() {
    console.log('[pay/r] buttonClicked=true autoOpenOnMount=false');
    setOpen('opening');
    let tid: ReturnType<typeof setTimeout>;
    const onVis = () => {
      console.log('[pay/r] visibilitychange:', document.hidden ? 'hidden' : 'visible');
      if (document.hidden) {
        clearTimeout(tid);
        console.log('[pay/r] appOpenAssumed=true');
        setOpen('app_opened');
        document.removeEventListener('visibilitychange', onVis);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    tid = setTimeout(() => {
      document.removeEventListener('visibilitychange', onVis);
      if (openPhaseRef.current === 'opening') {
        console.log('[pay/r] appOpenAssumed=false (timeout 2500ms)');
        setOpen('not_installed');
      }
    }, 2500);
  }

  // When the app opens and the user returns to the browser, detect it and
  // reset the UI so they can easily tap the button again.
  useEffect(() => {
    if (openPhase !== 'app_opened') { setReturnedToBrowser(false); return; }
    const onVis = () => {
      if (!document.hidden) {
        console.log('[pay/r] returnedToBrowser=true');
        setReturnedToBrowser(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [openPhase]);

  useEffect(() => {
    console.log('[pay/r] mount code=' + code + ' sandbox=' + sandbox + ' autoOpenOnMount=false');
    const ctrl = new AbortController();
    const tid  = setTimeout(() => {
      ctrl.abort();
      setPhase('timeout');
      console.log('[pay/r] timeout fired for', code);
    }, 8_000);

    const url = `/api/pay-link/${encodeURIComponent(code)}${sandbox ? '?sandbox=1' : ''}`;
    console.log('[pay/r] fetch', url, '| sandbox:', sandbox);

    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        clearTimeout(tid);
        console.log('[pay/r] status', res.status, 'for', code);
        if (res.status === 404) { setPhase('not_found'); return; }
        if (!res.ok)            { setPhase('network_error'); return; }
        setLink(await res.json());
        setPhase('success');
      })
      .catch((err) => {
        clearTimeout(tid);
        if (err.name === 'AbortError') return;
        console.error('[pay/r] fetch error:', err);
        setPhase('network_error');
      });

    return () => { clearTimeout(tid); ctrl.abort(); };
  }, [code, sandbox]);

  // ── State renders ───────────────────────────────────────────────────────────

  if (phase === 'loading') return <LoadingUI />;

  if (phase === 'timeout')
    return <ErrorUI sandbox={sandbox} title="Não foi possível carregar" body="Verifique a ligação e tente novamente." />;

  if (phase === 'network_error')
    return <ErrorUI sandbox={sandbox} title="Erro de ligação" body="Não foi possível carregar o pedido." />;

  if (phase === 'not_found' || !link) return <NotFoundUI sandbox={sandbox} />;

  // Terminal states — use environment from the API response (server-injected,
  // definitively reflects which backend was queried, not inferred from URL).
  if (link.status === 'PAID') return <PaidUI environment={link.environment} />;

  if (link.status === 'EXPIRED' || link.status === 'CANCELLED')
    return <TerminalUI environment={link.environment} status={link.status} />;

  // ── ACTIVE payment card ─────────────────────────────────────────────────────

  const handle      = link.receiver_handle;
  const displayName = link.receiver_display_name;
  const amtDisplay  = link.amount_minor != null ? formatAmt(link.amount_minor, link.currency) : null;
  const initial     = (displayName ?? handle)[0]?.toUpperCase() ?? 'B';
  const deepLink    = `banza://pay?request=${code}${sandbox ? '&sandbox=1' : ''}`;

  return (
    <main className="min-h-screen bg-off-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-3xl shadow-card overflow-hidden">

          {/* Wine header */}
          <div className="bg-banzami-gradient px-6 pt-8 pb-10 flex flex-col items-center gap-3">
            <div className="h-16 w-16 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <span className="text-2xl font-bold text-white select-none">{initial}</span>
            </div>
            <div className="text-center">
              {displayName && (
                <p className="text-white font-semibold text-base">{displayName}</p>
              )}
              <p className="text-white/70 text-sm mt-0.5">@{handle}</p>
              <p className="text-white/50 text-xs mt-1">Solicitou um pagamento</p>
            </div>
            {amtDisplay && (
              <div className="mt-1 bg-white/15 rounded-xl px-5 py-2">
                <p className="text-white text-2xl font-bold tracking-tight">{amtDisplay}</p>
              </div>
            )}
          </div>

          {/* Note */}
          {link.note && (
            <div className="px-6 pt-4 pb-0">
              <p className="text-center text-sm text-gray-500 italic">{link.note}</p>
            </div>
          )}

          {/* Sandbox badge */}
          {sandbox && (
            <div className="px-6 pt-3 pb-0 flex justify-center">
              <SandboxBadge extra="Dinheiro de teste" />
            </div>
          )}

          {/* CTA */}
          <div className="px-6 py-6 flex flex-col gap-3">

            {/* ── idle: show premium button ── */}
            {openPhase === 'idle' && (
              <>
                <a
                  href={deepLink}
                  onClick={openApp}
                  style={{
                    background: 'linear-gradient(135deg, #B5101F 0%, #D7242E 55%, #E8434B 100%)',
                    boxShadow: '0 4px 20px rgba(176, 0, 32, 0.38), 0 1px 4px rgba(0, 0, 0, 0.14)',
                  }}
                  className="relative flex items-center justify-center gap-2.5 w-full h-14 text-white rounded-2xl text-base font-semibold tracking-tight overflow-hidden select-none transition-[transform,filter] duration-[120ms] ease-out hover:brightness-[1.07] active:scale-[0.985] active:brightness-90"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0) 52%)',
                    }}
                  />
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden className="relative shrink-0 opacity-[0.88]">
                    <rect x="3"  y="3"  width="7" height="7" rx="1" />
                    <rect x="14" y="3"  width="7" height="7" rx="1" />
                    <rect x="3"  y="14" width="7" height="7" rx="1" />
                    <circle cx="17.5" cy="17.5" r="2.5" />
                  </svg>
                  <span className="relative">
                    {amtDisplay ? `Pagar ${amtDisplay}` : 'Pagar com Banza'}
                  </span>
                </a>
                <p className="text-center text-xs text-gray-400 leading-relaxed">
                  Precisa de ter a app Banza instalada.
                </p>
              </>
            )}

            {/* ── opening: waiting for OS to switch to app ── */}
            {openPhase === 'opening' && (
              <div className="flex h-14 items-center justify-center gap-2.5">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-banzami border-t-transparent" />
                <span className="text-sm text-gray-400">A abrir o Banza…</span>
              </div>
            )}

            {/* ── app_opened: waiting in app, or returned to browser ── */}
            {openPhase === 'app_opened' && (
              returnedToBrowser ? (
                // User is back in the browser — show the full button again
                <a
                  href={deepLink}
                  onClick={openApp}
                  style={{
                    background: 'linear-gradient(135deg, #B5101F 0%, #D7242E 55%, #E8434B 100%)',
                    boxShadow: '0 4px 20px rgba(176, 0, 32, 0.38), 0 1px 4px rgba(0, 0, 0, 0.14)',
                  }}
                  className="relative flex items-center justify-center gap-2.5 w-full h-14 text-white rounded-2xl text-base font-semibold tracking-tight overflow-hidden select-none transition-[transform,filter] duration-[120ms] ease-out hover:brightness-[1.07] active:scale-[0.985] active:brightness-90"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0) 52%)' }}
                  />
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden className="relative shrink-0 opacity-[0.88]">
                    <rect x="3"  y="3"  width="7" height="7" rx="1" />
                    <rect x="14" y="3"  width="7" height="7" rx="1" />
                    <rect x="3"  y="14" width="7" height="7" rx="1" />
                    <circle cx="17.5" cy="17.5" r="2.5" />
                  </svg>
                  <span className="relative">
                    {amtDisplay ? `Pagar ${amtDisplay}` : 'Pagar com Banza'}
                  </span>
                </a>
              ) : (
                // App is open — show confirmation while user pays
                <div className="flex flex-col items-center gap-3 py-1">
                  <div className="flex items-center gap-1.5 text-sm text-gray-600">
                    <svg className="h-4 w-4 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24"
                      stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    O Banza foi aberto. Completa o pagamento na app.
                  </div>
                  <button
                    type="button"
                    onClick={() => { window.location.href = deepLink; openApp(); }}
                    className="text-sm font-medium text-banzami underline"
                  >
                    Abrir Banza novamente
                  </button>
                </div>
              )
            )}

            {/* ── not_installed: app never opened after 2.5 s ── */}
            {openPhase === 'not_installed' && (
              <div className="flex flex-col items-center gap-3">
                <p className="text-center text-sm text-gray-500">
                  O Banza não está instalado.
                </p>
                <button
                  type="button"
                  onClick={() => { window.location.href = deepLink; openApp(); }}
                  className="w-full rounded-2xl bg-banzami py-3 text-sm font-semibold text-white active:bg-banzami-medium"
                >
                  Tentar novamente
                </button>
              </div>
            )}

          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Pagamentos via{' '}
          <span className="font-semibold text-banzami">Banza</span>
        </p>
      </div>
    </main>
  );
}
