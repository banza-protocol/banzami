// Banzami money formatting — canonical rule for all surfaces.
//
// Group thousands with a plain SPACE, currency word at the END, never a dot or
// comma, Kwanza without cêntimos: 5 000 000 minor → "50 000 Kz". Locale-
// independent (manual grouping) so it can never render "50.000" or "50,000".

/** Group an integer's thousands with a regular space: 1250000 → "1 250 000". */
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

/** Format a WHOLE-kwanza amount (not minor units): 50000 → "50 000 Kz". */
export function formatKwanza(kwanzas: number): string {
  return `${groupThousands(kwanzas)} Kz`;
}

/**
 * Main display formatter from integer minor units (the ledger unit).
 * 5 000 000 → "50 000 Kz". Kwanza is shown without cêntimos; other currencies
 * keep 2 decimals with the currency word at the end.
 */
export function formatMoneyDisplay(amountMinor: number | null | undefined, currency = 'AOA'): string {
  if (amountMinor == null) return '—';
  const ccy = (currency || 'AOA').toUpperCase();
  const major = amountMinor / 100;
  if (ccy === 'AOA') return `${groupThousands(Math.round(major))} Kz`;
  const v = major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ' ');
  return `${v} ${ccy}`;
}

/** Parse a typed amount into a whole-kwanza integer, tolerant of space
 *  grouping: "50 000" → 50000, "1 250 000" → 1250000. Empty → 0. */
export function parseKwanzaInput(raw: string): number {
  const digits = (raw ?? '').replace(/[^0-9]/g, '');
  return digits === '' ? 0 : parseInt(digits, 10);
}

/** Format a raw typed string as a space-grouped whole number for live input
 *  display (no suffix): "50000" → "50 000". Empty stays empty. */
export function formatMoneyInput(raw: string): string {
  const digits = (raw ?? '').replace(/[^0-9]/g, '');
  if (digits === '') return '';
  return groupThousands(parseInt(digits, 10));
}
