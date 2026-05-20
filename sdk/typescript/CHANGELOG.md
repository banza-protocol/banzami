# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-05-15

### Added
- `BanzaClient` class with `baseUrl` / `apiKey` constructor options, configurable `maxRetries`, and `retryDelay` with exponential backoff
- Consumer management: `createConsumer`, `getConsumer`, `getConsumerByHandle`, `suspendConsumer`, `closeConsumer`
- Consumer wallet management: `getOrCreateConsumerWallet`, `getConsumerWallet`, `getConsumerWalletBalance`, `getConsumerWalletForConsumer`
- P2P transfers: `sendTransfer`, `getTransfer`, `listTransfers` with cursor-based pagination
- QR code operations: `createStaticQr`, `createDynamicQr`, `getQrCode`, `decodeQrPayload`, `markQrUsed`
- Merchant-facing transactions: `createTransaction`, `getTransaction`, `listTransactions` with status filter
- Merchant wallet operations: `getWallet`, `getWalletBalance`
- Payout management: `createPayout`, `listPayouts`
- Merchant API key management: `getMerchant`, `listApiKeys`, `createApiKey`, `revokeApiKey`
- Payment links: `createPaymentLink`, `listPaymentLinks`, `getPaymentLink`, `cancelPaymentLink`, `getPublicPaymentLink`, `getPaymentLinkStatus`
- Webhook endpoint management: `listWebhookEndpoints`, `registerWebhookEndpoint`, `deleteWebhookEndpoint`, `listWebhookEvents`
- `BanzaApiError` with typed getters: `isNotFound`, `isUnauthorized`, `isForbidden`, `isConflict`, `isInsufficientFunds`, `isHandleNotFound`, `isHandleTaken`, `isWalletNotFound`, `isWalletNotActive`
- Money utilities exported from `@banza/sdk/money`: `formatMinor`, `addMinor`, `subtractMinor`
- Theme design tokens exported from `@banza/sdk/theme`: `colors`, `tailwindTokens`, `cssVariables`
- Full TypeScript type exports for all domain models: `Consumer`, `Wallet`, `Transfer`, `Transaction`, `Payout`, `PaymentLink`, `QrCode`, `Merchant`, `WebhookEndpoint`, `WebhookEvent`, and supporting types
- Automatic idempotency key generation for all POST requests
- Retry logic for HTTP 429, 502, 503, and 504 responses
- ESM build targeting ES2020 with declaration files and source maps
- CommonJS build targeting Node.js (`dist/cjs/`) for `require()` compatibility
