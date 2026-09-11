# banzami/sdk-php

Official PHP SDK for the Banzami payment platform — Angola's QR-native instant payment network.

Banzami is a wallet-native payment network. Every payment is a wallet-to-wallet transfer. The primary integration surface of this SDK is **payment links** (and the QR that encodes them) — not card forms or IBAN strings. All monetary values are **integer minor units**; for AOA the minor unit is the cêntimo, so **1 Kz = 100 minor units** (`'amount_minor' => 50000` is 500 Kz).

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
use Banzami\BanzamiClient;

$client = new BanzamiClient(
    apiKey:      'bz_live_...',
    environment: 'live',   // or 'sandbox'
);
```

For sandbox testing, use `bz_test_...` keys with `environment: 'sandbox'`. Sandbox and live environments are completely isolated — keys from one environment will be rejected by the other.

---

## Being paid by QR

To be paid by QR, create a **payment link** (below) and encode its pay URL
(`https://pay.banzami.com/pay/{slug}`) into the QR image. Any phone camera opens
the pay page. This SDK does not issue structured Banzami QR codes; no route pays
one today.

---

## Payment links

Payment links are shareable URLs for remote commerce — the merchant shares a link on WhatsApp or social media; the consumer opens it in a browser and pays.

```php
// Fixed-amount link
$link = $client->createPaymentLink([
    'merchant_id'  => 'mch_...',
    'wallet_id'    => 'wlt_...',
    'amount_minor' => 15000,             // 150 Kz
    'description'  => 'Cabrito assado',
    'expires_at'   => (new DateTime('+24 hours'))->format(DateTime::RFC3339),
]);

echo $link['slug'];   // e.g. "abc123"
// Share: https://pay.banzami.com/pay/abc123

// Open-amount link (consumer sets the amount)
$link = $client->createPaymentLink([
    'merchant_id' => 'mch_...',
    'wallet_id'   => 'wlt_...',
    // no amount_minor → consumer enters amount
]);
```

---

## Transactions

```php
// Create a transaction against a merchant wallet
$tx = $client->createTransaction([
    'idempotency_key' => 'order-12345',
    'amount_minor'    => 25000,           // 250 Kz
    'currency'        => 'AOA',
    'description'     => 'Encomenda #12345',
    'wallet_id'       => 'wlt_...',
]);
echo $tx['status']; // "PENDING"

// List with pagination
$page = $client->listTransactions(limit: 50);
foreach ($page['data'] as $t) {
    echo $t['id'] . ' — ' . $t['amount_minor'] . " AOA\n";
}
```

---

## Refunds

```php
// Partial refund of a typed payment source
$refund = $client->createRefund([
    'source_type'     => 'WALLET_PAYMENT',   // or ACQUIRING_PAYMENT
    'source_id'       => 'wp_...',
    'amount_minor'    => 2500,               // 25 Kz
    'currency'        => 'AOA',
    'reason'          => 'Produto devolvido',
    'idempotency_key' => 'refund-order-12345', // required: a stable key for this refund
]);
echo $refund['status']; // "PENDING"

$page = $client->listRefunds(limit: 20, sourceId: 'wp_...');
```

---

## Disputes

```php
$dispute = $client->openDispute([
    'transaction_id' => 'txn_...',
    'consumer_id'    => 'cns_...',
    'amount_minor'   => 25000,           // 250 Kz
    'currency'       => 'AOA',
    'reason'         => 'Serviço não prestado conforme acordado',
]);
echo $dispute['status']; // "OPEN"

$page = $client->listDisputes(status: 'OPEN');
```

---

## Wallet balance

```php
$balance = $client->getWalletBalance('wlt_...');
echo "Disponível: {$balance['available_minor']} AOA\n";
echo "Reservado:  {$balance['reserved_minor']} AOA\n";
```

---

## Webhooks

Banzami signs every webhook delivery. Always verify the signature before processing.

```php
use Banzami\Webhooks;
use Banzami\Exceptions\WebhookSignatureException;

// In your webhook handler (raw request body required — do not parse first):
$rawBody  = file_get_contents('php://input');
$sigHeader = $_SERVER['HTTP_BANZA_SIGNATURE'] ?? '';  // the banza-signature header

try {
    $event = Webhooks::constructEvent(
        rawBody:   $rawBody,
        signature: $sigHeader,
        secret:    $_ENV['BANZA_WEBHOOK_SECRET'],
    );
} catch (WebhookSignatureException $e) {
    http_response_code(400);
    exit;
}

match ($event['type']) {
    'payment_link.paid'     => handleLinkPaid($event['data']),
    'transaction.completed' => handlePayment($event['data']),
    'payout.completed'      => handlePayout($event['data']),
    default                 => null,
};
```

### Signature format

```
banza-signature: t=<unix_timestamp>,v1=<hmac_sha256_hex>
```

The signed payload is `"${timestamp}.${raw_body}"`. Timestamps older than 5 minutes are rejected.

---

## Error handling

```php
use Banzami\Exceptions\ApiException;
use Banzami\Exceptions\BanzamiException;

try {
    $link = $client->createPaymentLink([...]);
} catch (ApiException $e) {
    if ($e->isNotFound()) {
        echo "Não encontrado\n";
    } elseif ($e->getErrorCode() === 'LINK_NOT_ACTIVE') {
        echo "Link já não está activo\n";
    } else {
        echo "Erro API {$e->getErrorCode()}: {$e->getMessage()}\n";
        echo "HTTP status: {$e->getStatusCode()}\n";
    }
} catch (BanzamiException $e) {
    // Network or configuration errors
    echo "Erro: {$e->getMessage()}\n";
}
```

| `ApiException` method | Meaning |
|-----------------|-----------|
| `getStatusCode()` | HTTP status |
| `getErrorCode()` | Domain error code, e.g. `WALLET_NOT_FOUND`, `LINK_NOT_ACTIVE` |
| `isNotFound()` | HTTP 404 |
| `isUnauthorized()` | HTTP 401 |
| `isRateLimited()` | HTTP 429 |

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
    'webhook_secret' => env('BANZA_WEBHOOK_SECRET'),
];
```

### Use the facade

```php
use Banzami\Laravel\Facades\Banzami;

// Create a payment link
$link = Banzami::createPaymentLink([
    'merchant_id'  => 'mch_...',
    'wallet_id'    => 'wlt_...',
    'amount_minor' => 10000,             // 100 Kz
    'description'  => 'Produto X',
]);

// Verify a webhook
$event = \Banzami\Webhooks::constructEvent(
    rawBody:   $rawBody,
    signature: $sigHeader,
    secret:    config('banzami.webhook_secret'),
);
```

---

## Idempotency

Every POST carries an `Idempotency-Key` header, generated by the SDK and reused across its retries. To make a transaction safe to retry after a network failure, supply your own key in the parameters:

```php
$tx = $client->createTransaction([
    'idempotency_key' => 'my-order-ref-12345',
    'amount_minor'    => 25000,           // 250 Kz
    'currency'        => 'AOA',
]);
```

A refund always needs an explicit `idempotency_key`; the SDK never generates one for it.

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
