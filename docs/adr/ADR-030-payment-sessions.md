# ADR-030 — Payment Sessions (operator implementation of BANZA ADR-043)

**Status:** Accepted · **Date:** 2026-06-30 · **Implements:** BANZA ADR-043 (Payment Session standard) · **Builds on:** ADR-021, ADR-027, ADR-029, ADR-042

> Version: 1.0

> **Protocol reconciliation.** The Payment Session is now ratified at the protocol
> level in **BANZA ADR-043** ("Payment Link, QR and Deep Link are interfaces; the
> Payment Session — a PaymentIntent — is the financial object"). This ADR is the
> **Banzami operator implementation** of that standard. The earlier framing of this
> document as "operator-level orchestration, not a protocol concept" is superseded:
> the concept is protocolar (BANZA ADR-043); Banzami is the first operator to
> implement it. The API contract and phases below remain the operator's
> implementation of the BANZA standard.

---

## Context

An app like DOA needs **two ways to collect money into a campaign**:

- a **payment link** to share on WhatsApp / Facebook / Instagram;
- a **dynamic QR** for lives, events, TV, posters, churches, conferences.

Today these are two separate operator primitives. An app that wants both has to
create a payment link AND a QR, track two ids, and reconcile two confirmation
paths — and nothing guarantees both land in the same place. That invites exactly
the failure this operator exists to prevent: an app stitching financial plumbing
together itself.

There must be **one financial object**; the link and the QR are just **interfaces**
to it.

## Is this a BANZA protocol concept?

**No — it is operator-level orchestration, and stays in Banzami.** A Payment
Session introduces **no new financial invariant and no new way money moves**: value
still moves through the existing payment engine and credits an existing **wallet
account** (ADR-042). A session merely *bundles* primitives the protocol already
defines (wallet account + payment link + QR) under one id and lifecycle. Per the
protocol-vs-operator rule (CLAUDE.md §Protocol-first, BANZA `BANZA-PROTOCOL-VS-
OPERATOR-POLICY`), bundling existing primitives is operator product behaviour, not
a new protocol primitive. So this is a Banzami ADR, not a BANZA ADR. If a future
need introduces a genuinely new wire/ledger behaviour, *that* part opens a BANZA ADR.

## Decision

Introduce a **Payment Session** — the single entry object for collecting money.
(DOA's "Donation Session" is a Payment Session; "donation" is a use-case, not a new
type. The concept is generic so any operator app — NGO, ticketing, crowdfunding,
streaming, events — reuses it.)

```
Campaign
   │
   ▼
Campaign Wallet Account (ADR-042, segregated)
   │
   ▼
Payment Session  ──────────────┐
   │                           │
   ├── Payment Link            │  two interfaces,
   └── Dynamic QR              │  one destination
                               ▼
                        Payment Engine
                               ▼
                   Campaign Wallet Account
```

A Payment Session **binds**:
- a destination **wallet_account_id** (the only place money lands),
- a **payment link** and a **dynamic QR**, both routing to that wallet account,
- an optional amount, a currency, an **expiry**, a **status**, and metadata.

Both interfaces resolve to the same session → the same wallet account → the same
payment engine → the same **receipt, proof, and webhook**. There is exactly **one
financial flow**; the interface is a presentation detail.

### API contract (app → operator)

```
POST   /v1/business/payment-sessions
GET    /v1/business/payment-sessions/{id}
GET    /v1/business/payment-sessions/{id}/qr     ?format=png|svg|pdf
GET    /v1/business/payment-sessions/{id}/link
```

Create request:
```json
{
  "wallet_account_id": "<campaign account>",   // destination (required)
  "amount_minor":      null,                    // null ⇒ payer chooses
  "currency":          "AOA",
  "expires_at":        "2026-12-31T00:00:00Z",  // optional
  "reference_type":    "DOA_CAMPAIGN",
  "reference_id":      "campaign_123",
  "metadata":          { "title": "…" }
}
```
Response (one object, all interfaces):
```json
{
  "session_id":        "...",
  "wallet_account_id": "...",
  "status":            "ACTIVE",
  "payment_link":      "https://pay.banzami.com/s/...",
  "deep_link":         "banzami://pay/...",
  "qr_payload":        "...",
  "qr_image_url":      "/v1/business/payment-sessions/{id}/qr",
  "currency":          "AOA",
  "amount_minor":      null,
  "expires_at":        "...",
  "created_at":        "..."
}
```

### Routing (both interfaces, one engine)

When a payer pays — by link **or** by QR — the operator resolves the session to its
`wallet_account_id` and the payment engine **credits that campaign account** (the
ADR-042 routing already validates: belongs to the wallet, ACTIVE, currency match).
Then: receipt issued, transaction proof recorded, `payment.completed` (+
`payment_link.paid` for the link interface) emitted — **identical regardless of
interface**. A future unified `payment_session.paid` event may be added.

### App responsibilities (binding)

The app **creates** the session and **shows** the link + QR. The app **never**
generates a financial QR, computes a balance, moves money, settles, or writes the
ledger (Golden Rule, ADR-028). The QR image is **always** rendered by the operator
(PNG/SVG/PDF, brand-styled) — never by the app.

### Settlement is unchanged

At close, the campaign wallet account is settled via the app-defined Application
Settlement (ADR-029): fee → `@doa`, net → beneficiary. The session only governs
*money in*; settlement governs *money out*. Both source the same wallet account.

## Consequences
- One destination, one reconciliation, one receipt/proof/webhook contract — for
  both link and QR. No app stitches financial flows.
- Reusable: every operator app gets "collect by link or QR" for free.
- Requires the operator to (a) let a **payment link route to a wallet account**
  (today only QR does — ADR-042), and (b) render QR in PNG/SVG/PDF server-side.

## Implementation phases
1. **Operator:** `payment_sessions` table; bind payment link + dynamic QR to a
   wallet account; **payment-link → wallet_account routing at pay time**; the 4
   routes; server-side QR rendering (PNG/SVG/PDF).
2. **SDK:** `createPaymentSession` / `getPaymentSession` / `getPaymentSessionQr` /
   `getPaymentSessionLink` (aliased `createDonationSession` for clarity).
3. **DOA:** on activate → `createWalletAccount(CAMPAIGN)` + `createPaymentSession`;
   campaign page shows link + QR (copy link, download PNG/SVG/PDF); `/campaign/{id}/
   live` realtime page; settlement webhooks (ADR-029).
4. **E2E (sandbox):** create campaign → wallet account → session → pay by link AND
   by QR → both credit the same account → receipts/proofs/webhooks → close → settle
   (5% @doa / 95% beneficiary) → account 0 → ledger balanced → DOA shows SETTLED.

## Alternatives considered
- **Two independent objects (link, QR):** rejected — no guaranteed shared
  destination; double reconciliation; invites app-side financial logic.
- **A new BANZA protocol primitive:** rejected — no new invariant/wire behaviour;
  it is orchestration of existing primitives (operator scope).

## Related
ADR-027/042 (Wallet Accounts), ADR-029 (app-defined settlement), ADR-028 (Business
Account). DOA contract: `docs/doa/settlement-contract.md`.
