export function formatMinor(amountMinor: number, currency = 'AOA'): string {
  const major = amountMinor / 100;
  if (currency === 'AOA') {
    return `${major.toLocaleString('pt-AO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Kz`;
  }
  return new Intl.NumberFormat('pt-AO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(major);
}
