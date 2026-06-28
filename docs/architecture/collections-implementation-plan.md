# Collections — Banzami implementation plan & status

**Status:** ✅ UNBLOCKED — increment 1 delivered (model + API + events); live
settlement deferred to increment 2.  
**Authority:** BANZA ADR-035 (protocol-first), BANZA ADR-036/037, Banzami ADR-019

Per BANZA ADR-035 the operator implements only what the protocol defines. The
`Collection` (ADR-036) and `PaymentIntent` (ADR-037) concepts are now **Accepted**
in `~/banza`, so the operator implementation is unblocked and proceeds downward
(protocol → operator → SDK → apps).

## Precondition (protocol-first gate)

- [x] **BANZA ADR-036/037 Accepted** — `Collection`, `CollectionShare`,
      `CollectionRule`, `PaymentIntent`, their states, events, and relationship to
      `Transfer` / ledger are ratified, with contracts in `~/banza/contracts/`
      (`collections/`, `payment-intents/`, `openapi/collections.yaml`,
      `events/types.json`) and vectors in `conformance/vectors/collections.json`.

## Delivered — increment 1 (model + API + events)

- **Persistence** (Rust core, `core/collections/`): `collections`, `payment_intents`,
  `collection_shares` tables (migrations `0064`–`0066`); aggregates + extensible
  `CollectionRule` + state machines; runtime-sqlx repository.
- **Invariants** (`INV-COLLECTION-001..008`): no money/ledger on a Collection;
  closed-rule sum == total; **EXACT divisibility, no silent rounding**; sum-mismatch
  + below-minimum rejected; ownership + environment scoping (404, never 403);
  immutable structural fields after OPEN; idempotency. Proven by
  `core/collections/tests/invariants.rs` (7 tests, no DB needed).
- **API** (core `/internal/v1/collections*` + gateway `/v1/collections*`): create,
  get, list, patch, close, cancel, events, shares (create/list), and
  `collection-shares/{id}/surface` (creates the share's PaymentIntent). The gateway
  derives `merchant_id` + `environment` from the merchant principal; the core
  returns 404 on cross-tenant access.
- **Events** via the existing transactional outbox (`core/api/.../webhooks.rs::emit`),
  BANZA-canonical names: `collection.created`, `collection.opened`,
  `collection.share.created`, `collection.share.payment_requested`,
  `collection.partially_completed`, `collection.completed`, `collection.cancelled`,
  `payment_intent.created`.

## Deferred — increment 2 (live settlement) — NOT in this increment

The hook that marks a share **PAID** on a real confirmed Transfer (touching the
transfer engine) is a separate, reviewed increment: `collection.share.paid`,
`payment_intent.paid`, rollup to `collection.completed`, and refunds-per-share
(ADR-030). No share can reach PAID until then — there is no optimistic/simulated
payment. The app-side "Cobrança dividida" prototype stays disabled-by-default
(Banzami ADR-019) until the SDK/UI lands after settlement.

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
