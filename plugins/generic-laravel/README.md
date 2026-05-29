# Banza Laravel SDK

Official Laravel integration for the Banza payment gateway. Provides a service provider, facade, webhook verification middleware, and typed Laravel events for all Banza webhook types.

---

## Requirements

- PHP 8.1 or higher
- Laravel 10 or Laravel 11

---

## Installation

```bash
composer require banzami/banzami-laravel
```

Laravel auto-discovery registers `BanzamiServiceProvider` and the `Banzami` facade automatically. No manual registration is needed.

---

## Configuration

Publish the config file:

```bash
php artisan vendor:publish --tag=banzami-config
```

This creates `config/banzami.php`. Set your credentials in `.env`:

```env
BANZAMI_GATEWAY_URL=https://api.banzami.org
BANZAMI_API_KEY=your_api_key_here
BANZAMI_WEBHOOK_SECRET=your_webhook_secret_here
BANZAMI_MERCHANT_ID=your_merchant_id
BANZAMI_WALLET_ID=your_default_wallet_id
```

| Variable | Description |
|---|---|
| `BANZAMI_GATEWAY_URL` | Banza API base URL (default: `https://api.banzami.org`) |
| `BANZAMI_API_KEY` | Your merchant API key |
| `BANZAMI_WEBHOOK_SECRET` | HMAC secret for webhook signature verification |
| `BANZAMI_MERCHANT_ID` | Default merchant ID (optional, can be passed per-request) |
| `BANZAMI_WALLET_ID` | Default wallet ID (optional, can be passed per-request) |

---

## Facade Usage

The `Banzami` facade proxies all calls to the underlying `BanzaClient`.

### Payment Links

```php
use Banzami\Laravel\Facades\Banzami;

// Create a payment link
$link = Banzami::createPaymentLink([
    'merchant_id' => config('banzami.merchant_id'),
    'amount'      => 5000,
    'currency'    => 'AOA',
    'reference'   => 'order-123',
    'description' => 'Order #123',
]);

// Retrieve a payment link
$link = Banzami::getPaymentLink($linkId);

// List payment links for a merchant
$links = Banzami::listPaymentLinks($merchantId, limit: 20);

// Cancel a payment link
Banzami::cancelPaymentLink($linkId);
```

### Transactions

```php
// Create a transaction
$txn = Banzami::createTransaction([
    'merchant_id' => config('banzami.merchant_id'),
    'wallet_id'   => config('banzami.wallet_id'),
    'amount'      => 5000,
    'currency'    => 'AOA',
    'reference'   => 'order-123',
]);

// Retrieve a transaction
$txn = Banzami::getTransaction($transactionId);

// List transactions
$txns = Banzami::listTransactions($merchantId, limit: 50);
```

### Wallets

```php
// Provision a wallet for a merchant
$wallet = Banzami::provisionWallet([
    'merchant_id' => $merchantId,
    'currency'    => 'AOA',
]);

// Get wallet details
$wallet = Banzami::getWallet($walletId);

// Get wallet balance
$balance = Banzami::getWalletBalance($walletId);
```

### Payouts

```php
// Request a payout
$payout = Banzami::createPayout([
    'merchant_id' => $merchantId,
    'wallet_id'   => $walletId,
    'amount'      => 10000,
    'currency'    => 'AOA',
    'destination' => 'bank_account_id',
]);

// List payouts
$payouts = Banzami::listPayouts($merchantId, limit: 20);

// Get a specific payout
$payout = Banzami::getPayout($payoutId);
```

### Merchants

```php
$merchant = Banzami::getMerchant($merchantId);
```

---

## Webhooks

Banza sends webhook events to your application when payment state changes occur. The SDK automatically verifies the HMAC-SHA256 signature on every incoming request.

### 1. Register the webhook route

The SDK registers `POST /banzami/webhook` automatically. You must **exclude this route from CSRF verification** since it receives external POST requests.

In `app/Http/Middleware/VerifyCsrfToken.php`:

```php
protected $except = [
    'banzami/webhook',
];
```

### 2. Configure the webhook URL in your Banza dashboard

Point your webhook URL to:

```
https://yourdomain.com/banzami/webhook
```

### 3. Listen for events

Register event listeners in `app/Providers/EventServiceProvider.php`:

