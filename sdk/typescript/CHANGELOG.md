# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] — 2026-06-30

### Added
- Segregated wallet accounts (BANZA ADR-042): `createWalletAccount`, `listWalletAccounts`, `getWalletAccount` — bind funds to an app reference (e.g. a campaign) under one merchant wallet via `POST/GET /v1/business/wallet-accounts`
- App-defined application settlement (BANZA ADR-029): `createBusinessApplicationSettlement` — the app names the source segregated account, the beneficiary `@banza`, an optional fee destination `@banza`, and its OWN `applicationFeeBps`; the operator reads the real balance as the gross, resolves the `@names`, splits (fee → app, net → beneficiary) and audits it. The app sends no amount and never computes the final fee. Idempotent on `idempotencyKey`
- `resolveHandle(handle)` — resolve a `@banza` handle (backed by `GET /v1/consumers/handle/{handle}`) to pre-validate a beneficiary before settlement
- Types: `WalletAccount`, `CreateWalletAccountParams`, `CreateBusinessApplicationSettlementParams`, `WalletAccountPurpose`

### Note
- The legacy `createApplicationSettlement` (operator-priced, `feePolicyRef` / `sourceWalletId`) remains for backwards compatibility. New app-defined-fee flows should use `createBusinessApplicationSettlement`.

## [0.1.0] — 2026-05-15

### Added
- `BanzamiClient` class with `baseUrl` / `apiKey` constructor options, configurable `maxRetries`, and `retryDelay` with exponential backoff
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
- `BanzamiApiError` with typed getters: `isNotFound`, `isUnauthorized`, `isForbidden`, `isConflict`, `isInsufficientFunds`, `isHandleNotFound`, `isHandleTaken`, `isWalletNotFound`, `isWalletNotActive`
- Money utilities exported from `@banzami/sdk/money`: `formatMinor`, `addMinor`, `subtractMinor`
- Theme design tokens exported from `@banzami/sdk/theme`: `colors`, `tailwindTokens`, `cssVariables`
- Full TypeScript type exports for all domain models: `Consumer`, `Wallet`, `Transfer`, `Transaction`, `Payout`, `PaymentLink`, `QrCode`, `Merchant`, `WebhookEndpoint`, `WebhookEvent`, and supporting types
- Automatic idempotency key generation for all POST requests
- Retry logic for HTTP 429, 502, 503, and 504 responses
- ESM build targeting ES2020 with declaration files and source maps
- CommonJS build targeting Node.js (`dist/cjs/`) for `require()` compatibility
