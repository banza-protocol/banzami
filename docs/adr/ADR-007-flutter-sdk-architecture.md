# ADR-007 — Flutter Mobile SDK Architecture

**Status:** Accepted  
**Date:** 2026-05-13

---

## Context

Banzami needs a mobile integration layer for consumer-facing P2P payments. The SDK must:
- Be embeddable in third-party merchant apps (checkout, POS).
- Work as a standalone consumer wallet app.
- Cover the full payment lifecycle: check balance, send, receive (QR display), scan-to-pay.
- Be maintainable by Banzami engineering without duplicating UI across multiple native codebases.

The candidate approaches were:
1. Native iOS (Swift) + Native Android (Kotlin) — two separate codebases.
2. React Native — JavaScript runtime, large bundle, bridge overhead.
3. Flutter — single Dart codebase, compiled to native ARM, no bridge overhead.

---

## Decision

**Build the mobile SDK in Flutter with a host-app integration model.**

Flutter was chosen because:
- **Single codebase** covers iOS and Android with pixel-perfect rendering.
- **No bridge overhead** — Dart compiles to native ARM; financial UI is not degraded by JS-thread contention.
- **Widget composability** allows shipping individual screens (`BanzamiSendScreen`, `BanzamiReceiveScreen`, `BanzamiScanScreen`, `BanzamiHomeScreen`) that host apps can embed directly via `Navigator.push`, without taking ownership of the full app shell.
- **Banzami's engineering team** converges on one mobile language rather than maintaining two.

**Package structure:**

```
sdk/flutter/
  lib/
    banzami_sdk.dart     ← single barrel export
    client/              ← BanzaClient (HTTP), BanzaApiException
    models/              ← Consumer, WalletBalance, Transfer, QrCode, …
    utils/               ← formatMinor()
    widgets/             ← BanzamiButton, BanzamiAmountInput, BanzamiQrDisplay, BanzamiQrScanner, BanzamiTransferItem
    screens/             ← BanzamiHomeScreen, BanzamiSendScreen, BanzamiReceiveScreen, BanzamiScanScreen
    theme/               ← BanzaColors, BanzaTextStyles, BanzaSpacing, BanzaRadius, BanzaTheme
```

**Integration contract:** Host apps provide `BanzaClient` (configured with `baseUrl` + `apiKey`) and consumer identity (`consumerId`, `walletId`). All screens accept an `onSuccess` callback and call `Navigator.pop` internally — the host app retains full navigation ownership.

**Money handling:** All monetary values are passed and stored as integer minor units throughout. `formatMinor(int, String)` handles display formatting: AOA uses integer kwanzas ("5 000 Kz"), other currencies divide by 100 and use `Intl.NumberFormat`. Floating-point arithmetic is never used for money (CLAUDE.md §10.3).

**QR scanning:** `mobile_scanner ^5.2.3` (camera-based, no ML dependency). A single-shot guard (`_scanned` boolean) prevents double-processing if the camera reads the same code twice.

---

## Alternatives Considered

**React Native:** Rejected because of JS bridge overhead in UI-heavy flows (QR scanner, camera preview) and the need to ship separate JS bundles per host app.

**WebView-based SDK:** Rejected because it cannot access the camera natively without custom plugins and degrades the payment UX significantly.

**Native iOS + Android:** Rejected due to engineering cost — maintaining two separate codebases for identical payment flows doubles testing and review burden without any technical benefit.

---

## Consequences

- Host apps must add Flutter as a dependency (via `flutter_module` or as a pub package). This is a non-trivial addition for existing native apps; documented in the SDK README.
- The SDK's `BanzaTheme.light` must be applied at the `MaterialApp` level. If the host app uses its own `ThemeData`, it must merge or wrap the Banzami theme for SDK screens.
- `mobile_scanner` requires camera permissions in `AndroidManifest.xml` and `Info.plist`. The SDK README documents the required entries.
- The SDK has no offline capability — all operations require network access to the gateway. Offline queuing is deferred to a future release.
