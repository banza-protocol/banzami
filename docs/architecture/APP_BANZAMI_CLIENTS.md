# App Banzami — clients and environment architecture

Version: 1.0 · WEB-APP-001 (ADR-064)

App Banzami is one Consumer product with **one Flutter codebase** compiled to
three targets. Clients provide access to the same domain; none is a financial
authority.

```
                        Flutter App Banzami
                     (one Consumer codebase)
                               │
                ┌──────────────┼──────────────┐
                ▼              ▼              ▼
               iOS          Android           Web
         (TestFlight)     (Play testing)  app.banzami.com
                                               │
                                     same-origin session / BFF
                                               │
                                     Consumer API (public-api)
                                               │
                                            Banzami Core
                                               │
                                            Ledger
```

Same Consumer identity, `@banza`, wallet and ledger across all three targets.
A `@banza` created on any target resolves from every target; the same handle +
PIN signs in everywhere; a transfer from Web is an ordinary Banzami transfer.
There is no "web wallet", "web consumer" or web handle namespace.

`CONSUMER_UI_SOURCE_UNIVERSE = ONE` · `INDEPENDENT_WEB_UI_IMPLEMENTATION = 0` ·
`PARALLEL_CONSUMER_WEB_UI_IMPLEMENTATIONS = 0`.

## Platform adaptation happens only at the edges

The screens, widgets, design system, navigation, models, formatters and the
`ConsumerPublicClient` are shared source. Only these edges differ per platform;
everything else is identical Flutter code.

| Capability | iOS / Android | Web |
|-----------|----------------|-----|
| UI | **shared Flutter widgets** | **the same shared widgets** |
| Entry point | `main_consumer.dart` | `main_consumer_web.dart` (thin bootstrap) |
| TLS | certificate pinning (`dart:io`) | browser TLS stack |
| Transport | pinned `http.Client` | credentialed `BrowserClient` (`WebSessionClient`) |
| Session credential | Bearer in the platform keychain | **Bearer sealed server-side** in an HttpOnly cookie; the browser holds a worthless sentinel |
| App lock | local PIN + biometrics | none — the cookie is the session; a 401 → Welcome |
| Biometrics | `local_auth` | future WebAuthn / passkeys (not this milestone) |
| QR camera | native `mobile_scanner` | `mobile_scanner` Web (`BarcodeDetector`) + getUserMedia |
| Notifications | APNs / FCM | realtime while open; Web Push later |
| Deep links | `app_links` (native) | HTTPS URLs |
| Crash reporting | Firebase Crashlytics | omitted on Web (no financial data to third parties) |
| System chrome | orientation lock | browser (no-op) |
| Desktop presentation | n/a | centred phone-width surface on a neutral canvas (no device frame) |

The web-only code is small and isolated: `main_consumer_web.dart`,
`lib/platform/web_session_client.dart`, `lib/platform/web_desktop_shell.dart`,
and a handful of `kIsWeb` guards in the shared bootstrap. `WEB_SCREEN_IMPLEMENTATION_FORKS = 0`.

## The Web host (app.banzami.com)

A lean Node host (`apps/app-banzami`, pure Node built-ins) does two same-origin
jobs:

1. **Serves the Flutter Web bundle** with a financial-app CSP (self-hosted
   CanvasKit — no external CDN; `frame-ancestors` limited to the Banzami
   marketing origins), HSTS, `noindex`, and `no-store` on private state.
2. **Is the session boundary** in front of the Consumer API:
   - a **narrow allow-listed** reverse proxy at `/consumer/*` — only the known
     Consumer routes are forwarded, never an arbitrary upstream
     (`WEB_BFF_ARBITRARY_UPSTREAM_PROXY = 0`);
   - **seals the Consumer Bearer** into an HttpOnly, `Secure`, `SameSite=Lax`
     cookie and strips it from the auth response
     (`WEB_CONSUMER_BEARER_VISIBLE_TO_JS = 0`); re-attaches it server-side on
     each forwarded call;
   - **double-submit CSRF** on every write, a pre-auth nonce seeded on the shell,
     the session **rotated at login** (fixation), the cookie **cleared at
     logout**;
   - `/healthz` readiness with no session, consumer, secret or upstream detail.

The host owns session mediation, CSRF and forwarding only — never ledger,
balance or transfer logic. Core remains the sole financial authority; the host
has no financial-table write authority.

## Environment boundary

```
                 App Banzami (iOS · Android · Web)
                            │
                     Consumer domain
                            │
          ┌─────────────────┴─────────────────┐
          ▼                                   ▼
       SANDBOX                              LIVE
    available today                     future / not enabled
    fictitious value                    regulated, fail-closed
```

Client parity is environment-independent; financial authority is
environment-specific. The **host** selects the environment through
`CONSUMER_API_BASE` (Sandbox today) — never the browser, and never baked into
the client bundle. Sandbox and Live financial positions are isolated and never
cross. `WEB_FINANCIAL_LIVE_ENABLED = 0`.

## Realtime and QR

- **Realtime**: balance and activity refresh on focus/visibility and poll while
  visible; the canonical GET is the reconciliation source of truth, so a
  reconnect never duplicates.
- **QR**: the canonical Banzami scheme (`banzami-sandbox:@handle`),
  byte-identical to native, so QRs are scannable across every client.
  `CONSUMER_QR_FORMAT_UNIVERSE = ONE`.

## Applications built on the Developer Platform

Applications using the Developer API participate through payment resources,
webhooks and Wallet Accounts — they never become Consumer identity providers. A
developer can test the Consumer side of a payment using App Banzami Web (a real
Sandbox Consumer), while the deterministic test payer remains for automated
scenarios.
