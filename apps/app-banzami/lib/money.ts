// Canonical Banzami money format — "50 000 Kz": a regular space as the thousands
// separator, the "Kz" suffix last, no cents (project money-format standard,
// shared with the native app and the website's MoneyAmount). Amounts are AOA
// minor units (÷100).

export function formatKz(amountMinor: number, opts: { withSuffix?: boolean } = {}): string {
  const withSuffix = opts.withSuffix ?? true;
  const major = Math.round(amountMinor / 100);
  const grouped = major
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' '); // non-breaking space groups
  return withSuffix ? `${grouped} Kz` : grouped;
}
