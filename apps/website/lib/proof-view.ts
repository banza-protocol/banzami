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

export interface ProofRow { label: string; value: string; mono?: boolean }

/** The detail rows, in order. Absent optional fields are left out, never dashed. */
export function proofRows(p: ProofResult, ref: string): ProofRow[] {
  const rows: ProofRow[] = [];
  const push = (label: string, value: string | null | undefined, mono?: boolean) => {
    if (value && value.trim()) rows.push({ label, value, mono });
  };
  push('De', partyLabel(p.payer_display, p.payer_handle) ?? '—');
  push('Para', partyLabel(p.payee_display, p.payee_handle) ?? '—');
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
