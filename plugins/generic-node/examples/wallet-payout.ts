// Run: ts-node examples/wallet-payout.ts

import { BanzaClient } from '../src/client';

const client   = new BanzaClient({
  gatewayUrl: process.env.BANZAMI_GATEWAY_URL!,
  apiKey:     process.env.BANZAMI_API_KEY!,
});
const walletId = process.env.BANZAMI_WALLET_ID!;

const balance = await client.getWalletBalance(walletId);
console.log('Available:', BanzaClient.formatAmount(balance.available_minor, balance.currency));
console.log('Reserved: ', BanzaClient.formatAmount(balance.reserved_minor,  balance.currency));

if (balance.available_minor >= 5000) {
  const payout = await client.createPayout({
    wallet_id:                walletId,
    amount_minor:             5000,
    currency:                 'AOA',
    destination_bank_account: '0040 0000 0000 0001 010 10',
    idempotency_key:          `payout_${walletId}_${Date.now()}`,
  });
  console.log('Payout:', payout.id, '—', payout.status);
} else {
  console.log('Insufficient balance for payout (minimum 5.000 Kz required).');
}
