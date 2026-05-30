# Banzami Payment Gateway for WooCommerce

Accept payments via the Banzami payment network in any WooCommerce store. Customers pay by scanning a QR code with the Banzami app — no card details, no redirects to external pages.

## Requirements

- WordPress 6.0+
- WooCommerce 7.0+
- PHP 7.4+
- A Banza merchant account with an API key and wallet

## Installation

1. Upload the `banzami-payment/` folder to `/wp-content/plugins/`.
2. In WordPress admin go to **Plugins → Installed Plugins** and activate **Banzami Payment Gateway**.
3. Go to **WooCommerce → Settings → Payments** and click **Banzami**.
4. Fill in the settings (see below) and click **Save changes**.

## Configuration

| Setting | Description |
|---|---|
| **Enable** | Toggle the gateway on/off at checkout |
| **Title** | Label shown to customers at checkout (e.g. "Banzami — Pagar com o telemóvel") |
| **Description** | Short description shown below the title at checkout |
| **Gateway URL** | Your Banza API gateway URL (`https://api.banzami.com` for production) |
| **API Key** | Merchant API key from the Banza dashboard — starts with `bz_live_` |
| **Webhook Secret** | Signing secret from the Banza dashboard — used to verify webhook authenticity |
| **Currency** | `AOA` (Angolan Kwanza) or `USD` |
| **Payment Timeout** | Minutes before an unpaid order is cancelled (default: 30) |

## Webhook Setup

Register your webhook endpoint in the Banza merchant dashboard:

```
https://your-store.com/wc-api/banzami
```

Events the plugin handles:

| Event | WooCommerce action |
|---|---|
| `transaction.completed` | Marks order as **Processing** / **Complete** via `payment_complete()` |
| `transaction.failed` | Marks order as **Failed** |
| `transaction.refunded` | Marks order as **Refunded** |

All incoming webhooks are verified with **HMAC-SHA256** using the Webhook Secret you configure. Requests with an invalid or missing signature are rejected with `401`.

## Payment Flow

```
Customer → WooCommerce Checkout
         → Places order (Banzami selected)
         → process_payment() calls POST /v1/transactions
         → Order set to "Pending payment"
         → Customer sees QR code + deep link

Customer → Scans QR with Banza app
         → Confirms payment in app

Banzami  → POST https://your-store.com/wc-api/banzami
         → { "type": "transaction.completed", "payload": { "id": "...", "reference": "42" } }

Plugin   → Verifies HMAC signature
         → Calls wc_get_order(42)
         → Calls $order->payment_complete(transaction_id)
         → Order moves to "Processing"
         → Customer receives order confirmation email
```

## Order Meta

The plugin stores these custom meta fields on each order:

| Meta key | Value |
|---|---|
| `_banzami_transaction_id` | Banza transaction ID (UUID) |
| `_banzami_amount_minor` | Amount in minor units (integer) sent to the API |
| `_banzami_refund_processed` | Set to `"1"` after a refund webhook is processed (prevents duplicates) |

## Currency and Minor Units

- **AOA:** `amount_minor` = integer kwanzas (no decimal — 1 AOA = 1 minor unit)
- **USD and others:** `amount_minor` = cents (`50.00 USD` → `5000`)

This follows the Banza platform convention. Do not pass floating-point amounts to the API.

## Local Development

Use [ngrok](https://ngrok.com/) or a similar tunnel to expose your local WordPress to Banza webhooks:

```bash
ngrok http 80
# Copy the HTTPS URL and set it as webhook endpoint in Banzami dashboard
# e.g. https://abc123.ngrok.io/wc-api/banzami
```

Set **Gateway URL** in the plugin settings to `http://localhost:8080` (your local API gateway).

To test the webhook locally without a real payment, send a signed POST request:

```bash
BODY='{"type":"transaction.completed","payload":{"id":"tx_test","reference":"1"}}'
SECRET="your-webhook-secret"
SIG="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"

curl -X POST https://your-tunnel.ngrok.io/wc-api/banzami \
  -H "Content-Type: application/json" \
  -H "Banza-Signature: $SIG" \
  -d "$BODY"
```

## Troubleshooting

**Orders stay in "Pending payment" after payment.**
Check that:
1. The Webhook URL is correctly registered in the Banza dashboard.
2. The Webhook Secret matches exactly (no trailing spaces).
3. Your server is accessible from the internet (not blocked by a firewall).
4. WooCommerce → Status → Logs shows no PHP errors for the `banzami` source.

**Signature verification fails (401 in logs).**
The Webhook Secret in WooCommerce settings must exactly match the one in the Banza dashboard. Regenerate both if unsure.

**Payment page shows but QR code is blank.**
The QR code is generated client-side using the `qrcode.js` library. Check your browser console for JavaScript errors or a Content Security Policy blocking the script.

**Gateway doesn't appear at checkout.**
Ensure the plugin is enabled in WooCommerce → Settings → Payments and that the API Key field is not empty.

## Running Tests

```bash
cd plugins/woocommerce/banzami-payment
composer install
./vendor/bin/phpunit
```

Tests cover signature verification and minor-unit amount conversion. Full integration tests (requiring a running WordPress + WooCommerce environment) are outside the scope of this test suite.
