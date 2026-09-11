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
