// What an operator may do to a payout (levantamento) in each state.
//
// Mirrors Core's state machine — core/payouts/src/lib.rs PayoutStatus::
// can_transition_to — which is the authority: Core refuses any other move.
//
//   PENDING    → PROCESSING (Processar) | FAILED (Marcar falhado)
//   PROCESSING → SENT (Marcar enviado)   | FAILED
//   SENT       → CONFIRMED (Confirmar)  | RETURNED (Devolver) | FAILED
//   CONFIRMED, FAILED, RETURNED — terminal, nothing to do.
//
// The console used to offer Confirmar and Devolver on PENDING and PROCESSING,
// buttons Core always refused. Offering only what the server accepts keeps the
// operator from a dead end; it never replaces the server's own check.

import type { Payout } from '@/lib/admin-api';

export type PayoutStatus = Payout['status'];
export type PayoutAction = 'process' | 'sent' | 'confirm' | 'return' | 'fail';

const ACTIONS: Record<PayoutStatus, PayoutAction[]> = {
  PENDING:    ['process', 'fail'],
  PROCESSING: ['sent', 'fail'],
  SENT:       ['confirm', 'return', 'fail'],
  CONFIRMED:  [],
  FAILED:     [],
  RETURNED:   [],
};

/** The actions Core accepts from this status; [] for terminal or unknown. */
export function payoutActions(status: string): PayoutAction[] {
  return ACTIONS[status as PayoutStatus] ?? [];
}

export const PAYOUT_ACTION_LABEL: Record<PayoutAction, string> = {
  process: 'Processar',
  sent:    'Marcar enviado',
  confirm: 'Confirmar',
  return:  'Devolver',
  fail:    'Marcar falhado',
};
