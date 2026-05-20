# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-05-15

### Added
- `BanzaClient` class supporting PHP 7.4+ with no external dependencies (only `ext-curl` and `ext-json` required)
- Constructor options: `$baseUrl`, `$apiKey`, `$timeout` (default 30 s), optional `$httpHandler` test seam, `$maxRetries` (default 3), `$retryDelayMs` (default 500 ms)
- Payment link operations: `createPaymentLink`, `listPaymentLinks`, `getPaymentLink`, `cancelPaymentLink`, `resolvePaymentLink` (unauthenticated)
- Transaction operations: `createTransaction`, `getTransaction`, `listTransactions`
- Wallet operations: `provisionWallet`, `getWallet`, `getWalletBalance`
- Payout operations: `createPayout`, `listPayouts`, `getPayout`
- Merchant operations: `getMerchant`
- Static webhook helper: `BanzaClient::verifyWebhookSignature` — HMAC-SHA256 verification using `hash_equals` for timing-safe comparison
- `WebhookHandler` class: `parse(string $rawBody, string $signature): array` — verifies signature and decodes the event in one call
- Static money helpers: `BanzaClient::formatAmount(int $amountMinor, string $currency): string` and `BanzaClient::toMinorUnits(float $total, string $currency): int`
- `BanzamiException` extending `\RuntimeException` with `getHttpStatus()`, `isNotFound()`, and `isUnauthorized()` convenience methods
- Automatic idempotency key generation (shared across retries) for all POST requests
- Retry logic for network errors (code 0), HTTP 429, and 5xx responses with exponential backoff
- Cursor-based pagination on list endpoints (`next_cursor` field)
