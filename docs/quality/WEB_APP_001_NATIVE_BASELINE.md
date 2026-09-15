# WEB-APP-001 — Native App Banzami baseline

> The authority for the current Consumer product experience is the running native
> app (`apps/mobile`, consumer flavor) and the Consumer backend it talks to
> (`services/public-api`). App Banzami Web must be a **first-class client of the
> same Consumer domain**, not a reinterpretation. This document records what the
> native client and its backend actually do today, so the Web client reproduces
> the product rather than inventing one.

Version: 1.0

## 1. Product model (canonical)

App Banzami is **one Consumer product** with three client surfaces — iOS, Android
and (this milestone) Web. There is one Consumer identity, one `@banza` namespace,
one wallet per currency, one Core, one ledger. A client is an access surface, never
a financial authority.

## 2. Consumer backend — the API the Web client reuses

The native consumer app calls the **public-api** service. Base URL (from
`apps/mobile/lib/config.dart`):

- Sandbox: `https://sandbox-api.banzami.com/consumer`  (edge → `public-api`)
- The `/consumer` path prefix is required at the edge; internally the service serves `/v1/*`.

Confirmed live path shape (2026-09-15): `GET /consumer/v1/consumers/{handle}` → 200
(public); `/consumer/v1/me`, `/consumer/v1/consumers/search` → 401 without a Bearer.

### 2.1 Auth — handle + PIN (no OTP)

`services/public-api/internal/handler/auth.go`:

- `POST /v1/auth/register` — body `{ handle, display_name?, pin }`. Creates the
  Consumer, auto-provisions an **AOA** wallet, and (Sandbox only) grants a **one-time
  10,000 Kz** registration balance through the canonical ledger path
  (`SandboxCreditConsumer`, 1_000_000 minor units, "registration-grant", one per
  consumer). Returns `{ consumer, token, expires_at, token_type: "Bearer" }`.
  Handle: 3–30 chars, lower-cased. PIN: 4–8 digits. Errors: `HANDLE_TAKEN` (409).
- `POST /v1/auth/token` — body `{ handle, pin }` → verifies and issues a Bearer JWT
  (`consumerTokenTTL = 24h`). PIN never returned.
- `POST /v1/auth/logout`.

There is a richer `/v1/consumer/onboarding/{start,verify-otp,complete}` OTP flow, but
**the native consumer app registers via `/v1/auth/register` (handle+PIN)** — that is
the canonical client path, and the one the Web client mirrors. This keeps Web
registration off the shared authentication OTP quota.

### 2.2 Consumer data & money

- `GET /v1/me` — the authenticated consumer.
- `GET /v1/me/wallet`, `GET /v1/me/wallet/balance` — wallet + balance (minor units).
- `GET /v1/me/activity` — canonical activity/history.
- `GET /v1/consumers/{handle}` — resolve a `@banza` (public).
- `GET /v1/consumers/search?q=` — search (auth).
- `POST /v1/transfers` — P2P send. `GET /v1/transfers`, `GET /v1/transfers/{id}`.
- `GET /v1/me/push-topic` — realtime/push topic for the consumer.
- Pay surfaces: `GET /v1/payment-links/{slug}`, `GET /v1/consumer-pay-links/{code}`,
  plus QR pay handlers.

Authorization is a **Bearer token**. On Web this token must live **server-side** in
the BFF session (never in the browser / localStorage), per §25/§32.

## 3. Client experience (consumer flavor)

Screens (`apps/mobile/lib/screens`): `splash`, `onboarding/{welcome, create_account,
setup_pin, login}`, `main_screen` (shell), `history_screen`, `receive_hub_screen`,
`profile_screen`, `pin_screen`, `kyc_screen`, `notifications_screen`,
`security_screen`, `help_screen`.

Bottom navigation (`main_screen.dart`): **Início · Histórico · Receber · Perfil**.
**Send** is a primary action on Home (not a tab). Receive is the QR hub.

Onboarding flow: Welcome → Create account (choose `@handle` + display name) → Set PIN
→ (register, auto-grant) → Home. Login is `@handle` + PIN.

## 4. Visual language (parity source)

- **Font: Inter** (bundled `assets/fonts/Inter-*.ttf`; `google_fonts: Inter`). The
  theme applies `fontFamily: 'Inter'` globally (`app.dart`). → Web uses Inter.
- **Palette** (official Banzami, inline across screens): primary `#B5101F`, dark
  `#9A1B22`, coral `#E8434B`, `#D7242E`, tint `#FBD2D0`; splash gradient
  `#B5101F → #D7242E → #E8434B → #9A1B22`. Amber sandbox banner `#FFF4D6/#F6C453/#92400E`.
- **Money format**: the canonical "50 000 Kz" — space thousands separator, `Kz`
  suffix, no cents (see `project_money_format_standard`; the web already ships
  `apps/website/components/MoneyAmount.tsx` + `lib/money.ts`, reusable for parity).
- Icons: Material rounded (home/history/qr_code/person). PIN pad is custom.

Colors are defined inline per screen in the native app — there is **no shared token
file** today. WEB-APP-001 §8 requires `CONSUMER_DESIGN_TOKEN_DRIFT=0`, so the Web
client establishes the canonical token source (`docs/design/CONSUMER_DESIGN_SYSTEM.md`
+ a small tokens module) rather than hand-copying hex values.

## 5. Environment truth

Native config: `ENVIRONMENT=sandbox` → `sandbox-api.banzami.com`. There is no staging
host. Financial Live is **NOT READY / FAIL-CLOSED**; all value is fictitious. The Web
client is App Banzami software currently connected only to the authorized Sandbox
environment — not "Sandbox software".

## 6. Implications for App Banzami Web

1. Reuse `public-api` `/consumer/v1/*` verbatim — no Web-specific financial endpoints.
2. A thin **BFF** (Next.js route handlers) holds the Bearer token in an encrypted,
   HttpOnly, SameSite session cookie; the browser never sees it. CSRF on writes.
3. Registration/login = handle + PIN → same account, same `@banza`, same wallet on
   every client (cross-client compatibility is automatic because all clients use the
   same credential store + Core).
4. One registration grant per consumer, from the backend — the Web client never
   writes balance.
5. Inter + cherry palette + "50 000 Kz" + Início/Histórico/Receber/Perfil for parity.
