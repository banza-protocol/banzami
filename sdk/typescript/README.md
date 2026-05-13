# @banzami/sdk

Official JavaScript/TypeScript SDK for the Banzami payment platform.

Requires Node.js ≥ 18 (native `fetch`) or a browser environment.  
All monetary values use **integer minor units** — no floating-point arithmetic.

---

## Installation

```bash
npm install @banzami/sdk
```

---

## Quick start

```typescript
import { BanzamiClient } from '@banzami/sdk';

const client = new BanzamiClient({
  baseUrl: 'https://api.banzami.ao',
  apiKey:  'bz_live_...',
});
```

---

## Consumer flows

### Create a consumer and provision a wallet

```typescript
const consumer = await client.createConsumer('joao_silva', 'João Silva');
const wallet   = await client.getOrCreateConsumerWallet(consumer.id);

const balance  = await client.getConsumerWalletBalance(wallet.id);
console.log(balance.available_minor); // e.g. 25000 (Kz)
```

### Look up a consumer by handle

```typescript
const consumer = await client.getConsumerByHandle('joao_silva');
if (consumer.status !== 'ACTIVE') {
  throw new Error('Consumer is not active');
}
```

---

## P2P transfers

```typescript
import { BanzamiClient, BanzamiApiError, formatMinor } from '@banzami/sdk';

const transfer = await client.sendTransfer({
  senderId:    'cns_sender_id',
  recipientId: 'cns_recipient_id',
  amountMinor: 5000,       // 5 000 Kz
  description: 'Almoço',
});

console.log(`Sent ${formatMinor(transfer.amount.amount_minor, transfer.amount.currency)}`);
// → "Sent 5.000 Kz"
```

### Error handling

```typescript
try {
  await client.sendTransfer({ ... });
} catch (err) {
  if (err instanceof BanzamiApiError) {
    if (err.isInsufficientFunds)  console.error('Saldo insuficiente');
    if (err.isWalletNotFound)     console.error('Carteira não encontrada');
    if (err.isWalletNotActive)    console.error('Carteira suspensa');
  }
}
```

---

## QR codes

### Static QR (payer sets amount)

```typescript
const qr = await client.createStaticQr(consumer.id);
console.log(qr.payload);      // banzami://pay/...
console.log(qr.qr_code.type); // "STATIC"
```

### Dynamic QR (fixed amount, expires in 1 hour)

```typescript
const qr = await client.createDynamicQr({
  ownerId:     consumer.id,
  amountMinor: 12500,          // 12 500 Kz
  reference:   'Factura #42',
  expiresAt:   new Date(Date.now() + 60 * 60 * 1000),
});
```

### Scan and pay

```typescript
// Decode a scanned payload
const parsed = await client.decodeQrPayload(scannedString);

if (parsed.is_dynamic && parsed.qr_code_id) {
  const qrDetails = await client.getQrCode(parsed.qr_code_id);
  const amount    = qrDetails.qr_code.amount_minor!;

  await client.sendTransfer({
    senderId:    payerConsumerId,
    recipientId: qrDetails.qr_code.owner_id,
    amountMinor: amount,
  });

  await client.markQrUsed(qrDetails.qr_code.id);
} else {
  // Static QR — user enters amount
  await client.sendTransfer({
    senderId:    payerConsumerId,
    recipientId: parsed.owner_id!,
    amountMinor: userEnteredAmount,
  });
}
```

---

## Merchant operations

### List transactions with pagination

```typescript
let cursor: string | undefined;

do {
  const page = await client.listTransactions({ limit: 50, cursor });

  for (const tx of page.data) {
    console.log(tx.id, formatMinor(tx.amount_minor, tx.currency), tx.status);
  }

  cursor = page.next_cursor;
} while (cursor);
```

### Wallet balance

```typescript
const balance = await client.getWalletBalance('wlt_...');
console.log(`Available: ${formatMinor(balance.available_minor, balance.currency)}`);
console.log(`Reserved:  ${formatMinor(balance.reserved_minor,  balance.currency)}`);
```

### Trigger a payout

```typescript
const payout = await client.createPayout('wlt_...', 100_000); // 100 000 Kz
console.log(payout.status); // "PENDING"
```

---

## Webhooks

```typescript
const endpoint = await client.registerWebhookEndpoint(
  'https://meusite.ao/webhooks/banzami',
  ['transaction.completed', 'payout.completed'],
);

// List recent events
const events = await client.listWebhookEvents({ limit: 10 });
```

---

## API keys

```typescript
// Create a new key (the raw key is returned only once)
const { key, prefix } = await client.createApiKey('mch_...', 'Produção');
console.log(`New key: ${key}`);  // Store securely — not shown again.

// List existing keys
const keys = await client.listApiKeys('mch_...');

// Revoke
await client.revokeApiKey('mch_...', keys[0].id);
```

---

## Money utilities

```typescript
import { formatMinor, addMinor, subtractMinor } from '@banzami/sdk/money';

formatMinor(50_000, 'AOA');  // "50.000 Kz"
formatMinor(1099,   'USD');  // "USD 10.99"

addMinor(10_000, 5_000);     // 15000
subtractMinor(10_000, 3000); // 7000
```

---

## Theme tokens (web/Tailwind)

```typescript
import { colors, tailwindTokens, cssVariables } from '@banzami/sdk/theme';

// In tailwind.config.ts:
export default {
  theme: {
    extend: tailwindTokens,
  },
};
```

---

## Error reference

| Code                  | Meaning                                  |
|-----------------------|------------------------------------------|
| `INSUFFICIENT_FUNDS`  | Sender does not have enough balance      |
| `HANDLE_NOT_FOUND`    | No consumer with the given handle        |
| `HANDLE_TAKEN`        | Handle is already registered             |
| `WALLET_NOT_FOUND`    | Wallet ID does not exist                 |
| `WALLET_NOT_ACTIVE`   | Wallet is suspended or closed            |

All errors are instances of `BanzamiApiError` with `.status` (HTTP) and `.code` (domain) properties.
