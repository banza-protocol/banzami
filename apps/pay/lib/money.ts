// Banzami Money Engine — display rule for pay.banzami.com.
//
// The same rule every Banzami web surface uses (apps/website/lib/money.ts,
// docs/architecture/money-engine.md): integer MINOR UNITS in, "50 000 Kz" out —
// thousands grouped with a space, comma decimal, currency word last, cêntimos
// shown only when present ("10,50 Kz", never "10,5 Kz"). No float arithmetic.

const AOA_SUBUNIT = 100;

function groupThousands(n: number): string {
  const s = Math.abs(Math.trunc(n)).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ' ';
    out += s[i];
  }
  return out;
}

/** 5 000 000 → "50 000 Kz" · 1 050 → "10,50 Kz" · 1 → "0,01 Kz" · 0 → "0 Kz". */
export function formatMoneyDisplay(amountMinor: number, currency = 'AOA'): string {
  const ccy = (currency || 'AOA').toUpperCase();
  const abs = Math.abs(Math.trunc(amountMinor));
  const major = Math.trunc(abs / AOA_SUBUNIT);
  const frac = abs % AOA_SUBUNIT;
  let out = groupThousands(major);
  if (frac !== 0) out += ',' + String(frac).padStart(2, '0');
  if (amountMinor < 0) out = '-' + out;
  return `${out} ${ccy === 'AOA' ? 'Kz' : ccy}`;
}

/**
 * A clock time in Angola's time zone, labelled as such: "14:05 WAT".
 *
 * A bare "Válido até às 14:05" was the payer's own browser clock, with no zone:
 * a payer abroad, or a device set to another zone, read a different deadline.
 */
export function formatWatTime(iso: string): string {
  const time = new Date(iso).toLocaleTimeString('pt-AO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Luanda',
  });
  return `${time} WAT`;
}
