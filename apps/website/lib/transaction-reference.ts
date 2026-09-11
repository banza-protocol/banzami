import type { DeveloperTransaction } from './developer-api';

/**
 * The reference a Console row shows for an operation: the reference the
 * merchant gave it, or nothing.
 *
 * The column used to fall back to `reference_id || id`. For a payment with no
 * reference that printed the Payment Session's internal UUID; for a refund the
 * row's reference IS the refunded payment's id (source_id); for a transfer
 * between accounts it is the source wallet account's id. None of those is a
 * reference a merchant gave or can recognise — they are operator identifiers,
 * and a reference column must never show one.
 *
 * Only a payment carries a merchant reference (the Payment Session's
 * reference_type / reference_id, set by the integrator). Everything else shows
 * "—".
 */
export function merchantReference(t: Pick<DeveloperTransaction, 'type' | 'reference_id'>): string | null {
  if (t.type !== 'payment') return null;
  const ref = (t.reference_id ?? '').trim();
  return ref === '' ? null : ref;
}
