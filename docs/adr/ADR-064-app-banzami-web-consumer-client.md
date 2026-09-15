# ADR-064 — App Banzami Web: First-Class Consumer Client and Cross-Client Identity

Status: Accepted (2026-09-15)
Milestone: WEB-APP-001

## Context

App Banzami is one Consumer product. Until now its only clients were the native
iOS and Android apps (`apps/mobile`, consumer flavor), talking to the Consumer
API (`services/public-api`, reached at `sandbox-api.banzami.com/consumer`). The
public website (`banzami.com`) showed only a static demo of the app's screens.

We need a real, usable Banzami experience in the browser — not a throwaway demo,
and not a Sandbox-only toy that would be discarded when Financial Live is
authorized. The decision is to build **App Banzami Web** as a first-class client
of the same Consumer domain, hosted at `app.banzami.com`, currently connected
only to the authorized Public Sandbox.

## Decision

1. **One Consumer domain, three client surfaces.** Web joins iOS and Android as a
   client of the same Consumer identity, `@banza` namespace, wallet, Core and
   ledger. There is no "web wallet", "web consumer", or web handle namespace. A
   transaction from Web is an ordinary Banzami transaction; a `@banza` created on
   any client resolves from every client; the same handle + PIN signs in
   everywhere. Cross-client compatibility is automatic because every client uses
   the same credential store and Core — no linking, no migration, no duplicate
   accounts.

2. **Reuse the Consumer API verbatim.** The Web client uses `public-api`
   `/consumer/v1/*` (auth register/token/logout, `/me`, wallet balance, activity,
   `/consumers/{handle}`, search, `/transfers`). No Web-specific financial
   endpoints, no Project keys, no direct database access. Registration is
   handle + PIN (`/v1/auth/register`), the same path the native app uses; the
   backend grants one ledger-backed Sandbox balance per consumer.

3. **A thin BFF holds the credential.** The Consumer API issues a Bearer token.
   That token never reaches the browser. It lives AES-256-GCM-encrypted inside an
   HttpOnly, `SameSite=Lax` session cookie, opened only on the server; the browser
   holds an opaque blob. Every Consumer call is made server-side by the BFF host, which re-attaches the
   Bearer. The BFF does session
   mediation, CSRF, and Consumer-API forwarding — never ledger, balance or
   transfer logic. Core remains the sole financial authority. The BFF has no
   financial-table write authority.

4. **Client parity is environment-independent; financial authority is
   environment-specific.** The Web architecture is App Banzami software, not
   "Sandbox software". Environment differences live behind explicit configuration
   (`CONSUMER_API_BASE`) and the backend's authority boundaries. There is no
   hard-coded Sandbox business logic, no demo consumer type, no fake balance.

5. **The homepage hosts the real app; the security boundary holds.**
   `banzami.com` is marketing; `app.banzami.com` is the authenticated financial
   application; `developers.banzami.com` is the Developer Platform;
   `admin.banzami.com` is the operator plane. The homepage may frame or launch the
   real Web app, but framing is allowed ONLY from the Banzami marketing origins
   (CSP `frame-ancestors`), never an arbitrary site.

6. **Financial Live is out of scope and fail-closed.** This milestone enables no
   real money path. `LIVE_REAL_MONEY_PATHS_ENABLED=0`; Financial Live is
   NOT READY / FAIL-CLOSED. The same client architecture is prepared for a future,
   separate Live authorization/security/regulatory gate without being replaced.

## Domains and origins

```
banzami.com            marketing / institutional
app.banzami.com        App Banzami Web — authenticated Consumer application (this ADR)
developers.banzami.com Developer Platform (Console, Docs, API Explorer)
admin.banzami.com      operator plane (BANZADMIN)
sandbox-api.banzami.com/consumer   Consumer API (public-api)
```

## Amendment (2026-09-15) — one Flutter codebase, three targets

The *client* decision was revised during implementation. App Banzami Web is NOT a
separate React/Next reimplementation of the Consumer UI. It is the **existing
Flutter Consumer app** (`apps/mobile`, consumer flavour) compiled to the Web
target (`flutter build web -t lib/main_consumer_web.dart`). One Consumer UI
implementation serves iOS, Android and Web; there is no parallel web UI, no second
design-token set, and no independent web wallet logic.

