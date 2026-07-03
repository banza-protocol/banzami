# ADR-034 — Refund operator surface (typed source alignment)

**Status:** Proposed
**Date:** 2026-07-03
**Type:** Banzami **operator** ADR (NOT a BANZA protocol ADR)
**Deciders:** Fidel Monteiro (Founder)
**Governing protocol:** BANZA ADR-030 (wallet-native payment & refund source model), `~/banza/docs/core/disputes.md`, ADR-002/020 (double-entry), ADR-004 (idempotency), ADR-040 (proof `REVERSED`)

---

## Context

BANZA **defines the refund financial model**; Banzami, as an operator, **implements the
operator-facing surface** (API shape, authorization, statuses, events, webhook
delivery, docs). Per the refund protocol-governance audit (2026-07-03):

- The Banzami **core** already implements BANZA ADR-030 fully — typed refund
  source (`TRANSACTION` a.k.a. `ACQUIRING_PAYMENT` | `WALLET_PAYMENT`),
  source-scoped over-refund ceiling, source-aware double-entry postings, no
  mutation of the original payment, partial refunds, source-scoped idempotency.
  (`core/api/src/routes/refunds.rs`; matrix REF-001 VALIDATED.)
- The **public surface** (gateway `POST /v1/refunds` + the TS/Python/PHP SDKs)
  currently accepts only `transaction_id` and **silently defaults the source
  type to `TRANSACTION`**. It therefore **cannot express a wallet-native
  (`WALLET_PAYMENT`) refund**, and it lets a caller submit an ambiguous request
  whose source type is inferred from an arbitrary identifier.

This is an operator-surface defect, not a protocol change: BANZA already mandates
the typed source (ADR-030 §2). This ADR aligns the Banzami surface with it.

**Nothing in this ADR is a BANZA protocol or interoperability contract.** The
Banzami refund route, request/response shape, status enum and `refund.completed`
event are **operator-local** and MUST NOT be documented as BANZA protocol until a
future BANZA ADR/RFC formally adopts them.

---

## Decision

### 1. Governing split (unchanged, restated)

- **BANZA protocol (invariants):** refund is a balanced compensating posting
  against a **typed captured source**; source-scoped ceiling (`Σ refunds ≤
  captured`); source-scoped idempotency; source-aware credit (acquiring →
  transit; wallet-native → payer wallet); original payment never mutated; partial
  refunds permitted. Banzami MUST NOT weaken these.
- **Banzami operator (this ADR):** the request/response shape, source-type
  vocabulary exposed publicly, authorization, status vocabulary, event names and
  webhook delivery.
- **Application (DOA/apps):** refund UX and business workflow within the above.

### 2. Operator request model (public gateway + SDKs)

`POST /v1/refunds` (merchant-authenticated) MUST require an **explicit typed
source** — no inference from an arbitrary id:

| Field | Required | Rule |
|-------|----------|------|
| `source_type` | yes | `ACQUIRING_PAYMENT` \| `WALLET_PAYMENT` (ADR-030 §2). `TRANSFER` is never accepted. |
| `source_id` | yes | UUID of the typed source object. |
| `amount_minor` | yes | integer > 0 (partial allowed within ceiling). |
| `currency` | yes | ISO-4217 3-letter code; the **authoritative** refund currency is the source's currency (core-derived). |
| `idempotency_key` | yes | non-empty; scopes replay. |
| `reason` | no | free text. |

The public vocabulary is the **ADR-030 canonical names**. `ACQUIRING_PAYMENT` is
mapped, explicitly and server-side, to the core's equivalent `TRANSACTION`
source; `WALLET_PAYMENT` maps 1:1. This mapping is **bounded and validated** — it
is not a silent default.

### 3. Rejections the operator surface MUST enforce

- missing `source_type` → `MISSING_FIELD`
- unknown `source_type` (anything other than the two) → `INVALID_SOURCE_TYPE`
- `TRANSFER` (or any transfer id) as a source → rejected (unknown type, or
  source-not-found at the core)
- `source_type`/`source_id` mismatch → source-not-found at the core
- non-captured / ineligible source → `INVALID_TRANSACTION_STATUS` /
  `INVALID_PAYMENT_STATUS`
- over-refund (beyond the source ceiling) → `REFUND_EXCEEDS_CAPTURED`
- invalid currency (bad format) or amount (≤ 0) → `INVALID_CURRENCY` / `INVALID_AMOUNT`
- unauthorized initiator → `UNAUTHORIZED` (no merchant principal) /
  `REFUND_NOT_AUTHORIZED` (wallet payment owned by another merchant)

### 4. Initiator policy (Sandbox, this phase)

A refund may be initiated **only by the authenticated merchant that owns the
source**. Wallet-native refunds are authorized to the owning merchant at the
core. Operator-admin and dispute-driven restitution are separate flows and out of
this ADR's scope.

