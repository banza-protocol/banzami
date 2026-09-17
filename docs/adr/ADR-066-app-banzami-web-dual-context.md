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

## Shell-universe classification (CONSUMER_BUSINESS_WEB_SHELL_UNIVERSE=ONE)

Recorded as part of APP-BANZAMI-WEB-BUSINESS-001 final evidence closure. The
Consumer and Business web experiences are **one shell universe**, not two
products. "One" is defined structurally — same public application, same Flutter
build, same design system, same navigation/product identity, same responsive
shell architecture — and explicitly **not** as pixel-identical desktop chrome.

Evidence:

- **One public application, one Flutter build.** A single entry point
  (`apps/mobile/lib/main_consumer_web.dart`) is compiled once
  (`apps/app-banzami/Dockerfile`: `flutter build web -t lib/main_consumer_web.dart`)
  and chooses the context at runtime from `Uri.base.pathSegments`: `/business…`
  boots the Business shell, every other path boots the Consumer root. There is no
  second project, bundle, or subdomain.
- **Same design system.** Both shells render exclusively through
  `banzami_flutter` (BanzamiColors / BanzamiTextStyles / BanzamiPrimaryButton /
  BanzamiSecondaryButton / BanzamiQrDisplay / themed `NavigationBar`). The
  merchant button design-system guard (`apps/mobile/test/merchant/
  button_design_system_test.dart`) forbids raw Material buttons in `lib/merchant`,
  so the Business context cannot drift onto a different button/system.
- **Same navigation/product identity.** Both are bottom-tab shells under the "App
  Banzami" identity — Consumer via `_FloatingTabBar`
  (`apps/mobile/lib/screens/main_screen.dart`), Business via `NavigationBar`
  (`apps/mobile/lib/merchant/web/business_shell.dart`) — with a centred content
  column on wide viewports and full-bleed on narrow.
- **Same shared client transport.** Both use the same-origin `WebSessionClient`
  over the one opaque-cookie BFF; neither holds a credential in JS.

The **only** difference is desktop chrome: the Consumer desktop wraps the app in
a phone device-shell (`apps/mobile/lib/platform/web_desktop_shell.dart`, pure
presentation — bezel/notch/safe-areas, no product state), while the Business
desktop centres a 640-max application column without the bezel. That is a framing
choice within the same responsive architecture, which the invariant expressly
permits; it is not a separate layout/product shell. **No fix required.**

Verdict: **CONSUMER_BUSINESS_WEB_SHELL_UNIVERSE=ONE.**

### Update (APP-BANZAMI-WEB-DUAL-SHELL-001) — one web shell, outer switcher

The Business web now renders inside the **same** `WebDesktopShell` framed-phone
presentation as the Consumer web (previously it rendered as a bare centred column).
`business_web_app.dart` wraps its `MaterialApp.builder` in `WebDesktopShell(child:)`,
identical to `app.dart`. So on wide web both apps show the same centred device frame
on the neutral canvas; on narrow web both go full-bleed; native is untouched.

The Personal↔Business switch now lives **only in the outer web shell** — a segmented
"Pessoal | Business" control rendered by `WebDesktopShell` **above** the phone frame
(never inside the app viewport), reflecting the active app and hard-navigating between
`/` and `/business`. All in-app cross-app switches were removed: the business login's
"Ir para a conta Pessoal", the business profile's "Mudar para Pessoal", and the
consumer profile's web-only "App Banzami Business" context row. The two apps remain
distinct (separate routes, auth, screens); the switch is a shell/host concern, so the
app screens stay faithful to native mobile (which has no such control).

### Update (APP-BANZAMI-WEB-DUAL-APP-PARITY-001) — the web runs the ACTUAL native Business app

The `/business` context now boots the **actual** native `BanzamiMerchantApp` root —
the same `merchant/app.dart`, the same `MerchantWelcomeScreen` → `MerchantLoginScreen`
(handle + PIN) → `MerchantMainScreen` (Início / Histórico / Receber / Perfil), the same
`MerchantSessionService`, and the same Inter design system as iOS and Android — inside
`WebDesktopShell`, exactly as `/` boots the real `BanzamiApp`. The earlier Web-specific
Business product (`merchant/web/business_web_app.dart`, `business_login_screen.dart`,
`business_shell.dart`, `business_charge_screen.dart`, `merchant_web_session.dart`) — a
parallel reimplementation of the screens — is **deleted in its entirety**
(`BUSINESS_WEB_SEPARATE_APP_IMPLEMENTATION=0`, `BUSINESS_WEB_DUPLICATE_PRODUCT_UI=0`,
`BUSINESS_WEB_USES_NATIVE_BUSINESS_APP_ROOT=PASS`). `main_consumer_web.dart` now calls
`runApp(BanzamiMerchantApp(pinnedClient: WebSessionClient()))` for `/business`.

This is the same "actual mobile app inside a shell, only the transport edge differs"
pattern Consumer already proved. The web-specific behaviour lives **only** as
platform adapters, all guarded by `kIsWeb` (a compile-time `false` on native, so the
branches are tree-shaken away and the shipped native app is provably unchanged):

- **Session (`MerchantSessionService`).** On Web it stores a worthless sentinel
  access token + a far-future expiry + **no** refresh token and **no** device PIN
  hash — the real merchant JWT and rotating refresh live only in the BFF, which owns
  renewal (item 5). `route` is signed-in ⇒ Home / else Welcome (no device lock,
  which does not exist in a browser). Identity persists in the same
  `flutter_secure_storage` web backend the Consumer uses.
- **Transport.** `buildBusinessClient` uses base `/business/api` (the BFF) over the
  credentialed + CSRF `WebSessionClient`, instead of the pinned gateway client.
- **Identity source on sign-in.** The BFF echoes the non-secret `merchant_id` in the
  sanitized token body (the id already exposed at `/session/state`), so the SAME
  native sign-in screen resolves identity there on Web (the JWT is a sentinel the
  browser cannot decode); native still reads it from the JWT claim.
- **Receipts** download in the browser via a `receipt_share.dart` conditional-import
  adapter (native keeps the OS share sheet); **push/FCM** is skipped on Web.

The outer "Pessoal | Business" switcher renders with an explicit bundled `Inter`
family inside a transparent `Material` — without the family it fell back to Roboto
(unbundled on Web → blank/tofu) and without a `Material` ancestor Flutter painted a
yellow "missing-Material" double-underline; both are fixed
(`WEB_SWITCH_VISIBLE_TEXT_RENDERING=PASS`). Permanent source guards in
`apps/app-banzami/test/architecture-guards.test.mjs` lock all of the above: native
root on Web, zero replica files, no browser-stored credential, visible switcher text.
