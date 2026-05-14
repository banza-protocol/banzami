export function formatMinor(amountMinor: number | undefined | null, currency = 'AOA'): string {
  if (amountMinor == null) return '—';
  const ccy   = currency || 'AOA';
  const major = amountMinor / 100;
  if (ccy === 'AOA') {
    return `${major.toLocaleString('pt-AO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Kz`;
  }
  return new Intl.NumberFormat('pt-AO', {
    style: 'currency', currency: ccy, minimumFractionDigits: 2,
  }).format(major);
}
