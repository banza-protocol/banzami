# Changelog

All notable changes to the Banzami Python SDK are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-05-15

### Added

- **Async-first client** (`BanzaClient` / `Banzami`) built on `httpx.AsyncClient`
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
- **Observability hooks** (`BanzaHooks`) — `on_request`, `on_response`, `on_error`
- **Cursor-based pagination** via `Page[T]` model and `auto_paginate` async generator
- **Money utilities** — `format_minor`, `to_minor`, `from_minor` with AOA-first formatting
- **Framework examples** — FastAPI, Django, Flask, QR checkout, standalone webhook handler
- **Test suite** — 58 tests, 88% coverage; unit + integration layers using `respx`
