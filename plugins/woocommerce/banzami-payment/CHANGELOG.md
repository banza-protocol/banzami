# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-05-15

### Added
- WooCommerce payment gateway class integrating Banza's `POST /v1/transactions` API
- Admin settings panel under WooCommerce → Settings → Payments: enable/disable toggle, title, description, gateway URL, API key, webhook secret, currency (`AOA` / `USD`), payment timeout (minutes)
- `process_payment()` creates a Banza transaction and sets the order to "Pending payment"; displays a QR code and deep-link button for the Banza mobile app
- Webhook endpoint registered at `https://your-store.com/wc-api/banzami`
- HMAC-SHA256 webhook signature verification; requests with missing or invalid `Banza-Signature` are rejected with HTTP 401
- `transaction.completed` webhook handler: calls `$order->payment_complete()` and moves order to "Processing"
- `transaction.failed` webhook handler: marks order as "Failed"
- `transaction.refunded` webhook handler: marks order as "Refunded"; guarded by `_banzami_refund_processed` meta to prevent duplicate processing
- Order meta storage: `_banzami_transaction_id` (Banza transaction UUID), `_banzami_amount_minor` (integer minor units sent to API), `_banzami_refund_processed` (refund idempotency flag)
- Minor-unit conversion supporting AOA (1 Kz = 1 minor unit) and all other currencies (divide by 100)
- QR code rendered client-side via `qrcode.js` — no server-side image generation required
- Compatible with WordPress 6.0+ and WooCommerce 7.0+; PHP 7.4+ required
- PHPUnit test suite covering signature verification and minor-unit amount conversion
