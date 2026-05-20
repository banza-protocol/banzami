# @banza/sdk

Official JavaScript/TypeScript SDK for the Banzami payment platform — Angola's QR-native instant payment network.

Banzami is a wallet-native payment network. Every payment is a wallet-to-wallet transfer. The primary integration surfaces are **QR codes**, **payment links**, and **@banza transfers** — not card forms or IBAN strings.

All monetary values use **integer minor units** in AOA (Kwanza). No floating-point arithmetic.

Requires Node.js ≥ 18 (native `fetch`) or a browser environment.

> See [ADR-013](../../docs/adr/ADR-013-wallet-native-identity.md) and [ADR-014](../../docs/adr/ADR-014-angola-national-mission.md) for platform identity and market positioning.

---

## Installation

```bash
npm install @banza/sdk
```

---

## Quick start

```typescript
import { BanzaClient } from '@banza/sdk';

const client = new BanzaClient({
  baseUrl: 'https://api.banzami.org',
  apiKey:  'bz_live_...',
});
```

---

## Consumer flows

### Create a consumer and provision a wallet

```typescript
const consumer = await client.createConsumer('joao', 'João Silva');
const wallet   = await client.getOrCreateConsumerWallet(consumer.id);

const balance  = await client.getConsumerWalletBalance(wallet.id);
console.log(balance.available_minor); // e.g. 25000 (Kz)
```

### Look up a consumer by @banza

```typescript
const consumer = await client.getConsumerByHandle('joao');
if (consumer.status !== 'ACTIVE') {
  throw new Error('Consumer is not active');
}
```

---

## P2P transfers

```typescript
import { BanzaClient, BanzaApiError, formatMinor } from '@banza/sdk';

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
  if (err instanceof BanzaApiError) {
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

### Create a transaction

```typescript
const tx = await client.createTransaction({
  idempotencyKey: 'order-12345',
  amountMinor:    25_000,        // 25 000 Kz
  currency:       'AOA',
  description:    'Encomenda #12345',
  walletId:       'wlt_...',
});
console.log(tx.status); // "PENDING"
```

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

## Payment links

Payment links are shareable URLs for informal commerce — the merchant shares a link and the consumer pays without needing to be present.

### Create and share a link

```typescript
// Fixed-amount link (expires in 24 h)
const link = await client.createPaymentLink({
  merchantId:  'mch_...',
  walletId:    'wlt_...',
  amountMinor: 15_000,
  description: 'Cabrito assado',
  expiresAt:   new Date(Date.now() + 24 * 60 * 60 * 1000),
});

console.log(link.slug);    // e.g. "abc123"
console.log(link.status);  // "ACTIVE"
// Share: https://pay.banzami.org/abc123
```

### Open link (consumer sets amount)

```typescript
const link = await client.createPaymentLink({
  merchantId:  'mch_...',
  walletId:    'wlt_...',
  // no amountMinor → consumer enters the amount
});
```

### List and manage links

```typescript
const page = await client.listPaymentLinks({ merchantId: 'mch_...', limit: 20 });
for (const link of page.data) {
  console.log(link.slug, link.status, link.amount_minor);
}

// Cancel a link
await client.cancelPaymentLink(link.id);
```

### Resolve a link on the pay page (no auth required)

```typescript
const link = await client.getPublicPaymentLink('abc123');
if (link.status !== 'ACTIVE') throw new Error('Link is no longer active');

// Poll for payment confirmation
const { paid } = await client.getPaymentLinkStatus('abc123');
```

---

## Refunds

```typescript
// Initiate a refund on a completed transaction
const refund = await client.createRefund({
  transactionId: 'txn_...',
  amountMinor:   2500,        // partial refund — 2 500 Kz
  reason:        'Produto devolvido',
});
console.log(refund.status); // "PENDING"

// Full list with pagination
const page = await client.listRefunds({ transactionId: 'txn_...', limit: 20 });
```

---

## Disputes

```typescript
// Consumer opens a dispute on a transaction
const dispute = await client.openDispute({
  transactionId: 'txn_...',
  reason:        'Serviço não prestado conforme acordado',
});
console.log(dispute.status); // "OPEN"

// Merchant lists open disputes
const page = await client.listDisputes({ status: 'OPEN', limit: 20 });
```

---

## Payment requests

Payment requests allow a merchant to send a payment demand to a specific consumer, who can pay or decline.

```typescript
// Merchant sends a payment request to a consumer
const request = await client.createPaymentRequest({
  merchantId:  'mch_...',
  consumerId:  'cns_...',
  amountMinor: 15_000,        // 15 000 Kz
  description: 'Encomenda #87 — entrega domiciliária',
  expiresAt:   new Date(Date.now() + 24 * 60 * 60 * 1000),
});

// Consumer pays the request
await client.payPaymentRequest(request.id, 'cns_wallet_id');

// Consumer declines
await client.declinePaymentRequest(request.id);

// Merchant cancels before consumer acts
await client.cancelPaymentRequest(request.id);
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
import { formatMinor, addMinor, subtractMinor } from '@banza/sdk/money';

formatMinor(50_000, 'AOA');  // "50.000 Kz"
formatMinor(1099,   'USD');  // "USD 10.99"

addMinor(10_000, 5_000);     // 15000
subtractMinor(10_000, 3000); // 7000
```

---

## Theme tokens (web/Tailwind)

```typescript
import { colors, tailwindTokens, cssVariables } from '@banza/sdk/theme';

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
| `LINK_NOT_ACTIVE`     | Payment link is already used, cancelled, or expired |

All errors are instances of `BanzaApiError` with `.status` (HTTP) and `.code` (domain) properties.

---

## Development

```bash
# Build
npm run build

# Type-check only (no emit)
npm run typecheck

# Tests (vitest)
npm test

# Tests in watch mode
npm run test:watch
```
