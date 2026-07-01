// Banzami Money Engine (TypeScript) — canonical rule for all web surfaces.
//
// UI shows human money ("50 000,50 Kz"); storage/APIs use integer MINOR UNITS
// (cêntimos). No float arithmetic for money. Group thousands with a SPACE,
// decimal separator is a comma, currency word at the END, cêntimos shown only
// when present. See docs/architecture/money-engine.md.

const AOA_SCALE = 2;
const AOA_SUBUNIT = 100;

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
 * Main display formatter from integer minor units: 5 000 050 → "50 000,50 Kz",
 * 5 000 000 → "50 000 Kz", 1 → "0,01 Kz", 0 → "0 Kz".
 */
export function formatMoneyDisplay(amountMinor: number | null | undefined, currency = 'AOA'): string {
  if (amountMinor == null) return '—';
  const ccy = (currency || 'AOA').toUpperCase();
  const abs = Math.abs(Math.trunc(amountMinor));
  const major = Math.trunc(abs / AOA_SUBUNIT);
  const frac = abs % AOA_SUBUNIT;
  let out = groupThousands(major);
  if (frac !== 0) out += ',' + String(frac).padStart(AOA_SCALE, '0');
  if (amountMinor < 0) out = '-' + out;
  const sym = ccy === 'AOA' ? 'Kz' : ccy;
  return `${out} ${sym}`;
}

/**
 * Parse human input into integer MINOR UNITS, or throw. Space thousands, a
 * single comma decimal with ≤2 places, no dot decimal, no negatives.
 *   "50000" → 5000000 · "50 000,50" → 5000050 · "0,01" → 1
 */
export function parseMoneyInput(input: string, _currency = 'AOA'): number {
  let s = (input ?? '').trim().replace(/Kz/gi, '').replace(/\s/g, '');
  if (s === '') throw new Error('Indique um valor.');
  if (s.startsWith('-')) throw new Error('Valor não pode ser negativo.');
  if (s.includes('.')) throw new Error('Use vírgula para os cêntimos.');
  const parts = s.split(',');
  if (parts.length > 2) throw new Error('Use apenas uma vírgula.');
  const intPart = parts[0] === '' ? '0' : parts[0];
  const fracPart = parts.length === 2 ? parts[1] : '';
  if (!/^\d+$/.test(intPart)) throw new Error('Valor inválido.');
  if (parts.length === 2 && fracPart === '') throw new Error('Cêntimos em falta.');
  if (fracPart !== '' && !/^\d+$/.test(fracPart)) throw new Error('Cêntimos inválidos.');
  if (fracPart.length > AOA_SCALE) throw new Error('Máximo 2 casas decimais.');
  const fracPadded = fracPart.padEnd(AOA_SCALE, '0');
  return parseInt(intPart, 10) * AOA_SUBUNIT + (fracPadded === '' ? 0 : parseInt(fracPadded, 10));
}

/** Non-throwing parse — returns null on invalid. */
export function tryParseMoneyInput(input: string, currency = 'AOA'): number | null {
  try {
    return parseMoneyInput(input, currency);
  } catch {
    return null;
  }
}

/** Parse to a whole-kwanza integer, tolerant of space grouping (no cêntimos). */
export function parseKwanzaInput(raw: string): number {
  const digits = (raw ?? '').split(',')[0].replace(/[^0-9]/g, '');
  return digits === '' ? 0 : parseInt(digits, 10);
}

/** Format a raw typed string for live input display: keeps a single comma with
 *  ≤2 decimals and groups the integer with spaces. "50000,5" → "50 000,5". */
export function formatMoneyInput(raw: string): string {
  const cleaned = (raw ?? '').replace(/[^0-9,]/g, '');
  const ci = cleaned.indexOf(',');
  if (ci < 0) return cleaned === '' ? '' : groupThousands(parseInt(cleaned, 10));
  const intPart = cleaned.slice(0, ci).replace(/,/g, '');
  let fracPart = cleaned.slice(ci + 1).replace(/,/g, '');
  if (fracPart.length > AOA_SCALE) fracPart = fracPart.slice(0, AOA_SCALE);
  const intGrouped = intPart === '' ? '0' : groupThousands(parseInt(intPart, 10));
  return `${intGrouped},${fracPart}`;
}

/** Split total minor units across `people`, remainder distributed; sum == total. */
export function splitEvenlyMinor(totalMinor: number, people: number): number[] {
  if (people <= 0) throw new Error('Número de participantes inválido.');
  const base = Math.trunc(totalMinor / people);
  const remainder = totalMinor % people;
  return Array.from({ length: people }, (_, i) => base + (i < remainder ? 1 : 0));
}
