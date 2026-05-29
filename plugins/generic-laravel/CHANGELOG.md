# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-05-15

### Added
- `BanzamiServiceProvider` with Laravel auto-discovery — no manual registration required
- `Banzami` facade proxying all calls to the underlying `BanzaClient`
- Config file `config/banzami.php` publishable via `php artisan vendor:publish --tag=banzami-config`
- Environment variable support: `BANZAMI_GATEWAY_URL`, `BANZAMI_API_KEY`, `BANZAMI_WEBHOOK_SECRET`, `BANZAMI_MERCHANT_ID`, `BANZAMI_WALLET_ID`
- Facade methods: `createPaymentLink`, `getPaymentLink`, `listPaymentLinks`, `cancelPaymentLink`
- Facade methods: `createTransaction`, `getTransaction`, `listTransactions`
- Facade methods: `provisionWallet`, `getWallet`, `getWalletBalance`
- Facade methods: `createPayout`, `listPayouts`, `getPayout`
- Facade method: `getMerchant`
- Automatic `POST /banzami/webhook` route registration with HMAC-SHA256 signature verification; invalid signatures rejected with HTTP 401
- Typed Laravel events dispatched on webhook receipt: `TransactionCompleted`, `TransactionFailed`, `PaymentLinkUsed`, `WalletProvisioned`, `PayoutRequested`
- Generic `banzami.webhook` event for listening to all Banza webhook types without typed handlers
- Laravel 10 and Laravel 11 support; PHP 8.1+ required
- Test suite built on Orchestra Testbench — no running Banza instance required
