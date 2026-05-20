# banzami/sdk-php

Official PHP SDK for the Banzami payment platform — Angola's QR-native instant payment network.

Banzami is a wallet-native payment network. Every payment is a wallet-to-wallet transfer. The primary integration surfaces are **QR codes**, **payment links**, and **@banza transfers** — not card forms or IBAN strings. All monetary values are in AOA (Kwanza), expressed as **integer minor units**.

> See [ADR-013](../../docs/adr/ADR-013-wallet-native-identity.md) and [ADR-014](../../docs/adr/ADR-014-angola-national-mission.md) for platform identity and market positioning.

---

## Requirements

- PHP 8.1+
- `ext-json`
- PSR-18 HTTP client (optional — falls back to `file_get_contents` if none installed)
- PSR-7 request factory (required if using a PSR-18 client)

---

## Installation

```bash
composer require banzami/sdk-php
```

With a PSR-18 HTTP client (recommended for production):

```bash
composer require banzami/sdk-php guzzlehttp/guzzle php-http/guzzle7-adapter
```

---

## Quick start

```php
use Banzami\BanzaClient;

$client = new BanzaClient(
    apiKey:      'bz_live_...',
    environment: 'live',   // or 'sandbox'
);
```

For sandbox testing, use `bz_sandbox_...` keys with `environment: 'sandbox'`. Sandbox and live environments are completely isolated — keys from one environment will be rejected by the other.

---

## QR payments (Tier 1 — primary use case)

QR is the canonical payment surface for Angolan merchants. A merchant displays a QR code; the consumer scans it; payment is instant.

### Static QR (payer sets the amount)

```php
// Static QR — merchant prints once, consumers scan to pay any amount
$qr = $client->createStaticQr($consumerId);
echo $qr['payload'];       // banzami://pay/...
echo $qr['qr_code']['type']; // "STATIC"
```

### Dynamic QR (fixed amount, time-limited)

```php
// Dynamic QR — merchant generates per-transaction, amount is pre-set
$qr = $client->createDynamicQr([
    'owner_id'     => $merchantConsumerId,
    'amount_minor' => 12500,             // 12 500 Kz
    'reference'    => 'Factura #42',
    'expires_at'   => (new DateTime('+1 hour'))->format(DateTime::RFC3339),
]);
```

---

## Payment links

Payment links are shareable URLs for remote commerce — the merchant shares a link on WhatsApp or social media; the consumer opens it in a browser and pays.

```php
// Fixed-amount link
$link = $client->createPaymentLink([
    'merchant_id'  => 'mch_...',
    'wallet_id'    => 'wlt_...',
    'amount_minor' => 15000,             // 15 000 Kz
    'description'  => 'Cabrito assado',
    'expires_at'   => (new DateTime('+24 hours'))->format(DateTime::RFC3339),
]);

echo $link['slug'];   // e.g. "abc123"
// Share: https://pay.banzami.org/abc123

// Open-amount link (consumer sets the amount)
$link = $client->createPaymentLink([
    'merchant_id' => 'mch_...',
    'wallet_id'   => 'wlt_...',
    // no amount_minor → consumer enters amount
]);
```

---

## P2P transfers

```php
// Send money to another consumer by wallet ID
$transfer = $client->sendTransfer([
    'sender_id'    => 'cns_sender_id',
    'recipient_id' => 'cns_recipient_id',
    'amount_minor' => 5000,              // 5 000 Kz
    'description'  => 'Almoço',
]);
echo $transfer['status']; // "COMPLETED"
```

---

## Transactions

```php
// Create a transaction against a merchant wallet
$tx = $client->createTransaction([
    'idempotency_key' => 'order-12345',
    'amount_minor'    => 25000,           // 25 000 Kz
    'currency'        => 'AOA',
    'description'     => 'Encomenda #12345',
    'wallet_id'       => 'wlt_...',
]);
echo $tx['status']; // "PENDING"

// List with pagination
$page = $client->listTransactions(['limit' => 50]);
foreach ($page['data'] as $t) {
    echo $t['id'] . ' — ' . $t['amount_minor'] . " AOA\n";
}
```

---

## Refunds

```php
// Partial refund
$refund = $client->createRefund([
    'transaction_id' => 'txn_...',
    'amount_minor'   => 2500,            // 2 500 Kz
    'reason'         => 'Produto devolvido',
]);
echo $refund['status']; // "PENDING"

$page = $client->listRefunds(['transaction_id' => 'txn_...']);
```

---

## Disputes

```php
$dispute = $client->openDispute([
    'transaction_id' => 'txn_...',
    'reason'         => 'Serviço não prestado conforme acordado',
]);
echo $dispute['status']; // "OPEN"

$page = $client->listDisputes(['status' => 'OPEN']);
```

---

## Payment requests

Payment requests allow a merchant to push a payment demand to a specific consumer.

