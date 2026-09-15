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
   holds an opaque blob. Every Consumer call is made server-side by a Next.js
   route handler (the BFF), which re-attaches the Bearer. The BFF does session
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

## Non-goals

Offline payment execution; real money; Live credentials; consumer-facing
environment switching; a device-management product; OTP-based Web onboarding
(the native handle+PIN path is canonical and keeps Web off the auth OTP quota).
