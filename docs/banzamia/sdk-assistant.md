# BanzamIA — SDK Assistant

**Version:** 1.0  
**Date:** 2026-05-28  
**Status:** Active

---

## Overview

The SDK Assistant generates integration code for Banzami SDKs and guides developers through the complete integration process — from first API call to production readiness.

---

## Official SDKs

| SDK | Package | Platform |
|-----|---------|---------|
| TypeScript | `@banza/sdk` | Node.js, web backends, Next.js |
| Flutter/Dart | `banzami_sdk` | Android, iOS |
| PHP | `banza/sdk` | PHP/Laravel backends |

All external integrations must use official SDKs. Direct HTTP calls without the SDK are not the recommended path (ADR-012).

---

## TypeScript SDK

### Installation

```bash
npm install @banza/sdk
```

### Initialisation

```typescript
import { BanzaClient } from '@banza/sdk';

// Sandbox (development)
const client = new BanzaClient({
  apiKey:      'bz_test_…',
  environment: 'sandbox',
});

// Production
const client = new BanzaClient({
  apiKey:      'bz_live_…',
  environment: 'live',
});
```

### Common operations

**Create a static QR:**
```typescript
const qr = await client.qr.createStatic({
  ownerId:   merchantId,
  ownerType: 'MERCHANT',
  currency:  'AOA',
});
console.log(qr.payload); // QR payload to render
```

**Create a dynamic QR (specific amount):**
```typescript
const qr = await client.qr.createDynamic({
  ownerId:     merchantId,
  amountMinor: 250000,  // 2.500 AOA
  currency:    'AOA',
  description: 'Order #42',
  expiresAt:   new Date(Date.now() + 15 * 60 * 1000),
});
```

**Create a payment link:**
```typescript
const link = await client.paymentLinks.create({
  amountMinor: 100000,
  currency:    'AOA',
  description: 'Invoice #2026-001',
  expiresAt:   new Date('2026-12-31'),
});
console.log(link.url); // https://pay.banza.ao/l/abc123
```

**Handle webhooks:**
```typescript
import { BanzaWebhooks } from '@banza/sdk';

const webhooks = new BanzaWebhooks({ secret: process.env.BANZA_WEBHOOK_SECRET });

// In your webhook handler
app.post('/webhooks/banza', express.raw({ type: '*/*' }), (req, res) => {
  const event = webhooks.constructEvent(req.body, req.headers['banza-signature']);

  switch (event.type) {
    case 'transaction.captured':
      await handlePayment(event.data);
      break;
    case 'payout.completed':
      await handlePayout(event.data);
      break;
  }

  res.sendStatus(200);
});
```

**Idempotency:**
```typescript
const payment = await client.transactions.create({
  amountMinor:    5000,
  currency:       'AOA',
  idempotencyKey: `order-${orderId}-attempt-1`,
});
```

---

## Flutter/Dart SDK

### Installation

In `pubspec.yaml`:
```yaml
dependencies:
  banzami_sdk: ^1.0.0
```

### Consumer client

```dart
import 'package:banzami_sdk/banzami_sdk.dart';

final client = ConsumerPublicClient(
  baseUrl:     'https://api.banzami.org',
  environment: BanzamiEnvironment.live,
);

// Login
await client.login(handle: 'joao', pin: '123456');

// Get balance
final balance = await client.getBalance();
print('Balance: ${balance.displayAmount} AOA');

// Scan and pay QR
final result = await client.payQR(payload: scannedPayload);
```

### Sandbox mode

```dart
final sandboxClient = ConsumerPublicClient(
  baseUrl:     'https://sandbox-api.banzami.org',
  environment: BanzamiEnvironment.sandbox,
);

// Fund test wallet
await sandboxClient.sandboxFund(amountMinor: 5000000);
```

---

## PHP SDK

### Installation

```bash
composer require banza/sdk
```

### Merchant integration

```php
use Banza\SDK\BanzaClient;

$client = new BanzaClient([
    'api_key'     => $_ENV['BANZA_API_KEY'],
    'environment' => 'sandbox', // or 'live'
]);

// Create dynamic QR
$qr = $client->qr()->createDynamic([
    'amount_minor' => 250000,
    'currency'     => 'AOA',
    'description'  => 'Order #42',
]);

echo $qr->payload; // QR payload
echo $qr->url;     // Payment URL
```

---

## Sandbox Testing

### Fund a test wallet

**TypeScript:**
```typescript
await client.sandbox.fund({ amountMinor: 10000000, currency: 'AOA' });
```

**Flutter:**
```dart
await client.sandboxFund(amountMinor: 10000000);
```

**PHP:**
```php
$client->sandbox()->fund(['amount_minor' => 10000000, 'currency' => 'AOA']);
```

### Simulate a payment scenario

```typescript
await client.sandbox.simulatePayment({
  amountMinor: 50000,
  currency:    'AOA',
  scenario:    'success', // or: 'insufficient_funds', 'fraud_blocked'
});
```

---

## Going to Production

Checklist before switching from sandbox to live:

- [ ] Generate a live API key (`bz_live_…`)
- [ ] Update `environment` from `'sandbox'` to `'live'`
- [ ] Replace API key in environment variables
- [ ] Register live webhook endpoints (sandbox webhooks are not called for live events)
- [ ] Verify webhook signature implementation with a live test transaction
- [ ] Fund live wallet via Banzami operations

---

## Asking the SDK Assistant

The SDK Assistant in BanzamIA can generate code for any integration scenario:

```
> Gera código TypeScript para criar um pagamento QR dinâmico
  e verificar o webhook quando o pagamento é confirmado
```

```
> Como integrar o Banza SDK no Flutter para uma app de táxi?
```

```
> Mostra um exemplo completo de payment link com expiração em 24h em PHP
```

---

## References

- `sdk/typescript/` — TypeScript SDK source
- `sdk/flutter/` — Flutter SDK source
- `sdk/php/` — PHP SDK source
- `docs/sandbox/README.md` — sandbox reference
- ADR-012 — SDK-first ecosystem policy
