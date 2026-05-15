# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-05-15

### Added
- `BanzamiClient` for merchant-side operations: `getMerchant`, `getMerchantBalance`, `listMerchantTransactions`, `createPaymentLink`
- Automatic JWT exchange and silent token renewal (5 minutes before expiry) — no session management required by calling code
- `ConsumerPublicClient` for consumer-side operations: `register`, `login`, `getBalance`, `sendByHandle`, `getPaymentLinkBySlug`, `payPaymentLink`, `decodeQrPayload`
- `BanzamiApiException` with `statusCode`, `code`, and convenience flags: `isInsufficientFunds`, `isHandleTaken`, `isQrExpired`
- `BanzamiNetworkException` for connectivity failures (no HTTP response received)
- `CheckoutScreen` — full-screen hosted payment page displaying a QR code and deep-link button; polls every 3 seconds and fires `onSuccess` on confirmation
- `BanzamiSendScreen` — P2P transfer flow: recipient handle entry, amount input, confirmation, and `onSuccess` callback with the completed `Transfer`
- `BanzamiReceiveScreen` — displays the consumer's `@handle` as a scannable QR code; supports optional fixed-amount mode with real-time QR payload updates
- `BanzamiScanScreen` — camera-based QR scan-to-pay flow supporting both `banzami:@{handle}` deep links and payment link URLs; handles camera permission errors with a retry path
- `BanzamiButton` widget with four variants: primary, secondary (outlined), ghost (text-only), and destructive; supports `isLoading`, `fullWidth`, and leading `icon`
- `BanzamiAmountInput` widget — large-format monetary input that exposes minor units via `onChanged`; supports thousands separator, `errorText`, and `enabled` flag
- `BanzamiQrDisplay` widget with static and dynamic constructors; shows amount label and subtitle beneath the QR code in Banzami visual style
- `BanzamiQrScanner` widget — full-screen camera scanner that fires `onDetected` once per scan with the raw QR string
- `BanzamiTransferItem` list row widget — resolves debit/credit direction from `currentConsumerId` and colours the amount accordingly
- Design token system: `BanzamiColors` (wine, gold, gray900, success, error), `BanzamiGradients`, `BanzamiTextStyles` (displayXl, headingMd, bodyMd, mono), `BanzamiSpacing` (sm, lg, xl), `BanzamiRadius` (mdAll, lgAll, fullAll), `BanzamiShadows` (card, cardElevated)
- `BanzamiTheme.light` — full `ThemeData` for use with `MaterialApp`
- `formatMinor` utility: AOA integer kwanzas formatted with `pt_PT` locale; other currencies with two decimal places
- Domain models: `Consumer`, `Merchant`, `MerchantBalance`, `MerchantTransaction`, `MerchantTransactionPage`, `WalletBalance`, `Transfer`, `TransferPage`, `PaymentLink`, `PaymentLinkPage`, `QrCode`, `QrResponse`, `ParsedQr`
- Single barrel import via `package:banzami_sdk/banzami_sdk.dart`
