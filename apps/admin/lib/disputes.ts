// Dispute states and resolution outcomes, as Core defines them
// (core/api/src/routes/disputes.rs).
//
//   OPEN → UNDER_REVIEW → one of the terminal outcomes below.
//   Terminal: WON_BY_CONSUMER · WON_BY_MERCHANT · CLOSED — Core refuses to
//   resolve a dispute already in one of them.
//
// The outcome is a closed set, not free text: WON_BY_CONSUMER moves money
// (restitution from the merchant to the consumer, capped at what was not yet
// refunded), so a typo must not be something an operator can send.

export const DISPUTE_OUTCOMES = ['WON_BY_CONSUMER', 'WON_BY_MERCHANT', 'CLOSED'] as const;
export type DisputeOutcome = (typeof DISPUTE_OUTCOMES)[number];

// RESOLVED is not a Core state; kept so an unexpected legacy row is never
// offered a live "Resolver".
const TERMINAL = new Set<string>([...DISPUTE_OUTCOMES, 'RESOLVED']);

/** True once the dispute has an outcome — no action may be offered. */
export function isDisputeClosed(status: string | null | undefined): boolean {
  return TERMINAL.has((status ?? '').toUpperCase());
}

export const OUTCOME_LABEL: Record<DisputeOutcome, string> = {
  WON_BY_CONSUMER: 'Ganha pelo consumidor',
  WON_BY_MERCHANT: 'Ganha pelo comerciante',
  CLOSED: 'Encerrada sem decisão',
};

/** What each outcome does to money, said before the operator chooses it. */
export const OUTCOME_EFFECT: Record<DisputeOutcome, string> = {
  WON_BY_CONSUMER: 'Move dinheiro: o consumidor é restituído a partir da carteira do comerciante, até ao valor ainda não reembolsado.',
  WON_BY_MERCHANT: 'Nenhum dinheiro se move. O pagamento mantém-se com o comerciante.',
  CLOSED: 'Nenhum dinheiro se move. A disputa é encerrada sem vencedor.',
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Aberta',
  UNDER_REVIEW: 'Em análise',
  ...OUTCOME_LABEL,
  RESOLVED: 'Resolvida',
};

export function disputeStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return STATUS_LABEL[status.toUpperCase()] ?? status;
}
