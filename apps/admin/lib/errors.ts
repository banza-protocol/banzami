// Operator-facing error text, in Portuguese, by what kind of failure it was.
//
// A catch-all "Não foi possível…" hides whether the operator should fix the
// form, ask for a permission, reload, or wait; a raw server message puts
// English ("invalid pricing configuration: …") in a Portuguese console. So a
// failed action says what it tried and, per status class, what happened.

import { AdminApiError } from '@/lib/admin-api';

/** The reason part only: what kind of failure this was, in Portuguese. */
export function failureReasonPt(err: unknown): string {
  if (!(err instanceof AdminApiError)) {
    // fetch() rejects with a TypeError when the network or the service is down.
    return 'Sem ligação ao serviço — verifique a ligação e tente novamente.';
  }
  const s = err.status;
  if (s === 401) return 'A sessão expirou — entre novamente.';
  if (s === 403) return 'Não tem permissão para esta ação.';
  if (s === 404) return 'Já não existe ou foi alterado entretanto — recarregue a página.';
  if (s === 409) return 'Entra em conflito com o estado atual — recarregue e tente novamente.';
  if (s === 429) return 'Demasiados pedidos — aguarde um momento e tente novamente.';
  if (s >= 500) return 'Serviço temporariamente indisponível — tente novamente dentro de momentos.';
  if (s >= 400) return 'O pedido foi recusado — verifique os dados.';
  return 'Ocorreu um erro inesperado.';
}

/** "<what failed>. <why>" — e.g. "Não foi possível guardar a regra. Não tem permissão para esta ação." */
export function actionErrorPt(err: unknown, what: string): string {
  return `${what} ${failureReasonPt(err)}`;
}
