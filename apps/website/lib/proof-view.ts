// The public verifier's presentation of a proof — pure, so it is tested.
//
// Every value comes from the operator's proof (the same canonical receipt the
// PDF and the phone show); this only chooses words. Four questions stay
// separate: what the operation was (Pagamento / Transferência), how it started
// (Link de pagamento / Código QR / Endereço @banza), where the money came from
// (Saldo Banzami), and where it moved (the BANZA network). "@banza" is how
// people are addressed — never a method — and a payment is never "liquidação".
import type { ProofResult } from './api';

export function operationLabel(kind?: string | null): string | null {
  switch (kind) {
    case 'PAYMENT': return 'Pagamento';
    case 'P2P_TRANSFER': return 'Transferência';
    default: return null;
  }
}

export function channelLabel(ch?: string | null): string | null {
  switch (ch) {
    case 'PAYMENT_LINK': return 'Link de pagamento';
    case 'QR': return 'Código QR Banzami';
    case 'HANDLE': return 'Endereço @banza';
    default: return null;
  }
}

export function fundingLabel(f?: string | null): string | null {
  return f === 'BANZAMI_BALANCE' ? 'Saldo Banzami' : null;
}

/** The green verdict's title, by what the operation was. */
export function confirmedTitle(kind?: string | null): string {
  switch (kind) {
    case 'PAYMENT': return 'Pagamento verificado';
    case 'P2P_TRANSFER': return 'Transferência verificada';
    default: return 'Comprovativo verificado';
  }
}

/** An instant in Luanda time, and saying so: "10/09/2026, 20:13 (WAT)". The
 *  PDF prints the same clock; a reader comparing them sees the same time. */
export function fmtWAT(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const s = d.toLocaleString('pt-PT', {
    timeZone: 'Africa/Luanda', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return `${s} (WAT)`;
}

/** "Doa · @doa", "@fm65", or null. */
export function partyLabel(display?: string | null, handle?: string | null): string | null {
  const h = handle ? `@${handle}` : '';
  if (display && h) return `${display} · ${h}`;
  return display || h || null;
}

/** "@doa"; a Business without a handle falls back to its name. */
export function payeeLabel(display?: string | null, handle?: string | null): string | null {
  if (handle) return `@${handle}`;
  return display || null;
}

/**
 * The states in which the verifier did NOT reach a conclusion about the proof.
 * None of them is an answer about the receipt, so none may become a 404 (or a
 * "forged"): they are about us, not about the document in the reader's hand.
 */
const INCONCLUSIVE: Record<string, number> = {
  // Our verifier is unreachable, erroring, or answering something unreadable.
  UNAVAILABLE: 503,
  ERROR: 503,
  // We refused to answer THIS reader for now. The receipt is not in question.
  RATE_LIMITED: 429,
};

/**
 * The HTTP status the public verifier answers a reference with — the single
 * decision, made once, from one lookup.
 *
 *   200  the verifier answered about a proof that exists (confirmed, pending,
 *        reversed — the verdict is the page's, the status is only "we answered")
 *   404  the verifier answered definitively that there is no such proof, or the
 *        reference is not spelled as one
 *   503  our verification backend could not be reached or could not be read
 *   429  we declined to verify for this reader right now
 *
 * An outage must not be indistinguishable from a verdict: a 200 saying
 * "indisponível" tells a crawler, a monitor and an integrator's HTTP client
 * that we answered, when we did not.
 */
export function proofHttpStatus(p: Pick<ProofResult, 'exists' | 'status'>): number {
  if (p.exists) return 200;
  return INCONCLUSIVE[p.status] ?? 404;
}

/**
 * Whether the verifier's answer is that this proof definitively does not exist
 * — a malformed reference, or a 404 from the verifier. Only then does the page
 * answer HTTP 404. An unavailable, rate-limited or erroring verifier is not an
 * answer about the proof at all.
 */
export function proofDefinitivelyAbsent(p: Pick<ProofResult, 'exists' | 'status'>): boolean {
  return proofHttpStatus(p) === 404;
}

export interface ProofRow { label: string; value: string; mono?: boolean }

/** The detail rows, in order. Absent optional fields are left out, never dashed. */
export function proofRows(p: ProofResult, ref: string): ProofRow[] {
  const rows: ProofRow[] = [];
  const push = (label: string, value: string | null | undefined, mono?: boolean) => {
    if (value && value.trim()) rows.push({ label, value, mono });
  };
  push('De', partyLabel(p.payer_display, p.payer_handle) ?? '—');
  // A payee is named at its @handle — a Business is paid at its public address.
  push('Para', payeeLabel(p.payee_display, p.payee_handle) ?? '—');
  push('Referência', ref, true);
  const op = operationLabel(p.operation_kind);
  if (op) {
    const ch = channelLabel(p.channel);
    push('Operação', ch ? `${op} · ${ch}` : op);
    push('Fonte', fundingLabel(p.funding_source));
  } else {
    push('Método', p.method); // a legacy proof, until its snapshot is completed
  }
  push('Referência do comerciante', p.merchant_reference, true);
  push('Finalidade', p.display_context);
  push('Descrição', p.description);
  push('Confirmado em', fmtWAT(p.confirmed_at));
  return rows;
}
