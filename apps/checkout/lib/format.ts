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
  const major = amountMinor / 100;
  if ((currency || 'AOA').toUpperCase() === 'AOA') {
    return `${groupThousands(Math.round(major))} Kz`;
  }
  const v = major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ' ');
  return `${v} ${currency.toUpperCase()}`;
}

export function formatCountdown(ms: number): string {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSecs / 60).toString().padStart(2, '0');
  const s = (totalSecs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
