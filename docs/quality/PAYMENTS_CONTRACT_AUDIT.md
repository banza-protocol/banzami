# Payments Contract Audit — Sessions, Links, Checkout (RT03)

Programme: BANZAMI-SANDBOX-RELEASE-ASSURANCE-001 / Release Train 03
Deployed-state audit of the current contracts BEFORE any implementation change.
Capability status is authoritative in
[`quality/operator-assurance-manifest.yaml`](../../quality/operator-assurance-manifest.yaml).

## Feasibility summary

Payment Sessions/Links function **end-to-end for merchant-JWT holders** (real
core, ledger, proof). **Developer keys cannot reach them** — the ADR-046 dev-key
path mounts only `GET /v1/me`; payment routes require `principal.MerchantID`
which a dev key does not have. Releasing these for external developers requires
the Project→Merchant binding designed in [ADR-047](../adr/ADR-047-project-merchant-binding-for-developer-payment-capabilities.md).
Therefore CAP-PAY-001/002/APP-004 remain **pending-e2e** this train.

## §2 Payment Session contract (deployed)

- **Creator identity / tenant binding:** merchant JWT (`authedActiveMerchant`,
  `payment_sessions.go`); merchant must be ACTIVE; session bound to a
  `wallet_account_id` the merchant owns (core validates ownership).
- **Amount/currency:** `amount_minor` (integer minor units) + `currency`; fixed
  sessions carry an amount, open sessions do not.
- **Idempotency:** per `(merchant, purpose, reference)` tuple — a duplicate
  create returns the existing session (200), no second row.
- **Lifecycle:** `CREATED/ACTIVE → PAID` (atomic; the flip requires status IN
  (CREATED,ACTIVE), so re-pay is idempotent and a terminal session cannot settle
  again). `expires_at` recorded; expiry enforced by the link/QR interfaces.
- **Interfaces:** one PaymentIntent, multiple interfaces (link/QR); one ledger
  result, one proof (ADR-043).
- **Public vs internal fields:** the gateway `safeDTO` exposes session_id,
  wallet_account_id, amount/currency, purpose, reference, status, expires_at,
  interfaces, and (post-payment) `refund_source` (typed, operator extension).
  **Finding:** the core→gateway internal response carries `payment_link_id`,
  `qr_code_id`, `merchant_id` UUIDs; the gateway strips them from the app DTO,
  but the internal contract exposes DB UUIDs unnecessarily (tracked hardening,
  not payer-facing).
- **No leakage:** no `TRANSACTION` token, no Core settlement internals to the app.
- **Scopes (to add with the ADR-047 release):** `payment_sessions:read|write`.

## §3 Payment Link contract (deployed)

- **Creation authority:** merchant JWT; inputs merchant_id + wallet_id + currency.
- **Token:** opaque slug (engine-generated, treated as non-enumerable capability
  token); the payer route is `/public/pay/{slug}`.
- **Amount/currency:** stored and enforced at pay-time; open-amount links accept
  a payer amount, fixed links do not.
- **Lifecycle:** ACTIVE → USED (one-use; `MarkUsed` on first settlement; further
  attempts reject `LINK_NOT_ACTIVE`). Expiry via `expires_at`; disable via
  `DELETE /v1/payment-links/{id}`.
- **Public payer view:** **FIXED in RT03 §4** — now exposes only slug, amount,
  currency, description, status, expires_at, paid_at, merchant_name. It no longer
  leaks merchant/wallet/link UUIDs (was: full struct embed). `refund_source` is
  never on the public view.
- **Scopes (to add with the ADR-047 release):** `payment_links:read|write`.

## §4 Checkout (pay/checkout) security audit

- **Deployed:** pay-frontend (pay.banzami.com), checkout-frontend. Payer flow:
  `GET /public/pay/{slug}` → `POST /public/pay/{slug}/pay` (body: `{amount_minor}`
  only — merchant/wallet derived server-side from the slug, so nothing sensitive
  is client-supplied) → `GET .../status`.
- **CSP:** strict nonce CSP, `frame-ancestors 'none'`, no `unsafe-eval`,
  `connect-src` allow-list.
- **No secrets in client:** no API key / merchant JWT / internal credential in
  the bundle or HTML; `STAGING_GATEWAY_URL` is server-only.
- **FIXED (RT03 §4):** public payer view no longer leaks internal DB UUIDs.
- **Residual (tracked, low):** `merchant_name` relies on React escaping (no
  server-side sanitization) — acceptable for React text rendering; the core→
  gateway internal contract still carries UUIDs (internal only, not payer-facing).
- **Receipt/proof:** `/v1/public/proofs/{ref}` — ref is HMAC-derived, read-only,
  allow-listed fields (ADR-033/040).
- **No Live claims:** checkout shows Sandbox/simulated wording; no real-money rail.

## Release gate

`make assure-payments-foundation` fails until the ADR-047 binding is implemented
and the §5/§6/§7 deployed E2E matrices pass, at which point the three capabilities
move to `released`.
