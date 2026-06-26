// Banzami Admin formatting helpers (PT-PT / Kwanza). README §Formatação:
// moeda "Kz" + milhares com ponto; datas DD/MM/YYYY; IDs/valores em mono.

/** Format minor units (cêntimos) as "Kz 4.250.000" (pt-PT thousands). */
export function formatKz(amountMinor: number | null | undefined): string {
  if (amountMinor == null) return '—';
  const major = amountMinor / 100;
  return `Kz ${major.toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Format a major-unit number as "Kz 4.250.000". */
export function formatKzMajor(major: number | null | undefined): string {
  if (major == null) return '—';
  return `Kz ${major.toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
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