### 5. Statuses (operator-local)

`PENDING → SUCCEEDED` (terminal) with `PROCESSING`/`FAILED` reserved. These are
**operator-local**, NOT protocol states, and are not documented as such.

### 6. Compatibility decision

**Clean break — no legacy `transaction_id`-only inference.** Refunds never went
live (public badge `Em validação contínua no Sandbox`) and there is no known live
Sandbox refund consumer (DOA's Banzami provider is initiate-only). A caller MUST
send `source_type` + `source_id`. If future bounded compatibility is ever needed,
it will be an explicit, server-validated mapping — never a silent inference.

---

## Explicitly supported scope (this phase)

- Refund an **eligible captured source only** (`CAPTURED`/`SETTLED` transaction;
  `COMPLETED` wallet payment).
- **Partial refunds** only while the cumulative amount stays within the
  source ceiling.
- Refunds remain **immutable compensating postings**; the original
  transaction/wallet-payment is **never mutated**.
- Repeated requests are **idempotent** (same key → original result, no second
  posting).
- Source-aware credit: acquiring → transit; wallet-native → payer's wallet.

## Explicitly undecided / out of scope (intentional)

The following are **NOT** decided here and MUST NOT be implied by any
documentation until decided (some may require a BANZA ADR/RFC — protocol-first):

- **Post-settlement refunds** — behavior after a settlement batch completes.
- **Fee treatment on refund** — whether/how the operator fee is reversed and who
  bears it. No refund fee policy is promised.
- **Refund deadline / time limit.**
- **Refund cancellation / re-reversal** (no refund state machine beyond the
  immutable posting).
- **Cross-operator / federation refunds.**
- **Protocol webhook/event contract** — `refund.completed` stays operator-local;
  not a BANZA event.
- **Protocol refund state machine** — none is claimed.
- **Persisted canonical source-type token** — the source type is persisted as
  `TRANSACTION` with `ACQUIRING_PAYMENT` accepted as a bounded input alias. The
  canonical-token normalization (`TRANSACTION → ACQUIRING_PAYMENT`) is **deferred
  pending a BANZA clarification** and MUST NOT be data-migrated yet.

---

## Restitution allocations — shared source-scoped ceiling (Core implemented; held for review)

The protocol (`~/banza/docs/core/disputes.md:52`) mandates that the **combined**
value of refunds + dispute restitution against one captured source never exceeds
the captured amount. Today the refund ceiling sums only `refunds`, and dispute
restitution posts to the ledger outside that aggregate → an over-restitution
path. This ADR makes a single, authoritative, source-scoped ceiling the law for
**every** value-returning path.

### Separate objects preserved
`refunds` stay refund objects; `disputes` stay dispute objects, each with their
own operator/API semantics. Neither is the ceiling aggregate. A new **internal,
never-publicly-exposed** allocation ledger is the single ceiling source.

### `restitution_allocations` (internal Core only)
```
id               uuid pk
source_type      text  CHECK (TRANSACTION | WALLET_PAYMENT)   -- alias token; canonical deferred
source_id        uuid
origin           text  CHECK (REFUND | DISPUTE | REVERSAL)
origin_id        uuid                     -- FK → refunds.id / disputes.id / reversal id
amount_minor     bigint CHECK (> 0)
currency         text                     -- authoritative, copied from the source
idempotency_key  text
posting_id       uuid  NOT NULL           -- balanced double-entry posting reference
created_at
UNIQUE (origin, origin_id)
UNIQUE (source_type, source_id, origin, idempotency_key)      -- source-aware idempotency
INDEX  (source_type, source_id)                               -- ceiling aggregate key
```

**Synchronous, `SUCCEEDED`-only (no status column).** Restitution is fully
synchronous this phase: a committed allocation **is** the success; a rejected or
failed operation **rolls back**, leaving no allocation and no posting. There is
**no `PENDING` and no `FAILED`** financial allocation state — the mere existence
of a committed row is the succeeded fact. Operational error reporting (if any)
lives **outside** this table (logs/metrics), never as a financial allocation row.
`PENDING`/reservation semantics require a future async ADR that defines their
accounting effects.

### The one Core primitive (all paths call it)
`apply_restitution(source_type, source_id, amount, origin, origin_id, currency, idempotency_key)`:
```
BEGIN;
  pg_advisory_xact_lock(hashtext(source_type), hashtext(source_id::text));  -- serialize this source; released at commit
  -- source-aware idempotency: existing (source_type,source_id,origin,key) →
  --   verify request matches (source, origin, amount, currency, initiator/authz);
  --   match → return original; mismatch → 409 IDEMPOTENCY_KEY_CONFLICT
  -- resolve+validate TYPED source (reject TRANSFER/unknown; require captured/eligible; authorize owner)
  -- reject supplied currency != source currency → 422 CURRENCY_MISMATCH
  already := SUM(amount_minor) FROM restitution_allocations WHERE source_type=$1 AND source_id=$2;
  IF already + amount > captured THEN ROLLBACK → 422 RESTITUTION_EXCEEDS_CAPTURED;
  INSERT balanced posting (acquiring: DR merchant / CR transit; wallet: DR merchant / CR payer)
       + one restitution_allocations row;
COMMIT;   -- releases the advisory lock
```
Refund creation and dispute `WON_BY_CONSUMER` both route through this. The
check-and-insert is one transaction under the advisory lock → no TOCTOU, **no
app-side arithmetic, no non-transactional check-then-insert.** Concurrency is
correct for refund+refund, refund+dispute, dispute+dispute, and concurrent
idempotent retries.

**Surface error-code preservation.** The primitive's ceiling rejection is
surfaced by each caller with its own historical code, so no operator-facing
contract shifts: the refund path returns the existing `422 REFUND_EXCEEDS_CAPTURED`;
the dispute path never rejects on the ceiling (it caps to the remaining and posts
the capped amount, per the outcome table below). `IDEMPOTENCY_KEY_CONFLICT` (409)
and `CURRENCY_MISMATCH` (422) are shared across callers.

### Currency (authoritative = source)
Request `currency` is a **validation assertion only**. Core resolves the
authoritative currency from the captured source and **rejects** any request whose
supplied currency differs (`422 CURRENCY_MISMATCH`). No SDK/gateway/app selects a
refund currency.

### Proof state
- Partial restitution → source proof stays **`CONFIRMED`**.
- Cumulative restitution = captured → proof becomes **`REVERSED`**.
- **No `PARTIALLY_REVERSED`** state is invented (not in `contracts/proofs/`).
- Fix the current bug where `MarkReversed` fires on every (incl. partial) refund;
  mark `REVERSED` only when the source is fully reversed.

### Dispute outcome / restitution policy (explicit operator decision)
The ceiling is protocol-mandated; the *meaning* of a dispute result is operator
policy:

| Prior returned A vs captured C, consumer wins | Restitution | Outcome + reason |
|---|---|---|
| A = C (fully refunded) | **0** | `WON_BY_CONSUMER`, reason `ALREADY_MADE_WHOLE` |
| 0 < A < C (partially refunded) | **C − A** | `WON_BY_CONSUMER`, reason `PARTIALLY_REFUNDED_NET_SETTLED` |
| claim > remaining (C − A) | capped to **C − A** | `WON_BY_CONSUMER` (excess never posted) |
| A = 0 | **C** | `WON_BY_CONSUMER` |

A dispute can be **won with zero or partial financial restitution** — the
liability outcome is distinct from the amount still owed. The dispute record
carries `outcome`, `restitution_amount`, `reason`, and links to the allocation.

### Disputes must be source-typed
`disputes` gain `source_type`/`source_id` (backfilled `TRANSACTION`/`transaction_id`)
so dispute restitution flows through the same source-scoped primitive. `disputes`
also gain `restitution_amount_minor`/`restitution_reason` to record the outcome.

### Implementation status (Core complete — held; not committed/applied/deployed)
- **Migrations:** `db/migrations/0096_restitution_allocations.sql`,
  `0097_disputes_source_typed.sql` (not yet run against any environment).
- **Core primitive:** `core/api/src/routes/restitution.rs` (`apply_restitution`,
  `mark_proof_fully_reversed`; all runtime `sqlx::query`, no `.sqlx` regeneration).
- **Callers refactored:** `refunds.rs::create()` (origin `REFUND`, reject-over-ceiling),
  `disputes.rs::open()` (source-typed insert) + `resolve()` (origin `DISPUTE`,
  cap-to-remaining).
- **Tests:** `refunds_disputes_tests.rs` — 31 real-DB `#[sqlx::test]` cases pass
  (18 pre-existing + 13 new ceiling/currency/idempotency/concurrency/proof/
  separation cases).
- **Not touched this phase:** gateway typed-source, SDK refund surface, public
  refund endpoints, refund webhooks/events wiring beyond existing, DOA flows,
  public docs, badges. Refund E2E not started.

---

## Consequences

- The public surface can express both refund source classes correctly and can no
  longer produce an ambiguous request.
- The gateway/SDK change is additive to the already-VALIDATED core; no core
  financial behavior changes.
- Refund docs stay `Em validação contínua no Sandbox` until the surface
  alignment and the controlled Sandbox E2E pass and are reviewed.

## Alternatives considered

1. **Keep `transaction_id` + silent `TRANSACTION` default.** Rejected — cannot
   express wallet-native refunds; produces ambiguous requests (ADR-030 §2
   violation at the surface).
2. **Accept `transaction_id` with an implicit source type for compatibility.**
   Rejected — silent inference is exactly what ADR-030 forbids.
3. **Require explicit typed source (clean break).** Accepted.
