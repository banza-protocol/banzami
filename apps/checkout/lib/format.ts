// Banzami global rule: space-grouped thousands, currency word at the END, no
// dot/comma, Kwanza without cêntimos: 5 000 000 minor → "50 000 Kz".
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

export function formatAmount(amountMinor: number, currency: string): string {
  const ccy = (currency || 'AOA').toUpperCase();
  // Integer minor units → "50 000,50 Kz" (cêntimos only when present).
  const abs = Math.abs(Math.trunc(amountMinor));
  const major = Math.trunc(abs / 100);
  const frac = abs % 100;
  let out = groupThousands(major);
  if (frac !== 0) out += ',' + String(frac).padStart(2, '0');
  if (amountMinor < 0) out = '-' + out;
  return `${out} ${ccy === 'AOA' ? 'Kz' : ccy}`;
}

export function formatCountdown(ms: number): string {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSecs / 60).toString().padStart(2, '0');
  const s = (totalSecs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