- `CONSUMER_UI_SOURCE_UNIVERSE = ONE`; `INDEPENDENT_WEB_UI_IMPLEMENTATION = 0`.
- The evaluated React/Next Consumer app was **retired** (`PARALLEL_CONSUMER_WEB_UI_IMPLEMENTATIONS = 0`).
  Its BFF/session/CSRF pattern carried over — now as a lean Node host, not Next
  route handlers.
- **Platform adaptation happens only at the edges** (see
  `docs/architecture/APP_BANZAMI_CLIENTS.md` for the adapter matrix). The shared
  core is the screens, widgets, design system, navigation, models, formatters and
  the `ConsumerPublicClient`. Only initialisation and transport differ:
  - native pins TLS with `dart:io`; Web uses the browser TLS stack (a plain
    credentialed `BrowserClient` — `main_consumer_web.dart`);
  - native stores the Bearer in the platform keychain; **Web never holds the
    Bearer** — the same-origin BFF seals it in an HttpOnly cookie and the browser
    receives a worthless sentinel (`WEB_CONSUMER_BEARER_VISIBLE_TO_JS = 0`,
    `WEB_FINANCIAL_AUTH_LOCAL_STORAGE = 0`);
  - native re-locks with a local PIN / biometrics; on Web the session authority is
    the cookie, so there is no local PIN re-lock (a native affordance) — a 401
    returns to Welcome. Biometrics are native-only; WebAuthn/passkeys are the
    future Web equivalent, not part of this milestone.
- The BFF is a **narrow allow-listed forwarder** at `/consumer/*` (only the known
  Consumer routes; no arbitrary upstream — `WEB_BFF_ARBITRARY_UPSTREAM_PROXY = 0`),
  with double-submit CSRF on writes, session rotation at login, and cookie
  clearing at logout. It is pure Node built-ins; it holds no financial-table write
  authority.
- The host also serves the compiled Flutter bundle same-origin with a
  financial-app CSP (self-hosted CanvasKit — no external CDN; `frame-ancestors`
  limited to the marketing origins). One reproducible build definition
  (`apps/app-banzami/build-web.sh`) is shared by CI and the Docker image and fails
  closed on an unknown environment.

This strengthens, rather than changes, the ADR's identity and security decisions:
one Consumer universe, the Bearer never in the browser, Core the sole financial
authority, Financial Live fail-closed.

## Consequences

- A returning consumer needs only `app.banzami.com`; the marketing page is not a
  prerequisite. The app is directly addressable and bookmarkable.
- Developers gain an interactive human-payer surface for Sandbox integration
  testing (a real Consumer), complementing — not replacing — the deterministic
  test payer used by automated scenarios.
- The Bearer never touching the browser, plus per-request nonce CSP, CSRF, and a
  strict frame-ancestors allowlist, gives a financial-grade web posture.
- Cross-environment isolation is preserved: Sandbox balances can never become
  Live balances; a future Live UX is a deliberate, separately-authorized design.

## Alternatives considered

- **A Sandbox-only demo app** — rejected: it would be discarded at Live and would
  fragment the Consumer product into "web" vs "app" concepts.
- **Browser calls the Consumer API directly with the Bearer** — rejected: a
  reusable financial token in the browser (localStorage or JS-readable cookie) is
  a credential-theft surface. The BFF keeps it server-side.
- **A new Web-specific Consumer service** — rejected: it would duplicate Core
  business logic and create a second financial authority. The BFF is a forwarder.
- **A separate React/Next Consumer web app** — built as a proof, then rejected and
  retired: a second UI implementation would drift from the native app and double
  the maintenance of every Consumer screen. Compiling the existing Flutter app to
  the Web target keeps one Consumer UI universe.

## Non-goals

Offline payment execution; real money; Live credentials; consumer-facing
environment switching; a device-management product; OTP-based Web onboarding
(the native handle+PIN path is canonical and keeps Web off the auth OTP quota).
