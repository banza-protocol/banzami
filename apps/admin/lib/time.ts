// The product's clock: Angola, WAT (Africa/Luanda, UTC+01:00, no daylight
// saving). "Today", a date shown to an operator and a date filter all mean the
// Luanda calendar day — never the browser's zone (an operator abroad saw other
// days) and never the UTC day (00:00–01:00 WAT fell on the previous date).

export const PRODUCT_TZ = 'Africa/Luanda';
export const PRODUCT_TZ_LABEL = 'WAT';
/** WAT is a fixed UTC+01:00 — Angola observes no daylight saving. */
const WAT_OFFSET = '+01:00';

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: PRODUCT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

function toDate(value: string | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The Luanda calendar day of an instant, as "YYYY-MM-DD"; null if invalid. */
export function watDayKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = toDate(value);
  return d ? dayKeyFmt.format(d) : null;
}

/** True when the instant falls on the same Luanda calendar day as `now`. */
export function isTodayWAT(value: string | Date | null | undefined, now: Date = new Date()): boolean {
  const k = watDayKey(value);
  return k !== null && k === watDayKey(now);
}

/**
 * A date-picker day ("YYYY-MM-DD", meant as a Luanda day) → the instant its
 * first or last moment happens, as ISO UTC for a query: "2026-09-11" from →
 * "2026-09-10T23:00:00.000Z", to → "2026-09-11T22:59:59.999Z".
 */
export function watDayBoundary(day: string, edge: 'start' | 'end'): string {
  const time = edge === 'start' ? '00:00:00.000' : '23:59:59.999';
  return new Date(`${day}T${time}${WAT_OFFSET}`).toISOString();
}

/** The Luanda day a stored boundary instant belongs to — to show it back in the picker. */
export function watDayFromBoundary(iso: string | null | undefined): string {
  return watDayKey(iso ?? null) ?? '';
}
