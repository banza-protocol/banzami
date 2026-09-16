# ADR-065 — Business Receive Point (persistent receive QR, fresh session per payment)

Status: ACCEPTED (operator-local; no BANZA protocol change)
Date: 2026-09-16
Milestone: BUSINESS-RECEIVE-POINT-001
Version: 1.0

## Context / problem

A Business (e.g. `Doa-Sandbox · @doa`) needs a **stable, printable receive QR** —
"here is my Banzami QR, you can pay me." Today the Business "Receber" screen shows
only a decorative icon, because:

- A Business `@banza` is **not** a Consumer P2P destination. Core's P2P handle
  resolver is consumer-only (`core/consumer-wallets/src/repository.rs:find_by_handle_for_routing`),
  and that rule stays.
- The old static merchant QR rail (`/v1/qr/static` → `/v1/qr/pay`) was withdrawn
  (RA-053). It stays withdrawn.

Banzami already has **one** QR universe — `BanzamiQrScheme` (scheme), `BanzamiQrParser`
(parser), `BanzamiQr`/`BanzamiQrDisplay` (renderer) — shared by Consumer and Business.
We must give Business a real receive QR **inside that one universe**, without a
second protocol and without making a Business handle P2P-payable.

## Decision

Introduce an operator-local domain object, the **Business Receive Point**: a stable,
public, opaque payment-entry identity owned by one eligible Business Account. Its QR
is a new **artifact type inside the existing `BanzamiQrScheme`** — not a new scheme.

> **The QR is persistent. The Payment Session is not.**

Scanning the receive-point QR **pays nothing directly**. It resolves a public
identity; the payer then enters an amount and the platform mints a **fresh Payment
Session** (existing ADR-043 engine) for that single payment. Every payment gets its
own session identity and idempotency boundary; the receive point is reused forever
while ACTIVE.

```
Business Account ──owns──▶ Business Receive Point ──mints──▶ Payment Session (N, fresh)
   (institution)            (stable public identity)          (per-payment lifecycle)
```

## Rejected approaches

- **Direct Business `@banza` P2P** — a Business handle is not a Consumer P2P
  destination and must not become one (`CORE_BUSINESS_HANDLE_P2P_RULE_CHANGED=0`).
- **Revive `/v1/qr/static`** — RA-053 withdrew it deliberately; not reversed
  (`RA_053_WITHDRAWAL_PRESERVED=PASS`).
- **One permanently reusable Payment Session** — a session is transactional
  lifecycle state, never a permanent recipient identity; a PAID/EXPIRED/CANCELLED
  session is never reset for the next payer.
- **A Business-only QR protocol** — Banzami has one QR format/parser/renderer
  universe; the receive point is another artifact *type*, not another protocol.

## Public artifact & QR semantics

- Canonical builder added to `BanzamiQrScheme`: `businessReceivePoint(slug)` →
  `banzami://pay/business/{slug}` (env implicit in the resolving gateway, like
  `payLink`). Payer-facing web form: `https://pay.banzami.com/b/{slug}`.
- Parsed by the existing `BanzamiQrParser` into a typed `BanzamiQrBusinessReceivePoint{slug}`.
- The slug is an **unguessable opaque public id** (≥128 bits, base62). It carries
  **no** internal ids (no Business/wallet/owner/binding/Project UUID, no key).
- Rendered with the canonical `BanzamiQrDisplay`. No Business painter.

## Authority model

The slug is **public, not a secret** (`RECEIVE_POINT_SLUG_AS_SECRET=0`). Security is:
server-side current-state resolution + payer authentication + explicit confirmation
+ Core authority. The client never submits the financial destination
(`CLIENT_SELECTED_BUSINESS_DESTINATION_AUTHORITY=0`); the server resolves the
Business from the slug at both resolve and session-creation time.

## Lifecycle

`ACTIVE | DISABLED | RETIRED`. Exactly **one ACTIVE** receive point per Business
Account, provisioned **idempotently** and race-safely on Business activation (or
lazily on first receive request), never per app launch, never Project-dependent,
never DOA-special. Resolve and session-creation both re-check current Business
eligibility, so a stale printed QR fails closed if the Business is later
suspended/ineligible/disabled. Creating/disabling/resolving a receive point has
**zero ledger effect**; only the minted Payment Session reaches Core.

## Payment-session minting

`resolve` is read-only (no money, no reservation, no ledger). A session is created
**only after** the payer submits an amount (scan alone never creates a session —
`SCAN_ALONE_CREATES_PAYMENT_SESSION=0`). Session creation is idempotent per request
key; distinct intentional payments use distinct keys → distinct sessions. Amount
validation, review, confirmation, execution, receipt and events all reuse the
existing Payment Session pipeline (`RECEIVE_POINT_PAYMENT_EXECUTION_PATH=EXISTING_PAYMENT_SESSION`).

## Security / abuse / observability

Opaque random slugs (no sequential ids). Public resolve + session-create reuse the
existing payer/public rate-limit controls. Bounded telemetry:
`receive_point_resolve{,_invalid,_disabled}`, `receive_point_session_created{,_failed}`
— never PINs, keys or payer PII. Operator lifecycle changes are audited; routine
scans are telemetry-only.

## Sandbox / Live boundary

Sandbox only, fictitious money. No Financial Live change; Live stays
NOT_READY / fail-closed. The receive-point resolution and session inherit the
platform environment; a sandbox QR never mints a live session.

## Compatibility

Additive: a new artifact type + a new table + new read/create endpoints. Consumer
and Web scanners gain one parser case and one resolve→amount flow; existing handle /
payment-request / payment-link / split artifacts are untouched. `payLink` (amount
charge) and "Criar cobrança" remain a separate, coexisting UX.

## Consequences

Merchants get a real, printable, canonical receive QR without a second QR protocol,
without Business-handle P2P, and without reviving the withdrawn static rail. The
cost is one new operator object + endpoints + a parser/renderer case + a consumer
resolve→amount→session flow, all inside the one Banzami QR universe.
