# @banzami/sdk

Official JavaScript/TypeScript SDK for the Banzami payment platform — Angola's QR-native instant payment network.

Banzami is a wallet-native payment network. Every payment is a wallet-to-wallet transfer. The primary integration surfaces are **QR codes**, **payment links**, and **@banza transfers** — not card forms or IBAN strings.

All monetary values use **integer minor units** in AOA (Kwanza). No floating-point arithmetic.

Requires Node.js ≥ 18 (native `fetch`) or a browser environment.

> See [ADR-013](../../docs/adr/ADR-013-wallet-native-identity.md) and [ADR-014](../../docs/adr/ADR-014-angola-national-mission.md) for platform identity and market positioning.

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
  apiKey: process.env.BANZAMI_API_KEY!, // bz_test_sk_… (sandbox) or bz_live_sk_… (live)
});
```

---

## Environments & API keys

Banzami has two environments. Every key carries its environment in the prefix,
so a key can never be used against the wrong universe by accident.

| Environment | What it is | Money | Secret key | Webhook secret |
|-------------|------------|-------|------------|----------------|
| **Sandbox** | Development & testing | Virtual — simulated confirmations, failures, refunds | `bz_test_sk_…` | `whsec_test_…` |
| **Live**    | Production | Real Kwanza movement (requires activation) | `bz_live_sk_…` | `whsec_live_…` |

> **Sandbox is for development. Live is for production.** Live requires onboarding
> and activation of approved rails — it is not enabled by default.

Publishable keys (`bz_test_pk_…` / `bz_live_pk_…`) are a planned client-safe key
type for browser/mobile flows. **Secret keys (`…_sk_…`) are backend-only — never
ship them in browser or mobile code.**

### Environment detection

The client resolves the environment in this order:

1. The explicit `environment` option, if provided.
2. The key prefix — `bz_test_…` → `sandbox`, `bz_live_…` → `live`.
3. The base URL, if it mentions `sandbox`.
4. Otherwise `live`.

If an explicit `environment` conflicts with the key prefix, the constructor
throws `BanzamiConfigError` before any request is made:

```typescript
// ✅ inferred from the key — no environment needed
new BanzamiClient({ apiKey: 'bz_test_sk_...' }); // → sandbox

// ✅ explicit and consistent
new BanzamiClient({ environment: 'sandbox', apiKey: 'bz_test_sk_...' });

// ❌ throws BanzamiConfigError:
//    "Banzami environment/key mismatch: live environment cannot use sandbox key…"
new BanzamiClient({ environment: 'live', apiKey: 'bz_test_sk_...' });
```

Legacy keys without the `_sk_` segment (`bz_test_…`, `bz_live_…`) remain fully
supported — the prefix is all that matters for environment detection.

### Authentication (API key → JWT)

The gateway is JWT-authenticated. The SDK handles this transparently: on the
first protected request it exchanges the raw API key at `POST /v1/auth/token`
for a short-lived JWT, caches it in memory, sends it as the `Bearer` token on
every request, refreshes it before expiry, and re-exchanges once on a `401`.
**The raw API key only ever hits the auth-exchange endpoint — never a protected
endpoint, and it is never logged.** A failed exchange throws `BanzamiAuthError`.

A Console-issued Developer Platform key (`bz_test_sk_…`) is itself the
credential: it is presented directly as the `Bearer` token and there is nothing
to exchange.

---

## Your Project: identity and financial readiness

```typescript
const me = await banzami.me();
// { environment: 'SANDBOX', project: { id, name, ref }, scopes, key_status }
// project.id is the Project's own id (as in the Console) and survives a rename.

const setup = await banzami.getFinancialSetup();
if (!setup.settlement.ready) {
  // Each blocker is the refusal a settlement would return, e.g.
  // FINANCIAL_SETUP_NOT_CONFIGURED, PRICING_NOT_CONFIGURED,
  // FEE_DESTINATION_TYPE_NOT_ALLOWED. Treat an unknown code as blocking.
  console.log(setup.settlement.blockers);
}
```

`getFinancialSetup()` reads with the key alone — nothing in the request names a
Project or account. The pricing it reports (`pricing.profile`,
`settlement_bps`, `payout_bps`) is assigned by Banzami; a settlement request
never carries a rate. `fee_destination.required` says whether that pricing
charges a fee at all; when it does not, the destination blocks nothing. Needs
the `identity:read` scope.

---

## Consumer flows

### Look up a consumer by @banza

```typescript
const consumer = await client.getConsumerByHandle('joao');
if (consumer.status !== 'ACTIVE') {
  throw new Error('Consumer is not active');
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

A payer pays a QR from the Banzami app, which moves the money from the payer's
own wallet under the payer's own authentication. A server key never pays on a
person's behalf, so the SDK has no "send money from this consumer" call.

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
// Share: https://pay.banzami.com/pay/abc123
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

## Payment QR

The **official, renderable QR payload** for a payment link is owned by the SDK —
never build it yourself. `qrValue` is the canonical, scannable value (the Banzami
pay URL); encode it into a QR image as-is. Because the payload is produced here,
its format can evolve without every integration changing.

```typescript
// You already hold the PaymentLink (e.g. from createPaymentLink) — derive
// the QR payload with no extra network call:
const link = await client.createPaymentLink({ merchantId, walletId, amountMinor: 150_000 });

const qr = client.paymentLinkQr(link, {
  recipientHandle: '@fm65',         // optional — the gateway doesn't return it
  recipientName:   'Fidel Monteiro',
});

qr.qrValue;          // "https://pay.banzami.com/pay/abc123"  ← encode this into the QR
qr.paymentUrl;       // same canonical pay URL
qr.amountMinor;      // 150000
qr.currency;         // "AOA"
qr.isSandbox;        // true in sandbox
qr.status;           // "ACTIVE"

// Or fetch by id (JWT-authenticated) and derive in one call:
const qr2 = await client.getPaymentLinkQr('plink_123', { recipientHandle: '@fm65' });
```

The pay-page host defaults to `https://pay.banzami.com`; override with the
`payBaseUrl` client option if needed. **Encoding the returned `qrValue` is the
only step that belongs to your app — the payload itself comes from the SDK.**

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
| `LINK_NOT_ACTIVE`     | Payment link is already used, cancelled, or expired |

All errors are instances of `BanzamiApiError` with `.status` (HTTP) and `.code` (domain) properties.

```typescript
import { BanzamiApiError } from '@banzami/sdk';

try {
  await client.createPayout('wlt_...', 100_000);
} catch (err) {
  if (err instanceof BanzamiApiError) {
    if (err.isInsufficientFunds) console.error('Saldo insuficiente');
    if (err.isWalletNotFound)    console.error('Carteira não encontrada');
    if (err.isWalletNotActive)   console.error('Carteira suspensa');
  }
}
```

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

---

## Licence

The `@banzami/sdk` **client code in this package** is licensed under the
[MIT licence](./LICENSE).

That grant is deliberately narrow, and covers this package only:

- **Use of the Banzami hosted service and API** — creating payment sessions,
  moving money, receiving webhooks — remains governed by the Banzami terms of
  service and your operator agreement. Installing this package does not grant
  access to the service, and does not licence the Banzami platform, backend,
  Developer Platform, infrastructure, or documentation.
- **The BANZA protocol** is governed separately by the BANZA protocol project.
  It is not relicensed by this package.
- **No trademark rights.** The MIT licence does not grant any right to use the
  Banzami or BANZA names, logos, or branding. See the brand guidance in the
  developer documentation before referring to Banzami in your product.
