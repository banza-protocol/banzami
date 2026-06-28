# Collections — Banzami implementation plan

**Status:** 🚫 BLOCKED on BANZA ADR-036 (Payment Collections, *Proposed*)  
**Authority:** BANZA ADR-035 (protocol-first), BANZA ADR-036, Banzami ADR-019

This plan describes how Banzami will implement split/group payments **after** the
protocol concept exists. It is intentionally a plan, not an implementation: per
BANZA ADR-035, the operator implements only what the protocol defines, and the
`Collection` concept is still **Proposed** in BANZA ADR-036. No code in this plan
may ship until ADR-036 is **Accepted**.

## Precondition (protocol-first gate)

- [ ] **BANZA ADR-036 Accepted** — `Collection`, `CollectionShare`, `CollectionRule`,
      their states, events, and relationship to `PaymentIntent` / `Transfer` /
      ledger are ratified, and the event/contract additions land in
      `~/banza/contracts/`.

Until that box is checked, the operator builds nothing financial here. The
existing app-side "Cobrança dividida" stays a disabled-by-default prototype
(Banzami ADR-019).

## Operator scope (once unblocked)

Banzami, as the operator, will:

1. **Persist Collections.** A `collections` table + `collection_shares` table,
   keyed to the merchant/payee wallet, totals in integer minor units, mirroring
   the ADR-036 model and states. No balance is held on a collection.
2. **Create shares.** On collection creation, create N `CollectionShare` rows,
   each owning a `PaymentIntent` (reusing the existing payment-link / QR path,
   ADR-006). EXACT divisibility enforced — no silent rounding.
3. **Generate a link/QR per share.** Each share's link/QR derives from its intent.
4. **Reconcile state from real payments.** A share moves `PENDING → PAID` only on
   a confirmed settling **Transfer** (wallet-native payment → atomic double-entry
   ledger posting, ADR-030). Collection rolls up to `COMPLETED` / `PARTIAL` from
   share state. Never optimistic, never simulated.
5. **Emit protocol events.** `collection.created`, `collection.share.paid`,
   `collection.completed`, `collection.partial`, `collection.cancelled` /
   `collection.share.expired` — exactly as ADR-036 / `contracts/` define them.
6. **Issue official receipts** per settled share via the Document Engine
   (read-only, real `transfers` data) — never a fabricated receipt.
7. **Refunds** follow ADR-030 per settled share (source-aware) — not at collection
   level.

## SDK scope

- `@banzami/sdk` (and the other SDKs) expose the operator Collections API as typed
  clients: create a collection, list shares, fetch share status, subscribe to the
  events. The SDK invents no object/field/event beyond the protocol contract.

## App scope

- The merchant app replaces the current pre-protocol split prototype with calls to
  the SDK Collections API. UX only — total, participants, per-person preview, the
  shares list with real per-share status driven by `collection.share.paid`.

## Invariants & guardrails (carried from ADR-036)

- `sum(share.amount_minor) == collection.total_amount_minor`.
- `collected == sum(PAID shares)`; remaining is derived.
- EQUAL_SPLIT with `divisibility=EXACT` rejects non-divisible totals (no silent
  rounding).
- A Collection holds/moves no money; all value movement is ordinary wallet-native
  payment → Transfer → ledger.
- No ledger/settlement primitive is added by the operator.

## Migration from the prototype

- Remove `AppConfig.splitChargeEnabled` and the app-side N-independent-links flow;
  point the merchant split UX at the SDK Collections API.
- Backfill is not required — prototype links were ordinary payment links with no
  persisted grouping.
