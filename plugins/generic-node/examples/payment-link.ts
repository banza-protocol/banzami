// Run: ts-node examples/payment-link.ts

import { BanzamiClient } from '../src/client';

const client = new BanzamiClient({
  gatewayUrl: process.env.BANZAMI_GATEWAY_URL ?? 'https://api.banzami.ao',
  apiKey:     process.env.BANZAMI_API_KEY!,
});

const link = await client.createPaymentLink({
  merchant_id:  process.env.BANZAMI_MERCHANT_ID!,
  wallet_id:    process.env.BANZAMI_WALLET_ID!,
  amount_minor: 15000,
  currency:     'AOA',
  description:  `Pedido #${Date.now()}`,
});

console.log('Checkout URL:', `https://pay.banzami.ao/${link.slug}`);
console.log('Link ID:', link.id);
console.log('Status:', link.status);
