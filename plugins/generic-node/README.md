# @banza/node

Official Node.js SDK for Banzami — payment links, transactions, wallets, payouts, and webhook verification.

---

## Requirements

- Node.js >= 18 (uses the native `fetch` API — no external HTTP dependencies)

---

## Installation

```bash
npm install @banza/node
```

---

## Quick Start

```ts
import { BanzaClient } from '@banza/node';

const client = new BanzaClient({
  gatewayUrl: 'https://api.banzami.org',
  apiKey:     process.env.BANZAMI_API_KEY!,
});

// Create a payment link
const link = await client.createPaymentLink({
  merchant_id:  'mer_abc123',
  wallet_id:    'wal_abc123',
  amount_minor: 50000,      // 50,000 Kz
  currency:     'AOA',
  description:  'Order #1042',
});

// Redirect the customer
console.log(`https://pay.banzami.org/${link.slug}`);
```

---

## API Reference

### Constructor

```ts
const client = new BanzaClient({
  gatewayUrl: string;  // Base URL of the Banzami API
  apiKey:     string;  // Secret API key from the Banzami dashboard
  timeout?:   number;  // Request timeout in ms (default: 30000)
});
```

---

### Payment Links

#### `createPaymentLink(params): Promise<PaymentLink>`

Creates a new payment link.

```ts
const link = await client.createPaymentLink({
  merchant_id:   'mer_abc123',
  wallet_id:     'wal_abc123',
  amount_minor:  50000,            // Optional — omit for open-amount links
  currency:      'AOA',
  description:   'Invoice #42',
  expires_at:    '2026-12-31T23:59:59Z',  // Optional ISO 8601
});
```

#### `listPaymentLinks(merchantId, limit?, cursor?): Promise<Page<PaymentLink>>`

Lists payment links for a merchant with cursor-based pagination.

```ts
const page = await client.listPaymentLinks('mer_abc123', 20);
console.log(page.items);
if (page.next_cursor) {
  const next = await client.listPaymentLinks('mer_abc123', 20, page.next_cursor);
}
```

#### `getPaymentLink(id): Promise<PaymentLink>`

Retrieves a single payment link by ID.

```ts
const link = await client.getPaymentLink('pl_abc123');
```

#### `cancelPaymentLink(id): Promise<PaymentLink>`

Cancels a payment link.

```ts
const cancelled = await client.cancelPaymentLink('pl_abc123');
```

#### `resolvePaymentLink(slug): Promise<PaymentLink>`

Resolves a public payment link by its slug. Does not require authentication — safe to call from a public-facing service.

```ts
const link = await client.resolvePaymentLink('my-store-checkout');
```

---

### Transactions

#### `createTransaction(params): Promise<Transaction>`

Creates a new transaction.

```ts
const tx = await client.createTransaction({
  wallet_id:        'wal_abc123',
  amount_minor:     10000,
  currency:         'AOA',
  description:      'Subscription renewal',
  idempotency_key:  'order-1042-attempt-1',  // Optional but recommended
});
```

#### `getTransaction(id): Promise<Transaction>`

Retrieves a transaction by ID.

```ts
const tx = await client.getTransaction('tx_abc123');
```

#### `listTransactions(merchantId, limit?, cursor?): Promise<Page<Transaction>>`

Lists transactions for a merchant.

```ts
const page = await client.listTransactions('mer_abc123', 50);
```

---

### Wallets

#### `provisionWallet(params): Promise<Wallet>`

Provisions a new wallet for a merchant.

```ts
const wallet = await client.provisionWallet({
  merchant_id: 'mer_abc123',
  currency:    'AOA',
});
```

#### `getWallet(id): Promise<Wallet>`

Retrieves a wallet by ID.

```ts
const wallet = await client.getWallet('wal_abc123');
```

#### `getWalletBalance(id): Promise<WalletBalance>`

Retrieves the current balance of a wallet.

```ts
const balance = await client.getWalletBalance('wal_abc123');

console.log(BanzaClient.formatAmount(balance.available_minor, balance.currency));
// → "50 000 Kz"
```

---

### Payouts

#### `createPayout(params): Promise<Payout>`

Initiates a payout from a wallet to a bank account.

```ts
const payout = await client.createPayout({
  wallet_id:                'wal_abc123',
  amount_minor:             25000,
  currency:                 'AOA',
  destination_bank_account: 'AO06.0040.0000.0000.0000.1015.1',
  idempotency_key:          'payout-may-2026',  // Optional but strongly recommended
});
```

#### `listPayouts(merchantId, limit?, cursor?): Promise<Page<Payout>>`

Lists payouts for a merchant.

```ts
const page = await client.listPayouts('mer_abc123', 20);
```

#### `getPayout(id): Promise<Payout>`

Retrieves a payout by ID.

```ts
const payout = await client.getPayout('po_abc123');
```

---

### Merchants

#### `getMerchant(id): Promise<Merchant>`

Retrieves merchant details by ID.

```ts
const merchant = await client.getMerchant('mer_abc123');
```

---

### Webhook Handling

Banzami signs all webhook payloads with HMAC-SHA256. Always verify the signature before processing.

**Important:** Read the raw request body as a `Buffer` before verification. Do not let the framework parse JSON first.

#### Express

```ts
import express from 'express';
import { parseWebhook } from '@banza/node';

