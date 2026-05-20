# Banzami PHP SDK

Official PHP library for integrating with the Banzami payment platform.

## Requirements

- PHP 7.4 or higher
- `ext-curl`
- `ext-json`

## Installation

```bash
composer require banzami/banzami-php
```

## Quick Start

```php
use Banza\BanzaClient;
use Banza\BanzamiException;

$client = new BanzaClient('https://api.banzami.org', 'bz_live_YOUR_KEY');

// 1. Create a payment link
$link = $client->createPaymentLink([
    'merchant_id'  => 'merch_abc123',
    'wallet_id'    => 'wal_abc123',
    'amount_minor' => 50000,       // 50 000 Kz in AOA minor units
    'currency'     => 'AOA',
    'description'  => 'Pedido #1001',
]);

// 2. Redirect the customer
header('Location: https://pay.banzami.org/' . $link['slug']);
exit;

// 3. Handle the webhook (in your webhook endpoint)
$handler = new \Banzami\WebhookHandler('your-webhook-secret');
try {
    $event = $handler->parse(
        file_get_contents('php://input'),
        $_SERVER['HTTP_X_BANZAMI_SIGNATURE'] ?? ''
    );
    if ($event['type'] === 'transaction.completed') {
        // mark order as paid in your database
    }
    http_response_code(200);
} catch (BanzamiException $e) {
    http_response_code(401);
    exit('Invalid signature');
}
```

---

## API Reference

### Constructor

```php
$client = new BanzaClient(
    string $baseUrl,          // e.g. 'https://api.banzami.org'
    string $apiKey,           // e.g. 'bz_live_...'
    int    $timeout = 30,     // cURL timeout in seconds
    ?callable $httpHandler = null  // test seam only — never pass in production
);
```

---

### Payment Links

#### `createPaymentLink(array $params): array`

Creates a shareable payment link that customers can pay via QR code or URL.

```php
$link = $client->createPaymentLink([
    'merchant_id'  => 'merch_abc123',
    'wallet_id'    => 'wal_abc123',
    'amount_minor' => 25000,
    'currency'     => 'AOA',
    'description'  => 'Serviço de consultoria',  // optional
    'expires_at'   => '2026-12-31T23:59:59Z',    // optional ISO-8601
]);

// $link['slug'] — share as https://pay.banzami.org/{slug}
// $link['id']   — use for cancellation or status queries
```

#### `listPaymentLinks(string $merchantId, int $limit = 20, ?string $cursor = null): array`

```php
$page = $client->listPaymentLinks('merch_abc123', 50);
foreach ($page['items'] as $link) {
    echo $link['slug'] . PHP_EOL;
}
// Next page:
if ($page['next_cursor']) {
    $next = $client->listPaymentLinks('merch_abc123', 50, $page['next_cursor']);
}
```

#### `getPaymentLink(string $id): array`

```php
$link = $client->getPaymentLink('pl_abc123');
echo $link['status']; // active | cancelled | used
```

#### `cancelPaymentLink(string $id): array`

```php
$client->cancelPaymentLink('pl_abc123');
```

#### `resolvePaymentLink(string $slug): array`

Resolve a payment link by its public slug. Does not require authentication — safe to call from a public checkout page rendered for the customer.

```php
$details = $client->resolvePaymentLink('abc123');
// $details contains amount, description, merchant info
```

---

### Transactions

#### `createTransaction(array $params): array`

```php
$txn = $client->createTransaction([
    'wallet_id'       => 'wal_abc123',
    'amount_minor'    => 10000,
    'currency'        => 'AOA',
    'description'     => 'Pagamento loja online', // optional
    'idempotency_key' => 'order-1001-attempt-1',  // optional — see Idempotency section
]);
echo $txn['id'];     // txn_...
echo $txn['status']; // pending | completed | failed
```

#### `getTransaction(string $id): array`

```php
$txn = $client->getTransaction('txn_abc123');
```

#### `listTransactions(string $merchantId, int $limit = 20, ?string $cursor = null): array`

```php
$page = $client->listTransactions('merch_abc123', 20);
foreach ($page['items'] as $txn) {
    echo $txn['id'] . ' — ' . $txn['status'] . PHP_EOL;
}
```

---

### Wallets

#### `provisionWallet(array $params): array`

Provisions a new wallet for a merchant in the given currency.

```php
$wallet = $client->provisionWallet([
    'merchant_id' => 'merch_abc123',
    'currency'    => 'AOA',
]);
echo $wallet['id']; // wal_...
```

#### `getWallet(string $id): array`

```php
$wallet = $client->getWallet('wal_abc123');
```

#### `getWalletBalance(string $id): array`

```php
$balance = $client->getWalletBalance('wal_abc123');
echo BanzaClient::formatAmount($balance['available_minor'], $balance['currency']);
// e.g. "75.000 Kz"
```

---

### Payouts

#### `createPayout(array $params): array`

Initiates a bank payout from a Banzami wallet to an external bank account.

```php
$payout = $client->createPayout([
    'wallet_id'                => 'wal_abc123',
    'amount_minor'             => 30000,
    'currency'                 => 'AOA',
    'destination_bank_account' => 'AO060040000100003100135810',
    'idempotency_key'          => 'payout-2026-05-15-001', // recommended
]);
echo $payout['id'];     // pay_...
echo $payout['status']; // pending | processing | completed | failed
```

#### `listPayouts(string $merchantId, int $limit = 20, ?string $cursor = null): array`

