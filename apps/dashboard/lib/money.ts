// Banzami money formatting — global rule: space-grouped thousands, currency word
// at the END, no dot/comma, Kwanza without cêntimos: 5 000 000 minor → "50 000 Kz".

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

export function formatMinor(amountMinor: number, currency = 'AOA'): string {
  const ccy   = (currency || 'AOA').toUpperCase();
  const major = amountMinor / 100;
  if (ccy === 'AOA') {
    return `${groupThousands(Math.round(major))} Kz`;
  }
  const v = major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ' ');
  return `${v} ${ccy}`;
}
