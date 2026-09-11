// Banzami Admin formatting helpers (Kwanza). Global rule: space-grouped
// thousands, currency word at the END, no dot/comma, no cêntimos: "4 250 000 Kz".
// Datas DD/MM/YYYY no dia de Luanda (WAT); IDs/valores em mono.

import { PRODUCT_TZ, PRODUCT_TZ_LABEL, watDayKey } from '@/lib/time';

/** Group an integer's thousands with a regular space: 4250000 → "4 250 000". */
function groupThousands(n: number): string {
  const neg = n < 0;
  const s = Math.abs(Math.trunc(n)).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ' ';
    out += s[i];
  }
  return (neg ? '-' : '') + out;
}

/** Minor units as a bare grouped number, no currency: 425000050 → "4 250 000,50". */
export function formatAmountMinor(amountMinor: number | null | undefined): string {
  if (amountMinor == null) return '—';
  const abs = Math.abs(Math.trunc(amountMinor));
  const major = Math.trunc(abs / 100);
  const frac = abs % 100;
  let out = groupThousands(major);
  if (frac !== 0) out += ',' + String(frac).padStart(2, '0');
  return amountMinor < 0 ? '-' + out : out;
}

/**
 * Minor units in their own currency, the currency written ONCE at the end:
 * AOA → "4 250 000 Kz", USD → "50 USD", EUR → "12,50 EUR". Same rule as the
 * website's formatMoneyDisplay. Callers never append the currency themselves —
 * that is how "50 Kz USD" happened. A missing currency is shown as Kz, the
 * product's default unit.
 */
export function formatMoney(amountMinor: number | null | undefined, currency?: string | null): string {
  if (amountMinor == null) return '—';
  const ccy = (currency || 'AOA').toUpperCase();
  return `${formatAmountMinor(amountMinor)} ${ccy === 'AOA' ? 'Kz' : ccy}`;
}

/** Format minor units (cêntimos) of KWANZA as "4 250 000 Kz". AOA only — for any
 *  amount that carries a currency, use formatMoney(amount, currency). */
export function formatKz(amountMinor: number | null | undefined): string {
  return formatMoney(amountMinor, 'AOA');
}

/**
 * Totals per currency — amounts in different currencies are never added.
 * Items with no amount are skipped; a missing currency counts as AOA.
 */
export function totalsByCurrency<T>(
  items: T[],
  amount: (item: T) => number | null | undefined,
  currency: (item: T) => string | null | undefined,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of items) {
    const a = amount(it);
    if (a == null) continue;
    const c = (currency(it) || 'AOA').toUpperCase();
    out.set(c, (out.get(c) ?? 0) + a);
  }
  return out;
}

/** "50 000 Kz · 12 USD" — one figure per currency, AOA first; '0 Kz' when empty. */
export function formatTotals(totals: Map<string, number>): string {
  if (totals.size === 0) return formatKz(0);
  const keys = [...totals.keys()].sort((a, b) => (a === 'AOA' ? -1 : b === 'AOA' ? 1 : a.localeCompare(b)));
  return keys.map((c) => formatMoney(totals.get(c)!, c)).join(' · ');
}

/** Format a major-unit number as "4 250 000 Kz" (cêntimos when present). */
export function formatKzMajor(major: number | null | undefined): string {
  if (major == null) return '—';
  return formatKz(Math.round(major * 100));
}

/**
 * An instant's Luanda (WAT) calendar date as DD/MM/YYYY — the same day for
 * every operator, whatever their browser's zone. '—' on invalid.
 */
export function formatDate(value: string | Date | null | undefined): string {
  const key = watDayKey(value ?? null); // "YYYY-MM-DD" in Africa/Luanda
  if (!key) return '—';
  const [yyyy, mm, dd] = key.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

const wallClockFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: PRODUCT_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/**
 * An official instant with its clock and zone said: "11/09/2026, 11:00 (WAT)"
 * — the format the PDF and the public verifier print, so a reader comparing
 * them sees the same time. '—' on invalid.
 */
export function formatDateTime(value: string | Date | null | undefined): string {
  const day = formatDate(value);
  if (day === '—') return day;
  const d = value instanceof Date ? value : new Date(value as string);
  return `${day}, ${wallClockFmt.format(d)} (${PRODUCT_TZ_LABEL})`;
}

/** Relative time in Portuguese: "agora", "há 5 min", "há 3 h", "há 2 d", else date. */
export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'agora';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days} d`;
  return formatDate(d);
}

/** SLA bucket from age in seconds (compliance cases). Color is a Tailwind class set. */
export function slaBucket(ageSeconds: number): { label: string; cls: string } {
  const h = ageSeconds / 3600;
  if (h < 1) return { label: '< 1h', cls: 'bg-green-50 text-green-700' };
  if (h < 4) return { label: '1–4h', cls: 'bg-blue-50 text-blue-700' };
  if (h < 24) return { label: '4–24h', cls: 'bg-amber-50 text-amber-700' };
  if (h < 48) return { label: '> 24h', cls: 'bg-orange-50 text-orange-700' };
  return { label: 'Vencido', cls: 'bg-red-50 text-red-700' };
}

/** First 1-2 initials from a name, uppercased. */
export function initials(name: string | null | undefined): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * A Business as receipts present it: "@handle · Public name". Either part may
 * be missing; `fallback` (e.g. a shortened id) is used only when both are.
 */
export function businessLabel(handle: string | null | undefined, name: string | null | undefined, fallback = '—'): string {
  const h = handle ? withAt(handle) : '';
  const n = (name ?? '').trim();
  if (h && n) return `${h} · ${n}`;
  return h || n || fallback;
}

/** Ensure a handle is shown as @handle. */
export function withAt(handle: string | null | undefined): string {
  if (!handle) return '—';
  return handle.startsWith('@') ? handle : `@${handle}`;
}

/** ADR-028 business account type → human label (pt). Empty ⇒ plain merchant. */
const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  MERCHANT: 'Comerciante',
  APPLICATION: 'Aplicação',
  PLATFORM: 'Plataforma',
  NGO: 'ONG',
  MARKETPLACE: 'Marketplace',
  DELIVERY: 'Delivery',
  OTHER: 'Outro',
};
export function accountTypeLabel(t: string | null | undefined): string {
  if (!t) return 'Comerciante';
  return ACCOUNT_TYPE_LABELS[t] ?? t;
}
