'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { developerApi, ApiError, type DeveloperTransaction } from '@/lib/developer-api';
import { useDeveloperData } from './DeveloperData';
import { useToast } from './Toast';
import { Card } from './ui';
import { formatMoneyDisplay, formatMoneyInput, tryParseMoneyInput } from '@/lib/money';
import { merchantReference } from '@/lib/transaction-reference';

const mono = "'JetBrains Mono', ui-monospace, monospace";

// The canonical Money Engine; an amount the Console does not know is not a figure.
const money = (minor: number | null, currency: string) =>
  minor === null || minor === undefined ? 'Não indicado' : formatMoneyDisplay(minor, currency);

/**
 * What this payment actually received, in minor units — the refund ceiling.
 *
 * Not the requested amount. An externally acquired payment reports what arrived
 * (acquiring.amount_minor); a session paid in full reports its own amount. An
 * open-amount session paid from a wallet has no received figure here, so there
 * is no ceiling to apply client-side — the server still enforces the real one.
 */
export function receivedMinor(p: DeveloperTransaction): number | null {
  if (p.acquiring?.state === 'PAID' && p.acquiring.amount_minor != null) return p.acquiring.amount_minor;
  if (p.amount_minor != null && p.amount_minor > 0) return p.amount_minor;
  return null;
}

/** Minor units as the amount field shows them: 10 050 → "100,50", 300 000 → "3 000". */
export function minorToInput(minor: number): string {
  const major = Math.trunc(minor / 100);
  const frac = minor % 100;
  return formatMoneyInput(frac === 0 ? String(major) : `${major},${String(frac).padStart(2, '0')}`);
}
const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';

/** A refund key is minted once per dialog and reused by every attempt within it.
 *  crypto.randomUUID is present in every browser this Console supports; the
 *  fallback exists so a page that renders without it does not silently send an
 *  empty key, which the server rejects. */
