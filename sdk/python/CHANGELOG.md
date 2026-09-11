# Changelog

All notable changes to the Banzami Python SDK are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed — hosts and routes

- The default gateway was `https://api.banzami.ao`, which is not Banzami's. The
  key's prefix now picks it: `bz_test_…` → `https://sandbox-api.banzami.com`,
  anything else → `https://api.banzami.com` (`base_url=` still overrides).
- `PaymentLink.checkout_url` built `https://pay.banzami.co/<slug>` — not
  Banzami's either. It is now `https://pay.banzami.com/pay/<slug>`, the hosted
  payer page.

### Removed — `transactions.capture`, `transactions.reverse`

They called `POST /v1/transactions/{id}/capture` and `/reverse`, which the
gateway does not mount (transactions are create, list and get). Every call
answered 404. Give money back with `client.refunds`.

### Documentation

- The README documented `client.transfers.send`, removed with the merchant
  transfer surface; that section is gone.
- `pip install banzami` named a package that is not published (and this
  distribution is `banzami-python`); the README now installs from the
  repository.

### Fixed — AOA money helpers were off by 100

`format_minor`, `to_minor` and `from_minor` treated one AOA minor unit as one
kwanza. AOA minor units are cêntimos (1 Kz = 100), as in the ledger, so every
AOA amount was shown and converted 100 times too large:
`format_minor(5000000, "AOA")` printed `"5.000.000 Kz"` for 50 000 Kz. They now
divide/multiply by 100 like every other currency, and `format_minor` follows the
Banzami display rule (`"50 000 Kz"`, `"50 000,50 Kz"`). The README's amount
comments are corrected to match.

### Removed — `PaymentRequest`, `PaymentRequestStatus` models

The payment-request resource was removed (below), but its models stayed
exported from `banzami` and `banzami.models`, offering a withdrawn feature.
Nothing in the SDK used them; they are gone.

### Documentation — QR and refunds

- The QR section said a payer pays a structured QR from the Banzami app. No
  route pays a structured QR today; the README now says to show a payment
  link's QR (the hosted pay URL) instead.
- The refunds example passed `transaction_id=`, which `refunds.create` does not
  take; it now shows the typed source (`source_type`, `source_id`) and the
  required `idempotency_key`.

### Removed — `payment_requests`

`client.payment_requests` called `/v1/payment-requests`, which the operator
withdrew (RA-057): it let a Business credential name any requester and debit
any payer. Every call answered 404. Consumer-to-consumer requests belong to the
consumer app, not a server SDK.

## [0.1.0] — 2026-05-15

### Added

- **Async-first client** (`BanzamiClient` / `Banzami`) built on `httpx.AsyncClient`
- **Full API surface** across 7 resource namespaces:
  - `transactions` — create, retrieve, list, capture, reverse
  - `qr_payments` — static QR, dynamic QR, decode, check status, mark used
  - `transfers` — send, retrieve, list
  - `payouts` — create, retrieve, list
  - `wallets` — retrieve, balance
  - `merchants` — retrieve, list/create/revoke API keys
  - `webhooks` — list endpoints, register, delete, list events, `construct_event`
- **Pydantic v2 models** for all response types with full type annotations
- **Automatic retry** with exponential backoff via `tenacity` (default: 3 retries, 500 ms base)
- **Idempotency keys** auto-generated on every POST and reused across retries
- **Webhook signature verification** using HMAC-SHA256 (`verify_signature`, `construct_event`)
- **Observability hooks** (`BanzamiHooks`) — `on_request`, `on_response`, `on_error`
- **Cursor-based pagination** via `Page[T]` model and `auto_paginate` async generator
- **Money utilities** — `format_minor`, `to_minor`, `from_minor` with AOA-first formatting
- **Framework examples** — FastAPI, Django, Flask, QR checkout, standalone webhook handler
- **Test suite** — 58 tests, 88% coverage; unit + integration layers using `respx`