```php
$page = $client->listPayouts('merch_abc123');
foreach ($page['items'] as $payout) {
    echo $payout['id'] . PHP_EOL;
}
```

#### `getPayout(string $id): array`

```php
$payout = $client->getPayout('pay_abc123');
```

---

### Merchants

#### `getMerchant(string $id): array`

```php
$merchant = $client->getMerchant('merch_abc123');
echo $merchant['name'];   // "Loja ABC"
echo $merchant['status']; // active | suspended
```

---

### Webhooks

Banzami signs every webhook payload with HMAC-SHA256. Always verify the signature before processing the event.

#### Using `WebhookHandler`

```php
use Banza\WebhookHandler;
use Banza\BanzamiException;

$handler = new WebhookHandler(getenv('BANZAMI_WEBHOOK_SECRET'));

$rawBody  = file_get_contents('php://input');
$sigHeader = $_SERVER['HTTP_X_BANZAMI_SIGNATURE'] ?? '';

try {
    $event = $handler->parse($rawBody, $sigHeader);
} catch (BanzamiException $e) {
    http_response_code(401);
    exit;
}

switch ($event['type']) {
    case 'transaction.completed':
        $txnId = $event['payload']['id'];
        // fulfil the order
        break;

    case 'transaction.failed':
        // notify the customer
        break;

    case 'payment_link.used':
        $slug = $event['payload']['slug'];
        // mark the link as fulfilled
        break;

    case 'payout.completed':
        // reconcile in your accounting system
        break;
}

http_response_code(200);
```

#### Manual verification (without `WebhookHandler`)

```php
$valid = BanzaClient::verifyWebhookSignature(
    $rawBody,
    $_SERVER['HTTP_X_BANZAMI_SIGNATURE'] ?? '',
    getenv('BANZAMI_WEBHOOK_SECRET')
);

if (!$valid) {
    http_response_code(401);
    exit;
}
```

The `Banza-Signature` header format is `sha256=<hex_digest>`.

---

### Money Helpers

Banzami always works in minor units (integers) to avoid floating-point errors.

#### `BanzaClient::formatAmount(int $amountMinor, string $currency): string`

Converts a minor-unit amount to a human-readable string.

```php
BanzaClient::formatAmount(50000, 'AOA'); // "50.000 Kz"
BanzaClient::formatAmount(1999, 'USD');  // "19,99 USD"
```

- AOA: minor unit = 1 Kwanza (no subdivision). Returns `"N Kz"`.
- All other currencies: minor unit = 1/100 of the major unit.

#### `BanzaClient::toMinorUnits(float $total, string $currency): int`

Converts a decimal amount to minor units for use in API calls.

```php
BanzaClient::toMinorUnits(500.0,  'AOA'); // 500
BanzaClient::toMinorUnits(19.99,  'USD'); // 1999
BanzaClient::toMinorUnits(1499.5, 'AOA'); // 1500 (rounded)
```

---

### Error Handling

All API errors throw `Banzami\BanzamiException`, which extends `\RuntimeException`.

```php
use Banza\BanzamiException;

try {
    $link = $client->getPaymentLink('pl_missing');
} catch (BanzamiException $e) {
    echo $e->getMessage();      // "NOT_FOUND: payment link not found"
    echo $e->getHttpStatus();   // 404
    $e->isNotFound();           // true
    $e->isUnauthorized();       // false
}
```

| Method              | Returns                         |
|---------------------|---------------------------------|
| `getMessage()`      | `"{CODE}: {message}"` string    |
| `getHttpStatus()`   | HTTP status code (int)          |
| `isNotFound()`      | `true` when status is 404       |
| `isUnauthorized()`  | `true` when status is 401       |

Common status codes:

| Code | Meaning                          |
|------|----------------------------------|
| 401  | Invalid or missing API key       |
| 404  | Resource not found               |
| 409  | Conflict (duplicate idempotency) |
| 422  | Validation error or business rule violation (e.g. insufficient funds) |
| 429  | Rate limited                     |
| 500  | Banzami internal error           |

---

### Idempotency

Financial operations that mutate state (`createTransaction`, `createPayout`) accept an optional `idempotency_key`. Submitting the same key twice returns the original response rather than creating a duplicate.

```php
$key = 'order-' . $orderId . '-' . $attemptNumber;

$txn = $client->createTransaction([
    'wallet_id'       => 'wal_abc123',
    'amount_minor'    => 10000,
    'currency'        => 'AOA',
    'idempotency_key' => $key,
]);
```

Guidelines:
- Use a stable, unique key per logical operation (e.g. `"order-{id}-attempt-{n}"`).
- Keys are scoped per merchant and expire after 24 hours.
- If the original request timed out, resubmit with the same key — the API guarantees exactly-once execution.

---

## Testing / Local Development

The constructor accepts an optional `$httpHandler` callable as the fourth parameter. This is a test seam for mocking HTTP responses without hitting the network.

```php
$handler = function (string $method, string $url, array $headers, ?string $body): array {
    return [
        'status' => 200,
        'body'   => json_encode(['id' => 'pl_test', 'slug' => 'test-slug']),
    ];
};

$client = new BanzaClient('https://api.banzami.org', 'bz_test_key', 30, $handler);
```

Never pass `$httpHandler` in production code.

### Running the Test Suite

```bash
composer install
./vendor/bin/phpunit
```

Tests are in `tests/` and use PHPUnit 10. No network access is required — all HTTP calls are mocked through the `$httpHandler` seam.
