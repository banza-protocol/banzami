# ADR — The Flutter SDK is the single source of truth for payment flows

Status: Accepted
Date: 2026-06-25
Version: 1.0
Supersedes: none — complements ADR-007 (Flutter SDK architecture)

---

## Context

The Banzami Flutter SDK (`sdk/flutter`, package `banzami_flutter`) is consumed
by multiple products: the Consumer app, the Banzami-powered Doa app, future
Banzami apps, and partner integrations. Historically some payment UI/logic
leaked into `apps/mobile` (e.g. a bespoke payment-link screen with its own
confirmation and receipt). That guarantees drift: each app re-implements "the
same" payment moment slightly differently.

A code audit (2026-06-25) confirmed the SDK already owns P2P, Payment Request,
Handle-pay, QR and the Receipt, and that the dependency direction is clean
(SDK never imports an app; apps import only the public barrel). Three gaps
remained: an app-side payment-link resolver, a non-unified `split_pay` theme,
and a dead `CheckoutScreen`. This ADR formalises the rule and records the
migration that closes those gaps.

## Decision

**The Flutter SDK is the single, autonomous implementation of every payment
flow.** No app may re-implement a payment screen or payment-flow logic.

An app may only:
1. receive a deep link / trigger,
2. open a **public** SDK payment screen with a `client` + identity + callbacks,
3. receive the result via the screen's `onSuccess(Transfer)` / result callback,
4. continue its own navigation (e.g. refresh its home).

## Scope

### The SDK owns (must live in `sdk/flutter/lib/screens` + `widgets` + `theme`)

- Payment confirmation — `BanzamiConfirmScreen` (P2P), `BanzamiPaymentRequestScreen`
  (request / handle-pay / payment-link / QR).
- Payment-link resolver — `BanzamiPaymentLinkScreen` (load + loading/not-found/
  used/expired/cancelled states + hand-off).
- QR payment — `BanzamiStructuredQrPayScreen`, `BanzamiScanScreen`.
- Split pay — `BanzamiSplitPayScreen`.
- Receipt / success / comprovativo — `BanzamiReceiptScreen` (one shared screen).
- Loading / processing / error / invalid states for the above.
- Payment design system — `BanzamiScaffold`, `BanzamiAppBar`, `BanzamiCard`,
  `BanzamiGlassCard`, `BanzamiPrimaryButton`, `BanzamiSecondaryButton`,
  `BanzamiGhostButton`, `BanzamiVerifiedMark`, `BanzamiSandboxBadge`,
  `BanzamiColors`, `BanzamiMotion`, `BanzamiSpacing`, `BanzamiRadius`,
  `BanzamiGradients`, `BanzamiShadows`.

### The app owns (`apps/mobile`)

- Deep-link parsing → calling the right SDK screen (`app.dart`).
- Providing the `ConsumerPublicClient`, the session `ownHandle`, the sandbox
  flag and an `onSuccess` callback (e.g. `WalletRefreshBus.instance.signal()`).
- App-only surfaces that are NOT payment flows (home shell/tabs, profile,
  security/PIN, KYC, onboarding, notifications, merchant tooling).

## Forbidden rules

1. `apps/mobile` MUST NOT define a payment confirmation, receipt, processing,
   success, payment-link resolver, checkout or split-pay screen.
2. `apps/mobile` MUST NOT import an internal SDK file
   (`package:banzami_flutter/screens/…`, `…/widgets/…`, `…/src/…`, etc.) —
   only the public barrel `package:banzami_flutter/banzami_flutter.dart`.
3. `sdk/flutter` MUST NOT import anything from `apps/mobile` / `banzami_mobile`.
4. The Receipt MUST exist exactly once, in the SDK.
5. The payment-link resolver MUST live in the SDK.
6. Dead payment screens MUST NOT remain exported.

## Justified exceptions

- `BanzamiReceiptScreen` uses a raw `Scaffold` (not `BanzamiScaffold`): the
  receipt is the immersive cherry "success moment" and needs a dark background;
  `BanzamiScaffold` forces the light `offWhite`. The dark screen-capture
  security overlays are likewise intentionally dark.
- `BanzamiScanScreen` / the inline scanner in `BanzamiSendScreen` use a raw
  black `Scaffold`: full-bleed camera UI.
- The app constructing SDK screens from `app.dart` and `notification_router.dart`
  is allowed — these are entry points (opening the SDK), not re-implementations.

## Conformant flows (post-migration, proven by code)

| Flow | Confirm | Receipt | Logic owner |
|------|---------|---------|-------------|
| Consumer P2P | `BanzamiConfirmScreen` | `BanzamiReceiptScreen` | SDK |
| Payment Request (`/r/`) | `BanzamiPaymentRequestScreen` | `BanzamiReceiptScreen` | SDK |
| Handle pay (`/u/`) | `BanzamiPaymentRequestScreen` | `BanzamiReceiptScreen` | SDK |
| QR (structured) | `BanzamiStructuredQrPayScreen` | `BanzamiReceiptScreen` | SDK |
| Split pay | `BanzamiSplitPayScreen` | inline success | SDK |
| **Payment Link (Doa)** | `BanzamiPaymentLinkScreen` → `BanzamiPaymentRequestScreen` | `BanzamiReceiptScreen` | **SDK** |

The app only opens these: `app.dart` `_openPaymentLink/_openPaymentRequest/
_openHandlePay/_openSplit` and `notification_router.dart`.

## Previously non-conformant — now resolved

1. `apps/mobile/lib/screens/link_pay_screen.dart` (resolver + mapping in the app)
   → migrated to `sdk/flutter/lib/screens/payment_link_screen.dart`
   (`BanzamiPaymentLinkScreen`); the app file was deleted.
2. `split_pay_screen.dart` kept the old dark immersive theme → unified to the
   light theme using the shared components/tokens.
3. `checkout_screen.dart` was dead (exported, never pushed) and non-conformant
   → file + export removed.

## Migration (done in this change)

- A. `BanzamiPaymentLinkScreen(client, slug, ownHandle, onSuccess, isSandbox,
  logoAssetPath)` created in the SDK; `app.dart` now only pushes it via
  `_openPaymentLink`.
- B. `split_pay_screen` converted to the light theme.
- C. `CheckoutScreen` removed (file + export).
- D. `BanzamiConfirmScreen` / `BanzamiPaymentRequestScreen` NOT merged — kept
  separate (risk to the validated P2P flow); revisit later if needed.

## Acceptance criteria

- `node tools/check-sdk-payment-boundary.mjs` passes (enforces the forbidden
  rules above).
- `flutter analyze` clean; `flutter test` green (app + SDK).
- No payment confirm/receipt/link/checkout/split-pay screen defined under
  `apps/mobile`.
- `apps/mobile` imports the SDK only via the public barrel.
- `sdk/flutter` imports nothing from `apps/mobile`.
- The Receipt and the payment-link resolver exist exactly once, in the SDK.

## Consequences

- Every product (Consumer, Doa, future apps) gets an identical, premium payment
  experience for free; bug fixes and design changes happen once, in the SDK.
- Apps shrink to "open SDK → get result"; payment correctness lives in one place.
- Adding a new payment flow means adding an SDK screen + (optionally) an app
  entry point — never a new app-side payment screen.

## Enforcement

`tools/check-sdk-payment-boundary.mjs` (run via `make check-sdk-payment-boundary`
or `node tools/check-sdk-payment-boundary.mjs`) fails CI if any forbidden rule
is violated.
