/**
 * Format an integer minor-unit amount into a display string.
 *
 * AOA minor units are cêntimos: 1 Kz = 100 minor units, as in the ledger
 * (core/types currency.rs) and every Banzami surface (docs/architecture/
 * money-engine.md). The display follows the Money Engine rule: thousands
 * grouped with a space, comma decimal, "Kz" last, cêntimos only when present.
 * Integer arithmetic only. Other currencies divide by 100 and format via Intl.
 *
 * Before this was fixed the helper treated 1 minor unit as 1 Kz, so it printed
 * amounts 100 times too large (5 000 000 minor = 50 000 Kz showed as
 * "5.000.000 Kz").
 *
 * @example
 *   formatMinor(5_000_000, 'AOA') // "50 000 Kz"
 *   formatMinor(5_000_050, 'AOA') // "50 000,50 Kz"
 *   formatMinor(1099,      'USD') // "USD 10.99"
 */
export function formatMinor(amountMinor: number, currency = 'AOA'): string {
  if (currency === 'AOA') {
    const abs = Math.abs(Math.trunc(amountMinor));
    const major = Math.trunc(abs / 100).toString();
    const frac = abs % 100;
    let grouped = '';
    for (let i = 0; i < major.length; i++) {
      if (i > 0 && (major.length - i) % 3 === 0) grouped += ' ';
      grouped += major[i];
    }
    if (frac !== 0) grouped += ',' + String(frac).padStart(2, '0');
    return `${amountMinor < 0 ? '-' : ''}${grouped} Kz`;
  }
  return new Intl.NumberFormat('pt-AO', {
    style:                 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amountMinor / 100);
}

/**
 * Add two minor-unit amounts. Both must be the same currency.
 * Never use floating-point arithmetic for money.
 */
export function addMinor(a: number, b: number): number {
  return a + b;
}

/**
 * Subtract b from a in minor units.
 */
export function subtractMinor(a: number, b: number): number {
  return a - b;
}
