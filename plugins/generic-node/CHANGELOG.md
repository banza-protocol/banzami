# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-05-15

### Added
- `BanzaClient` class using the native `fetch` API (Node.js >= 18 required, no external HTTP dependencies)
- Constructor options: `gatewayUrl`, `apiKey`, `timeout` (default 30 000 ms)
- Payment link operations: `createPaymentLink`, `listPaymentLinks`, `getPaymentLink`, `cancelPaymentLink`, `resolvePaymentLink` (unauthenticated)
- Transaction operations: `createTransaction`, `getTransaction`, `listTransactions`
- Wallet operations: `provisionWallet`, `getWallet`, `getWalletBalance`
- Payout operations: `createPayout`, `listPayouts`, `getPayout`
- Merchant operations: `getMerchant`
- Static webhook signature helper: `BanzaClient.verifyWebhook(rawBody, signature, secret): boolean` — HMAC-SHA256 with `timingSafeEqual`
- `parseWebhook(rawBody, signature, secret): WebhookEvent | null` helper for use with Express and other frameworks; returns `null` on bad signature
- `BanzaError` class with `code`, `status`, and typed getters: `isNotFound`, `isUnauthorized`, `isForbidden`, `isConflict`, `isInsufficientFunds`
- Static money helpers: `BanzaClient.formatAmount(amountMinor, currency): string` and `BanzaClient.toMinorUnits(total, currency): number`
- Idempotency key support on `createTransaction` and `createPayout` via optional `idempotency_key` parameter
- Cursor-based pagination on list endpoints (`next_cursor` field)
- ESM and CommonJS build outputs