const app = express();

// Use express.raw() — NOT express.json() — for this route
app.post('/banzami/webhook', express.raw({ type: '*/*' }), (req, res) => {
  const event = parseWebhook(
    req.body,
    req.headers['x-banzami-signature'],
    process.env.BANZAMI_WEBHOOK_SECRET!,
  );

  if (!event) {
    res.status(401).send('Bad signature');
    return;
  }

  switch (event.type) {
    case 'payment_link.used':
      console.log('Payment received:', event.payload);
      break;
    case 'payout.completed':
      console.log('Payout completed:', event.payload);
      break;
  }

  res.send('OK');
});
```

#### Next.js App Router (Route Handler)

```ts
// app/api/banzami/webhook/route.ts
import { parseWebhook } from '@banza/node';
import { NextRequest, NextResponse } from 'next/server';

export const config = { api: { bodyParser: false } };

export async function POST(req: NextRequest) {
  const raw = Buffer.from(await req.arrayBuffer());
  const sig = req.headers.get('x-banzami-signature') ?? '';

  const event = parseWebhook(raw, sig, process.env.BANZAMI_WEBHOOK_SECRET!);
  if (!event) {
    return NextResponse.json({ error: 'Bad signature' }, { status: 401 });
  }

  if (event.type === 'payment_link.used') {
    // Fulfill the order...
  }

  return NextResponse.json({ received: true });
}
```

#### Low-level signature verification

```ts
import { BanzaClient } from '@banza/node';

const isValid = BanzaClient.verifyWebhook(
  rawBody,                        // Buffer or string
  req.headers['x-banzami-signature'],
  process.env.BANZAMI_WEBHOOK_SECRET!,
);
```

---

### Money Helpers

#### `BanzaClient.formatAmount(amountMinor, currency): string`

Formats a minor-unit amount as a human-readable string.

```ts
BanzaClient.formatAmount(50000, 'AOA');  // "50 000 Kz"
BanzaClient.formatAmount(1000,  'USD');  // "$10.00"
```

AOA uses no sub-unit (1 Kz = 1 minor unit). USD and other currencies use 100 minor units per major unit.

#### `BanzaClient.toMinorUnits(total, currency): number`

Converts a human-readable amount to minor units.

```ts
BanzaClient.toMinorUnits(50000, 'AOA');  // 50000
BanzaClient.toMinorUnits(9.99,  'USD');  // 999
```

---

### Error Handling

All API errors throw a `BanzaError`.

```ts
import { BanzaClient, BanzaError } from '@banza/node';

try {
  await client.createTransaction({ ... });
} catch (err) {
  if (err instanceof BanzaError) {
    console.log(err.message);  // Human-readable error message
    console.log(err.code);     // Machine-readable code, e.g. 'INSUFFICIENT_FUNDS'
    console.log(err.status);   // HTTP status code

    if (err.isInsufficientFunds) { /* Handle low balance */ }
    if (err.isNotFound)          { /* Resource missing  */ }
    if (err.isUnauthorized)      { /* Invalid API key   */ }
    if (err.isForbidden)         { /* Access denied     */ }
    if (err.isConflict)          { /* Duplicate request */ }
  }
}
```

| Getter                | Condition                          |
|-----------------------|------------------------------------|
| `isNotFound`          | HTTP 404                           |
| `isUnauthorized`      | HTTP 401                           |
| `isForbidden`         | HTTP 403                           |
| `isConflict`          | HTTP 409                           |
| `isInsufficientFunds` | `code === 'INSUFFICIENT_FUNDS'`    |

---

### Idempotency Keys

Pass `idempotency_key` to `createTransaction` and `createPayout` to safely retry failed requests without risk of duplicate operations.

```ts
await client.createPayout({
  wallet_id:                'wal_abc123',
  amount_minor:             25000,
  currency:                 'AOA',
  destination_bank_account: 'AO06...',
  idempotency_key:          `payout-${merchantId}-${Date.now()}`,
});
```

If a request with the same `idempotency_key` has already been processed, the API returns the original result instead of executing again.

---

## CommonJS and ESM

The package ships both ESM and CommonJS builds.

**ESM (recommended)**

```ts
import { BanzaClient } from '@banza/node';
```

**CommonJS**

```js
const { BanzaClient } = require('@banza/node');
```

---

## Development

```bash
# Type-check
npm run typecheck

# Run tests
npm test

# Build
npm run build
```
