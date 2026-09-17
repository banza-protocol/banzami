# ADR-066 — App Banzami Web: Dual Product Context (Pessoal + Business), Separate Authority

Status: Accepted (2026-09-17)
Milestone: APP-BANZAMI-WEB-BUSINESS-001

## Context

App Banzami Web (ADR-064, `app.banzami.com`) is a first-class Consumer client
served by a Flutter web build behind a same-origin session BFF (`apps/app-banzami`).
Businesses already have a first-class native experience — "App Banzami Business"
(`apps/mobile/lib/merchant`) — that signs in with `@handle` + PIN and drives the
gateway with a merchant JWT. There was no Business experience on the Web.

We want **one** public Web application at `app.banzami.com` with two first-class
product contexts — **Pessoal** and **Business** — not a second product, not a
`business.app.banzami.com`, not a "Merchant Portal". Crucially, a product context
is **not** an account, and switching context is **not** authentication: Consumer
authority and Business authority are separate and independent.

## Decision

1. **One app, two contexts, separate authority.** The same Flutter web build
   renders either the Consumer shell (root `/`, unchanged) or the Business shell
   (`/business`). The shell is chosen at bootstrap from `Uri.base.pathSegments`
   — the app has no URL router today, and this is the single new path branch
   beyond the existing `/pay/{slug}` sniff. The Consumer root is untouched.

2. **Context switch changes UI, not authority.** *"Switching context changes
   product UI, not identity authority."* Navigating Pessoal ↔ Business never
   converts one identity into the other, never grants authority, and never
   impersonates. A context switch is not authentication, not authorization, not
   account impersonation.

3. **Dual-authority session, one opaque cookie.** The BFF session record becomes
   `v:2`, namespaced:
   ```
   { v:2, csrf, createdAt, lastSeen, clientSurface:'WEB', active_context:'personal'|'business',
     consumer_authority: { bearer, bearerExp, consumerId, handle, displayName } | null,
     business_authority: { bearer, bearerExp, refresh, refreshExp, merchantId, handle, name, environment } | null }
   ```
   The browser still holds only the opaque `bz_app_session` cookie and the
   readable `bz_app_csrf` nonce — no credential of either authority ever reaches
   JS (`WEB_SESSION_AUTHORITY_IN_COOKIE=0`). `v:1` flat records are read
   forward-compatibly as a consumer-only session.

4. **Typed BFF routing, not string matching.** Each allow-list route carries an
   `authority: 'consumer' | 'business'` tag and the BFF attaches
   `session[authority+'_authority'].bearer` and forwards to that authority's
   upstream base (`CONSUMER_API_BASE` = `…/consumer` for Consumer; `BUSINESS_API_BASE`
   = the gateway for Business). A Consumer route can never receive a Business
   bearer and vice-versa (`WEB_BFF_CROSS_CONTEXT_TOKEN_LEAKAGE=0`). Every Business
   route is explicitly allow-listed with its correct auth/CSRF/upstream — the
   BFF is a strict allow-list, never an open proxy.

5. **Reuse the canonical Business auth contract.** Business Web signs in with the
   same `@handle` + PIN → `POST /v1/merchant/auth/token` → merchant JWT + rotating
   single-use refresh token. The BFF holds both server-side in `business_authority`,
   returns the token sentinel to the browser, and — mirroring the native client —
   transparently refreshes the access token via `/v1/merchant/auth/refresh` on an
   upstream 401, updating the stored tokens. No Web-only Business auth is invented;
   no merchant JWT, refresh token, or PIN is ever exposed to the browser
   (`BUSINESS_WEB_BEARER_BROWSER_EXPOSURE=0`, `BUSINESS_WEB_PIN_PERSISTENCE=0`).

6. **Payer routes always belong to Consumer.** Any payer action — a payment-link,
   a Business Receive QR scan, a payer deep link — is Consumer authority, even
   when the Business context is active. A Business Receive QR opens the Consumer
   payer context (`BUSINESS_RECEIVE_QR_OPENS_PAYER_CONTEXT=CONSUMER`); Business
   authority can never pay (`BUSINESS_AUTH_GRANTS_CONSUMER_FINANCIAL_AUTHORITY=0`).

7. **One Flutter product, one QR universe, one Receive Point.** No second
   frontend, no Business-Web QR encoder/parser, no Business-Web receipt fork. The
   Business shell reuses the merchant screens and the canonical `BanzamiQrDisplay`;
   the persistent Business Receive Point (ADR-065) is the SAME across iOS, Android
   and Web — `GET /v1/business/receive-point` returns the same active slug for a
   given Business on every client.

8. **Independent lifecycles.** Consumer and Business authorities expire, log out,
   and are revoked independently. Business-only logout leaves Consumer signed in;
   an expired Business authority drops only `business_authority`. A whole-session
   absolute lifetime and the sealed-at-rest store are unchanged from ADR-064.

9. **Web substitutes for native-only capabilities.** Biometrics (`local_auth`)
   and on-device PIN re-lock are dropped on Web (as the Consumer web already
   forces unlock); the merchant JWT/refresh live in the BFF, not
   `flutter_secure_storage`; receipt PDFs download in the browser instead of
   native share; push/local notifications fall back to the existing polling.

## Rationale

The ADR-064 BFF already hides the Consumer bearer, rotates the session id on
sign-in, seals the store at rest, and enforces CSRF — all authority-count-agnostic.
Extending the record to namespaced authorities and tagging routes is the smallest
change that yields two fully independent authorities under one opaque cookie. A
context switch that only flips `active_context` (or navigates between shells) can
never leak authority because the browser never holds either credential. Reusing
the merchant screens and the Business Receive Point keeps one product, one QR
universe, and guarantees cross-client identity for free.

## Consequences

- The BFF gains a `/business/*` proxy, a business allow-list, business auth
  (token/lookup/refresh/logout) with server-side refresh, and a context endpoint.
- The Flutter web build gains a bootstrap shell branch and a Business provider
  tree (a web merchant session + the merchant `BanzamiClient` over the same
  same-origin `WebSessionClient`, base `/business`).
- Financial Live is unchanged: Business Web is Sandbox-only and fail-closed.
- Rollback isolates Consumer: hiding the Business context or reverting the app
  build leaves the proven Consumer web untouched; backend and schema are
  unchanged (no migration).

## Alternatives considered

- **A separate Business web product / subdomain** — rejected: violates "one App
  Banzami Web" and duplicates the frontend.
- **Two separate opaque cookies** — rejected: one namespaced record is simpler,
  and the seal/cookie/CSRF layers already work unchanged.
- **Selecting the upstream credential by string-matching the path** — rejected in
  favour of an explicit per-route `authority` tag to make cross-context leakage
  structurally impossible.
