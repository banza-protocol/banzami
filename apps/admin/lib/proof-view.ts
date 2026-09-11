// How BANZADMIN words a proof — the SAME words as the public verifier
// (apps/website/lib/proof-view.ts), so an operator reading a proof here and a
// customer reading it at /r/{ref} see one description of one operation. Four
// questions stay separate: what the operation was (Pagamento / Transferência),
// how it started (Link de pagamento / Código QR / Endereço @banza), where the
// money came from (Saldo Banzami). Keep in step with the website module.

import type { AdminProof } from '@/lib/admin-api';

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

/** The verdict's title, by what the operation was (the verifier's green title). */
export function confirmedTitle(kind?: string | null): string {
  switch (kind) {
    case 'PAYMENT': return 'Pagamento verificado';
    case 'P2P_TRANSFER': return 'Transferência verificada';
    default: return 'Comprovativo verificado';
  }
}

/** Proof status in Portuguese (the verifier's statusPT). */
export function proofStatusLabel(status?: string | null): string {
  switch (status) {
    case 'CONFIRMED': return 'Confirmado';
    case 'PENDING':   return 'Pendente';
    case 'REVERSED':  return 'Revertido';
    case 'FAILED':    return 'Falhado';
    case 'CANCELLED': return 'Cancelado';
    case 'EXPIRED':   return 'Expirado';
    default:          return status || '—';
  }
}

/**
 * The operation rows for the drawer: "Operação" (kind · channel) and "Fonte"
 * when the proof carries its semantics; otherwise the legacy "Método", as the
 * verifier does for a proof whose snapshot was never completed.
 */
export function operationRows(p: Pick<AdminProof, 'operation_kind' | 'channel' | 'funding_source' | 'method'>): [string, string][] {
  const op = operationLabel(p.operation_kind);
  if (!op) return [['Método', p.method || '—']];
  const ch = channelLabel(p.channel);
  const rows: [string, string][] = [['Operação', ch ? `${op} · ${ch}` : op]];
  const f = fundingLabel(p.funding_source);
  if (f) rows.push(['Fonte', f]);
  return rows;
}