function newIdempotencyKey(): string {
  try {
    return `console-refund-${crypto.randomUUID()}`;
  } catch {
    return `console-refund-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

// Core's own refusals, in the words a person can act on. Anything not listed
// falls through to the server's message rather than to a generic failure: the
// reason a refund did not happen is the whole point of showing it.
const REJECTION: Record<string, string> = {
  IDEMPOTENCY_KEY_CONFLICT:
    'Já existe um reembolso com esta chave para este pagamento. O reembolso anterior manteve-se; nada foi cobrado duas vezes.',
  REFUND_CEILING_EXCEEDED:
    'O montante ultrapassa o que ainda pode ser devolvido deste pagamento.',
  INSUFFICIENT_FUNDS:
    'A conta que recebeu este pagamento não tem saldo suficiente para devolver este montante.',
  NOT_REFUNDABLE:
    'Este pagamento ainda não foi pago, por isso não há nada a devolver.',
  REFUNDS_NOT_CONFIGURED:
    'Os reembolsos não estão configurados nesta instalação.',
  FORBIDDEN: 'O seu papel neste workspace não permite reembolsar.',
  NOT_FOUND: 'Este pagamento não existe neste projeto.',
};

type Phase = { k: 'form' } | { k: 'sending' } | { k: 'error'; message: string } | { k: 'done'; id: string; amount: number; currency: string };

/**
 * Reembolsar — the Console's only financial write.
 *
 * The amount is typed in kwanzas and defaults to the full payment, because a
 * full refund is what is asked for most and a partial one should be a deliberate
 * edit rather than the thing you get by mistyping. A reason is required: a
 * refund with no recorded reason is the one a colleague cannot explain later.
 *
 * The idempotency key belongs to this dialog, not to the attempt. Pressing
 * Reembolsar twice on a slow connection sends the same key and cannot become two
 * refunds; a second, deliberate partial refund is a new dialog and a new key.
 */
export function RefundDialog({
  payment,
  onClose,
  onRefunded,
}: {
  payment: DeveloperTransaction;
  onClose: () => void;
  onRefunded: () => void;
}) {
  const { activeProject, csrf } = useDeveloperData();
  const { flash } = useToast();

  // Minted once, when the dialog mounts.
  const idempotencyKey = useMemo(newIdempotencyKey, []);

  // The ceiling is what was received, to the cêntimo. The default is exactly that
  // figure: rounding it to whole kwanzas made 100,50 Kz default to "101" (over
  // the ceiling) and 100,49 Kz default to "100" (a silent partial refund).
  const received = receivedMinor(payment);
  const [amount, setAmount] = useState(received !== null ? minorToInput(received) : '');
  const [reason, setReason] = useState('');
  const [phase, setPhase] = useState<Phase>({ k: 'form' });
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => { firstField.current?.focus(); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase.k !== 'sending') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, phase.k]);

  // Parsed by the Money Engine: "100,50" is 10 050 minor, "1 000" is 100 000.
  // Number(x) * 100 read "100,50" as NaN and "1.000" as one kwanza.
  const parsed = tryParseMoneyInput(amount);
  const minor = parsed ?? 0;
  const amountValid = parsed !== null && minor > 0 && (received === null || minor <= received);
  const reasonValid = reason.trim().length >= 3;
  const canSubmit = amountValid && reasonValid && phase.k !== 'sending';

  async function submit() {
    if (!activeProject || !canSubmit) return;
    setPhase({ k: 'sending' });
    try {
      const r = await developerApi.refundPayment(
        activeProject.id,
        payment.id,
        { amount_minor: minor, reason: reason.trim(), idempotency_key: idempotencyKey },
        csrf,
      );
      setPhase({ k: 'done', id: r.id, amount: r.amount_minor, currency: r.currency });
      flash(`Reembolso de ${money(r.amount_minor, r.currency)} registado`);
      onRefunded();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'UNAVAILABLE';
      const serverMessage = e instanceof ApiError ? e.message : '';
      setPhase({
        k: 'error',
        message: REJECTION[code] ?? serverMessage ?? 'Não foi possível reembolsar. Tente novamente.',
      });
    }
  }

  const label = { display: 'block', fontSize: 12, fontWeight: 800, color: '#6a5a5e', marginBottom: 6 } as const;
  const input = {
    width: '100%', padding: '10px 12px', border: '1.5px solid #EBDBD9', borderRadius: 10,
    fontSize: 14, fontWeight: 700, background: '#fff', color: '#2A1E20',
  } as const;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reembolsar pagamento"
      style={{
        position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(42,32,36,.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <Card style={{ maxWidth: 520, width: '100%', padding: 26 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 900 }}>Reembolsar pagamento</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13.5, lineHeight: 1.55, color: '#8a7a7e', fontWeight: 600 }}>
          O dinheiro sai da conta que recebeu este pagamento e volta para quem pagou. A operação
          fica registada e não pode ser anulada.
        </p>

        <div style={{ background: '#FDFAFA', border: '1px solid #F2E6E4', borderRadius: 12, padding: '12px 14px', marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
            <span style={{ color: '#8a7a7e', fontWeight: 700 }}>Pagamento</span>
            <span style={{ fontFamily: mono, fontSize: 12, color: '#5a4a4e', wordBreak: 'break-all', textAlign: 'right' }}>
              {merchantReference(payment) ?? '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, marginTop: 6 }}>
            <span style={{ color: '#8a7a7e', fontWeight: 700 }}>Montante recebido</span>
            <span style={{ fontWeight: 800 }}>{money(received, payment.currency)}</span>
          </div>
        </div>

        {phase.k === 'done' ? (
          <>
            <p style={{ margin: '0 0 6px', fontSize: 14.5, fontWeight: 800 }}>
              Reembolso de {money(phase.amount, phase.currency)} registado.
            </p>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: '#8a7a7e', fontWeight: 600, fontFamily: mono, wordBreak: 'break-all' }}>
              {phase.id}
            </p>
            <button
              onClick={onClose}
              style={{ padding: '11px 20px', border: 'none', borderRadius: 11, background: ctaGradient, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}
            >
              Fechar
            </button>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="refund-amount" style={label}>Montante a devolver (Kz)</label>
              <input
                id="refund-amount"
                ref={firstField}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
                aria-describedby="refund-amount-help"
                style={input}
              />
              <p id="refund-amount-help" style={{ margin: '6px 0 0', fontSize: 12, color: '#8a7a7e', fontWeight: 600 }}>
                {received !== null
                  ? `Pode devolver a totalidade ou uma parte, até ${money(received, payment.currency)}. Use vírgula para os cêntimos.`
                  : 'Este pagamento foi aberto sem montante fixo — indique quanto devolver. O limite é o que foi recebido.'}
              </p>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label htmlFor="refund-reason" style={label}>Motivo</label>
              <input
                id="refund-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex.: pagamento duplicado"
                aria-describedby="refund-reason-help"
                style={input}
              />
              <p id="refund-reason-help" style={{ margin: '6px 0 0', fontSize: 12, color: '#8a7a7e', fontWeight: 600 }}>
                Fica guardado com o reembolso. É o que explica a operação a quem a ler depois.
              </p>
            </div>

            {phase.k === 'error' && (
              <p role="alert" style={{ margin: '0 0 14px', fontSize: 13.5, color: '#B5101F', fontWeight: 700, lineHeight: 1.5 }}>
                {phase.message}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => void submit()}
                disabled={!canSubmit}
                style={{
                  padding: '11px 20px', border: 'none', borderRadius: 11,
                  background: canSubmit ? ctaGradient : '#E7D9D7',
                  color: canSubmit ? '#fff' : '#a89a9e',
                  fontSize: 14, fontWeight: 800, cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
              >
                {phase.k === 'sending' ? 'A reembolsar…' : 'Reembolsar'}
              </button>
              <button
                onClick={onClose}
                disabled={phase.k === 'sending'}
                style={{ padding: '11px 20px', border: '1.5px solid #EBDBD9', borderRadius: 11, background: '#fff', fontSize: 14, fontWeight: 800, color: '#6a5a5e', cursor: phase.k === 'sending' ? 'wait' : 'pointer' }}
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