```php
$request = $client->createPaymentRequest([
    'merchant_id'  => 'mch_...',
    'consumer_id'  => 'cns_...',
    'amount_minor' => 15000,             // 15 000 Kz
    'description'  => 'Encomenda #87 — entrega domiciliária',
    'expires_at'   => (new DateTime('+24 hours'))->format(DateTime::RFC3339),
]);

// Consumer pays
$client->payPaymentRequest($request['id'], 'cns_wallet_id');

// Consumer declines
$client->declinePaymentRequest($request['id']);

// Merchant cancels
$client->cancelPaymentRequest($request['id']);
```

---

## Wallet balance

```php
$balance = $client->getWalletBalance('wlt_...');
echo "Disponível: {$balance['available_minor']} AOA\n";
echo "Reservado:  {$balance['reserved_minor']} AOA\n";
```

---

## Payouts

```php
// Request a payout of 100 000 Kz to the merchant's bank account
$payout = $client->createPayout('wlt_...', 100000);
echo $payout['status']; // "PENDING"
```

---

## Webhooks

Banzami signs every webhook delivery. Always verify the signature before processing.

```php
use Banzami\Webhooks;
use Banzami\Exceptions\WebhookSignatureException;

// In your webhook handler (raw request body required — do not parse first):
$rawBody  = file_get_contents('php://input');
$sigHeader = $_SERVER['HTTP_BANZAMI_SIGNATURE'] ?? '';

try {
    $event = Webhooks::constructEvent(
        rawBody:   $rawBody,
        signature: $sigHeader,
        secret:    $_ENV['BANZAMI_WEBHOOK_SECRET'],
    );
} catch (WebhookSignatureException $e) {
    http_response_code(400);
    exit;
}

match ($event['type']) {
    'transaction.completed' => handlePayment($event['data']),
    'payout.completed'      => handlePayout($event['data']),
    'refund.created'        => handleRefund($event['data']),
    default                 => null,
};
```

### Signature format

```
Banza-Signature: t=<unix_timestamp>,v1=<hmac_sha256_hex>
```

The signed payload is `"${timestamp}.${raw_body}"`. Timestamps older than 5 minutes are rejected.

---

## Error handling

```php
use Banzami\Exceptions\ApiException;
use Banzami\Exceptions\BanzamiException;

try {
    $transfer = $client->sendTransfer([...]);
} catch (ApiException $e) {
    if ($e->isInsufficientFunds()) {
        echo "Saldo insuficiente\n";
    } elseif ($e->isWalletNotFound()) {
        echo "Carteira não encontrada\n";
    } else {
        echo "Erro API {$e->getCode()}: {$e->getMessage()}\n";
        echo "HTTP status: {$e->getStatus()}\n";
    }
} catch (BanzamiException $e) {
    // Network or configuration errors
    echo "Erro: {$e->getMessage()}\n";
}
```

| Exception method | Condition |
|-----------------|-----------|
| `isInsufficientFunds()` | Sender wallet has insufficient balance |
| `isWalletNotFound()` | Wallet ID does not exist |
| `isWalletNotActive()` | Wallet is suspended or closed |
| `isHandleNotFound()` | No consumer with the given @banza |
| `isHandleTaken()` | @banza is already registered |
| `isLinkNotActive()` | Payment link is used, cancelled, or expired |

---

## Laravel integration

### Install and publish config

```bash
php artisan vendor:publish --provider="Banzami\Laravel\BanzamiServiceProvider"
```

### Configure (`config/banzami.php`)

```php
return [
    'api_key'        => env('BANZAMI_API_KEY'),
    'environment'    => env('BANZAMI_ENVIRONMENT', 'sandbox'),
    'webhook_secret' => env('BANZAMI_WEBHOOK_SECRET'),
];
```

### Use the facade

```php
use Banzami\Laravel\Facades\Banzami;

// Create a payment link
$link = Banzami::createPaymentLink([
    'merchant_id'  => 'mch_...',
    'wallet_id'    => 'wlt_...',
    'amount_minor' => 10000,
    'description'  => 'Produto X',
]);

// Verify a webhook
$event = Banzami::webhooks()->constructEvent(
    rawBody:   $rawBody,
    signature: $sigHeader,
    secret:    config('banzami.webhook_secret'),
);
```

---

## Idempotency

All POST operations accept an `Idempotency-Key` header. The SDK auto-generates one per request. If you need to supply your own (for safe retries after network failure):

```php
$tx = $client->createTransaction(
    params: ['amount_minor' => 25000, 'currency' => 'AOA', ...],
    idempotencyKey: 'my-order-ref-12345',
);
```

Retrying with the same key returns the original response without creating a duplicate.

---

## Development

```bash
# Install dependencies
composer install

# Run tests (PHPUnit)
./vendor/bin/phpunit

# Static analysis
./vendor/bin/phpstan analyse src
```

---

## References

- [SDK-first policy — ADR-012](../../docs/adr/ADR-012-sdk-first-ecosystem.md)
- [Wallet-native identity — ADR-013](../../docs/adr/ADR-013-wallet-native-identity.md)
- [Angola-first mission — ADR-014](../../docs/adr/ADR-014-angola-national-mission.md)
- [Webhook signature spec](../../docs/domains/webhook-signature-spec.md)
