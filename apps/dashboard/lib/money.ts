export function formatMinor(amountMinor: number, currency = 'AOA'): string {
  if (currency === 'AOA') {
    return `${amountMinor.toLocaleString('pt-AO')} Kz`;
  }
  return new Intl.NumberFormat('pt-AO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amountMinor / 100);
}
