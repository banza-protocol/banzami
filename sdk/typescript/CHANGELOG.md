# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed — BREAKING (security)
- `sendTransfer(...)`, `getTransfer(id)` and `listTransfers(...)`. These called an
  id-based **merchant** transfer surface that has been retired. A
  consumer-to-consumer P2P transfer has two consumer participants and no merchant
  party, so a merchant credential held no authority over it — and the routes took
  their subject straight from client input. A merchant key could therefore name
  any `sender_id` and move that consumer's money, read any transfer by id, or
  list any consumer's entire history (security audit SEC-015 / SEC-018; the
  authorization gap was first recorded in
  `docs/security/2026-07-03-transfer-surface-findings.md`, finding B, as a hard
  blocker before Live activation).

  **Migration:** there is deliberately no merchant-facing replacement, and no
  `merchant_id` was added to the transfer model to manufacture one. Consumer P2P
  transfers belong to the consumer surface (public-api), where the sender is
  derived from the authenticated consumer token and a read is allowed only to the
  transfer's own sender or recipient. Integrations that need a consumer to move
  their own money should use the consumer API with that consumer's credential.

- `suspendConsumer(id)` and `closeConsumer(id)`. Suspending or closing a consumer
  account is an **operator** action; publishing it in the merchant SDK exposed a
  capability the merchant surface could not authorise. The routes it called
  (`POST /v1/consumers/{id}/suspend` and `/close`) performed no ownership check
  at all, so any authenticated caller could suspend or close **any** consumer
  account by id — security audit finding SEC-003. Both routes were removed from
  the merchant surface and a regression test now asserts they stay off it.

  **Migration:** there is deliberately no merchant-facing replacement. The
  capability lives on the operator surface, where it can be authorised and
  audited: `POST /admin/v1/consumers/{id}/suspend` in admin-api, gated by the
  `consumer.suspend` capability and recorded as a `SUSPEND_CONSUMER` audit event.
  It is reached through the operator console, not through this SDK.

## [0.2.0] — 2026-06-30

### Added
- Segregated wallet accounts (BANZA ADR-020): `createWalletAccount`, `listWalletAccounts`, `getWalletAccount` — bind funds to an app reference (e.g. a campaign) under one merchant wallet via `POST/GET /v1/business/wallet-accounts`
- App-defined application settlement (BANZA ADR-019): `createBusinessApplicationSettlement` — the app names the source segregated account, the beneficiary `@banza`, an optional fee destination `@banza`, and its OWN `applicationFeeBps`; the operator reads the real balance as the gross, resolves the `@names`, splits (fee → app, net → beneficiary) and audits it. The app sends no amount and never computes the final fee. Idempotent on `idempotencyKey`
- `resolveHandle(handle)` — resolve a `@banza` handle (backed by `GET /v1/consumers/handle/{handle}`) to pre-validate a beneficiary before settlement
- Types: `WalletAccount`, `CreateWalletAccountParams`, `CreateBusinessApplicationSettlementParams`, `WalletAccountPurpose`

- Payment Sessions (BANZA ADR-015): `createPaymentSession`, `getPaymentSession`, `listPaymentSessions` — one financial object bound to a `walletAccountId`, returning display interfaces (payment link, deep link, dynamic/static QR) that all credit that account. `interfaces` is the canonical ARRAY of `{ type, value, format, qr_url?, expires_at?, status? }`; use `client.paymentSessionInterface(session, 'DYNAMIC_QR')` to pick one. Omit `amountMinor` for an open-amount session. Types: `PaymentSession`, `PaymentSessionInterface`, `PaymentSessionInterfaceType`, `CreatePaymentSessionParams`

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
