// Banzami Admin formatting helpers (Kwanza). Global rule: space-grouped
// thousands, currency word at the END, no dot/comma, no cêntimos: "4 250 000 Kz".
// Datas DD/MM/YYYY; IDs/valores em mono.

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

/** Format minor units (cêntimos) as "4 250 000 Kz" / "4 250 000,50 Kz". */
export function formatKz(amountMinor: number | null | undefined): string {
  if (amountMinor == null) return '—';
  const abs = Math.abs(Math.trunc(amountMinor));
  const major = Math.trunc(abs / 100);
  const frac = abs % 100;
  let out = groupThousands(major);
  if (frac !== 0) out += ',' + String(frac).padStart(2, '0');
  if (amountMinor < 0) out = '-' + out;
  return `${out} Kz`;
}

/** Format a major-unit number as "4 250 000 Kz" (cêntimos when present). */
export function formatKzMajor(major: number | null | undefined): string {
  if (major == null) return '—';
  return formatKz(Math.round(major * 100));
}

/** Format an ISO timestamp / Date as DD/MM/YYYY. Returns '—' on invalid. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
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
