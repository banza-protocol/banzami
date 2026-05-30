// Run: ts-node examples/payment-link.ts

import { BanzaClient } from '../src/client';

const client = new BanzaClient({
  gatewayUrl: process.env.BANZAMI_GATEWAY_URL ?? 'https://api.banzami.com',
  apiKey:     process.env.BANZAMI_API_KEY!,
});

const link = await client.createPaymentLink({
  merchant_id:  process.env.BANZAMI_MERCHANT_ID!,
  wallet_id:    process.env.BANZAMI_WALLET_ID!,
  amount_minor: 15000,
  currency:     'AOA',
  description:  `Pedido #${Date.now()}`,
});

console.log('Checkout URL:', `https://pay.banzami.com/${link.slug}`);
console.log('Link ID:', link.id);
console.log('Status:', link.status);
