'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { developerApi, ApiError, type DeveloperTransaction } from '@/lib/developer-api';
import { useDeveloperData } from './DeveloperData';
import { useToast } from './Toast';
import { Card } from './ui';
import { formatMoneyDisplay } from '@/lib/money';

const mono = "'JetBrains Mono', ui-monospace, monospace";

// The canonical Money Engine; an open-amount session has no figure to show.
const money = (minor: number | null, currency: string) =>
  minor === null || minor === undefined ? 'Em aberto' : formatMoneyDisplay(minor, currency);
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

  const full = payment.amount_minor ?? 0;
  const [amount, setAmount] = useState(full > 0 ? String(Math.round(full / 100)) : '');
  const [reason, setReason] = useState('');
  const [phase, setPhase] = useState<Phase>({ k: 'form' });
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => { firstField.current?.focus(); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase.k !== 'sending') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, phase.k]);

  const minor = Math.round(Number(amount.replace(/\s/g, '')) * 100);
  const amountValid = Number.isFinite(minor) && minor > 0 && (full === 0 || minor <= full);
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
              {payment.reference_id || payment.id}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, marginTop: 6 }}>
            <span style={{ color: '#8a7a7e', fontWeight: 700 }}>Montante recebido</span>
            <span style={{ fontWeight: 800 }}>{money(payment.amount_minor, payment.currency)}</span>
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
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-describedby="refund-amount-help"
                style={input}
              />
              <p id="refund-amount-help" style={{ margin: '6px 0 0', fontSize: 12, color: '#8a7a7e', fontWeight: 600 }}>
                {full > 0
                  ? `Pode devolver a totalidade ou uma parte, até ${money(full, payment.currency)}.`
                  : 'Este pagamento foi aberto sem montante fixo — indique quanto devolver.'}
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
