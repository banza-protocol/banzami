/**
 * Format an integer minor-unit amount into a display string.
 *
 * AOA uses integer kwanzas (1 kwanza = 1 minor unit).
 * All other currencies divide by 100 and format via Intl.
 *
 * @example
 *   formatMinor(50000, 'AOA') // "50.000 Kz"
 *   formatMinor(1099,  'USD') // "USD 10.99"
 */
export function formatMinor(amountMinor: number, currency = 'AOA'): string {
  if (currency === 'AOA') {
    return `${amountMinor.toLocaleString('pt-AO')} Kz`;
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
