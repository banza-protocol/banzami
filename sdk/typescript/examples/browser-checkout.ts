// Run: bundle with your build tool (Vite, webpack, etc.) and include in a browser page

import { BanzamiClient, formatMinor } from '@banzami/sdk';

const client = new BanzamiClient({
  baseUrl: 'https://api.banzami.ao',
  apiKey:  '<your-publishable-api-key>',
});

// Get wallet balance (e.g. for a merchant dashboard widget)
async function loadBalance(walletId: string): Promise<void> {
  const balance = await client.getWalletBalance(walletId);
  const el = document.getElementById('balance')!;
  el.textContent = formatMinor(balance.available_minor, balance.currency);
}

// Initiate checkout — redirect to hosted checkout page
async function startCheckout(params: {
  merchantId:  string;
  walletId:    string;
  amount:      number;
  description: string;
}): Promise<void> {
  const link = await client.createPaymentLink({
    merchantId:  params.merchantId,
    walletId:    params.walletId,
    amountMinor: params.amount,
    currency:    'AOA',
    description: params.description,
  });
  window.location.href = `https://pay.banzami.ao/${link.slug}`;
}

export { loadBalance, startCheckout };
