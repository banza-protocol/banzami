// Portuguese words for the operator's status codes, where a person reads them.
//
// The Console and the verifier printed the codes themselves — "Verificação:
// UNDER_REVIEW", "PRIMARY", "ACTIVE", "Estado: FAILED". A code is for a program;
// a person is shown a word. Unknown codes are never passed through raw either:
// they read as not yet known rather than as an English token.

const KYB: Record<string, string> = {
  PENDING: 'pendente',
  UNDER_REVIEW: 'em análise',
  APPROVED: 'aprovada',
  REJECTED: 'recusada',
  SUSPENDED: 'suspensa',
};

/** A Business's KYB verification, lower-case to follow "Verificação:". */
export function kybStatusLabel(status: string | null | undefined): string {
  if (!status) return 'pendente';
  return KYB[status.toUpperCase()] ?? 'por confirmar';
}

const ACCOUNT_STATUS: Record<string, string> = {
  ACTIVE: 'Activa',
  SUSPENDED: 'Suspensa',
  FROZEN: 'Congelada',
  CLOSED: 'Encerrada',
  ARCHIVED: 'Arquivada',
  PENDING: 'Pendente',
};

/** A wallet or wallet account's status. */
export function accountStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return ACCOUNT_STATUS[status.toUpperCase()] ?? 'Por confirmar';
}

const PURPOSE: Record<string, string> = {
  PRIMARY: 'Principal',
  CAMPAIGN: 'Campanha',
  STORE: 'Loja',
  PROJECT: 'Projeto',
  EVENT: 'Evento',
  CUSTOM: 'Outro',
};

/** What a wallet account is for. */
export function accountPurposeLabel(purpose: string | null | undefined): string {
  if (!purpose) return '—';
  return PURPOSE[purpose.toUpperCase()] ?? 'Outro';
}

const PROOF_STATUS: Record<string, string> = {
  CONFIRMED: 'Confirmado',
  COMPLETED: 'Concluído',
  SETTLED: 'Liquidado',
  PENDING: 'Pendente',
  PROCESSING: 'Em processamento',
  FAILED: 'Falhado',
  REVERSED: 'Revertido',
  REFUNDED: 'Reembolsado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado',
};

/** The state of the operation a proof covers, as the verifier states it. */
export function proofStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Desconhecido';
  return PROOF_STATUS[status.toUpperCase()] ?? 'Desconhecido';
}
