// Operator attention — presentation only.
//
// What counts as "waiting for an operator" is decided by the server
// (GET /admin/v1/attention-summary; api-gateway service/attention.go). This
// module never decides that: it only formats the server's counts for the
// sidebar, and tells a view which states the server counted so the page can
// show the same set. docs/admin/OPERATOR_ATTENTION.md is the full contract.

/** The categories the server may return. A key the server omits (the
 *  operator's role cannot open that page, or it failed) shows no badge. */
export type AttentionKey =
  | 'inbox'
  | 'business_applications'
  | 'kyb_documents'
  | 'kyc_documents'
  | 'settlements'
  | 'payouts'
  | 'reconciliation'
  | 'disputes'
  | 'risk_flags'
  | 'application_settlements';

export const ATTENTION_KEYS: readonly AttentionKey[] = [
  'inbox', 'business_applications', 'kyb_documents', 'kyc_documents', 'settlements',
  'payouts', 'reconciliation', 'disputes', 'risk_flags', 'application_settlements',
];

export interface AttentionCategory {
  count: number;
  /** Where the rule is a set of states: those states, for the page's filter. */
  states?: string[];
}

export interface AttentionSummary {
  environment: 'LIVE' | 'SANDBOX';
  generated_at: string;
  total: number;
  categories: Partial<Record<AttentionKey, AttentionCategory>>;
  unread_notifications?: number;
}

/** Badge text: nothing at 0 (or anything that is not a positive integer),
 *  the number up to 99, then "99+". */
export function badgeText(n: number | null | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  const whole = Math.floor(n);
  return whole > 99 ? '99+' : String(whole);
}

/** "1 item requer atenção" / "4 itens requerem atenção" — the tooltip. */
export function attentionPhrase(n: number): string {
  return n === 1 ? '1 item requer atenção' : `${n} itens requerem atenção`;
}

/** The link's accessible name: "Candidaturas, 4 itens requerem atenção".
 *  The number is in words for screen readers, never colour alone. */
export function attentionLabel(label: string, n: number | null | undefined): string {
  return badgeText(n) === null ? label : `${label}, ${attentionPhrase(Math.floor(n as number))}`;
}

/** How long a last-known summary may stand in for a failed refresh before the
 *  badges disappear. Past it, no badge at all — never a zero. */
export const ATTENTION_STALE_AFTER_MS = 2 * 60_000;

/** Poll interval while the console is open and visible. */
export const ATTENTION_POLL_MS = 30_000;

/** The summary to show given the last good one and when it was fetched. */
export function usableSummary(
  last: AttentionSummary | null,
  fetchedAt: number | null,
  now: number,
  environment: string,
): AttentionSummary | null {
  if (!last || fetchedAt === null) return null;
  if (last.environment !== environment) return null; // never another environment's counts
  if (now - fetchedAt > ATTENTION_STALE_AFTER_MS) return null;
  return last;
}

/** Count for a nav item: null when the server did not return the category. */
export function countFor(s: AttentionSummary | null, key: AttentionKey | undefined): number | null {
  if (!s || !key) return null;
  const c = s.categories[key];
  return c && typeof c.count === 'number' ? c.count : null;
}

/** The link a badge opens: the page's "Requer atenção" view when there is
 *  something waiting, otherwise the page as it is. */
export function attentionHref(href: string, n: number | null): string {
  return badgeText(n) === null ? href : `${href}?attention=1`;
}

/** Keep the rows whose state the server counted. Without states (the server
 *  did not return the category) nothing is filtered out. */
export function filterByStates<T>(rows: T[], states: string[] | undefined, stateOf: (row: T) => string): T[] {
  if (!states || states.length === 0) return rows;
  const set = new Set(states.map((s) => s.toUpperCase()));
  return rows.filter((r) => set.has(String(stateOf(r) ?? '').toUpperCase()));
}