```php
use Banzami\Laravel\Events\TransactionCompleted;
use Banzami\Laravel\Events\TransactionFailed;
use Banzami\Laravel\Events\PaymentLinkUsed;
use Banzami\Laravel\Events\WalletProvisioned;
use Banzami\Laravel\Events\PayoutRequested;

protected $listen = [
    TransactionCompleted::class => [
        \App\Listeners\HandleTransactionCompleted::class,
    ],
    TransactionFailed::class => [
        \App\Listeners\HandleTransactionFailed::class,
    ],
    PaymentLinkUsed::class => [
        \App\Listeners\HandlePaymentLinkUsed::class,
    ],
    WalletProvisioned::class => [
        \App\Listeners\HandleWalletProvisioned::class,
    ],
    PayoutRequested::class => [
        \App\Listeners\HandlePayoutRequested::class,
    ],
];
```

You can also listen for all Banza webhooks generically:

```php
use Illuminate\Support\Facades\Event;

Event::listen('banzami.webhook', function (array $event) {
    // $event contains the full parsed payload from Banzami
});
```

---

## Events Reference

All typed events are dispatched with the data from the `payload` field of the webhook body.

| Event class | Webhook type | Constructor property |
|---|---|---|
| `TransactionCompleted` | `transaction.completed` | `$payload` (array) |
| `TransactionFailed` | `transaction.failed` | `$payload` (array) |
| `PaymentLinkUsed` | `payment_link.used` | `$payload` (array) |
| `WalletProvisioned` | `wallet.provisioned` | `$wallet` (array) |
| `PayoutRequested` | `payout.requested` | `$payout` (array) |

---

## Error Handling

All API calls throw `Banzami\BanzamiException` on failure. Wrap calls accordingly:

```php
use Banzami\BanzamiException;
use Banzami\Laravel\Facades\Banzami;

try {
    $link = Banzami::createPaymentLink([...]);
} catch (BanzamiException $e) {
    // Log, retry, or surface error to the user
    logger()->error('Banzami API error', ['message' => $e->getMessage()]);
}
```

Invalid webhook signatures return HTTP 401 immediately before any event is dispatched.

---

## Complete Example: Checkout Flow

This example shows a WooCommerce-style order checkout using the facade.

```php
<?php

namespace App\Http\Controllers;

use App\Models\Order;
use Banzami\BanzamiException;
use Banzami\Laravel\Facades\Banzami;
use Illuminate\Http\Request;

class CheckoutController extends Controller
{
    public function createPaymentLink(Request $request): \Illuminate\Http\JsonResponse
    {
        $validated = $request->validate([
            'order_id'  => ['required', 'exists:orders,id'],
            'amount'    => ['required', 'integer', 'min:1'],
        ]);

        $order = Order::findOrFail($validated['order_id']);

        try {
            $link = Banzami::createPaymentLink([
                'merchant_id' => config('banzami.merchant_id'),
                'amount'      => $validated['amount'],
                'currency'    => 'AOA',
                'reference'   => (string) $order->id,
                'description' => "Order #{$order->id}",
                'redirect_url' => route('checkout.success', $order),
            ]);
        } catch (BanzamiException $e) {
            return response()->json(['error' => 'Payment gateway error. Please try again.'], 502);
        }

        $order->update(['payment_link_id' => $link['id'], 'status' => 'awaiting_payment']);

        return response()->json(['url' => $link['url']]);
    }
}
```

```php
// app/Listeners/HandleTransactionCompleted.php

namespace App\Listeners;

use App\Models\Order;
use Banzami\Laravel\Events\TransactionCompleted;

class HandleTransactionCompleted
{
    public function handle(TransactionCompleted $event): void
    {
        $order = Order::where('payment_link_id', $event->payload['payment_link_id'] ?? null)->first();

        if ($order === null) {
            return;
        }

        $order->update(['status' => 'paid', 'paid_at' => now()]);

        // Dispatch fulfillment job, send receipt email, etc.
    }
}
```

---

## Local Development & Testing

Install dev dependencies:

```bash
composer install
```

Run the test suite:

```bash
./vendor/bin/phpunit
```

The test suite uses [Orchestra Testbench](https://orchestraplatform.com/docs/testbench/) and does not require a running Banza instance. Webhook signatures are verified using the same HMAC-SHA256 logic as production.

To test webhooks locally, use a tunnelling tool such as [ngrok](https://ngrok.com/) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) to expose your local server, then configure the resulting URL in your Banza dashboard.
