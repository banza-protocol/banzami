# Domain: Application Settlement

**Crate:** `banzami-app-settlement`
**Module:** `core/app-settlement/`
**ADRs:** Banzami ADR-021 · BANZA ADR-019
**Version:** 1.0

---

## Business Purpose

Application Settlement lets an **application/platform** pay a **beneficiary** from
net value that has accumulated in an application-controlled wallet, **after a
business event the application decides on**:

- a crowdfunding campaign closes,
- a delivery is completed,
- a marketplace sale is confirmed,
- a billing period ends,
- a service is finalized.

It is **generic**. DOA, Mongo, marketplaces and crowdfunding are all future
*consumers* that differ only in *when* they call it. This crate contains **no
app-specific logic** (no `doa_fee`, no campaign rules).

---

## Operator Fee vs Application Fee — two different things

| | **Operator Fee** (ADR-021 / increment 3) | **Application Fee** (this domain) |
|---|---|---|
| When | per payment, at capture | later, on a business event |
| On | each PaymentIntent/transaction | accumulated NET value |
| Belongs to | the operator (Banzami) | the application/platform |
| Visibility | invisible to payer | the app's own service charge |
| Where | `operator_fees` (0071) | `app_settlements` (0072) |

Both are resolved by the **same Pricing Engine** (`core/pricing`) from references
— so percentages live **only** in `pricing_rules`, never hard-coded. The
application fee uses the `pricing_profile` the operator assigned to the owner
(the gateway resolves it from the merchant's record; ADR-057). A category selects
nothing.

```
payment → Operator Fee → NET into the campaign wallet      (increment 3)
                              │  accumulates over many payments
campaign closes → Application Settlement → Application Fee on the NET → beneficiary
```

---

## Architecture

```
  ApplicationSettlementEngine
    ├── create(req)   — resolve application fee (Pricing Engine), compute net,
    │                   persist CREATED + immutable snapshot. No ledger yet.
    ├── submit(id)    — CREATED -> PENDING (optional)
    ├── complete(id)  — check source funds, post balanced ledger entries, COMPLETED
    ├── cancel(id)    — CREATED|PENDING -> CANCELLED (no ledger)
    ├── fail(id,…)    — CREATED|PENDING -> FAILED   (no ledger)
    ├── get(id)
    └── list_by_owner(owner_ref, env, limit)
```

State machine (BANZA ADR-019): `CREATED → PENDING → COMPLETED | FAILED |
CANCELLED`. `COMPLETED`/`FAILED`/`CANCELLED` are terminal; only `COMPLETED` writes
a ledger posting.

---

## Ledger realization — two balanced postings

The ledger is strictly one DEBIT + one CREDIT per posting, so the settlement is
realized as up to **two balanced postings** sharing the source debit:

```text
posting 1 (key <idem>:settle):  DR source(net)   CR beneficiary(net)
posting 2 (key <idem>:fee):     DR source(fee)   CR application_fee_account(fee)
```

- `source` (the app/campaign **available** account, a LIABILITY) is debited
  `net + fee = gross` — fully drawn down.
- `beneficiary` receives the **net**; the app fee account receives the **fee**.
- `net == 0` skips posting 1; `fee == 0` skips posting 2; `gross > 0` guarantees
  at least one. No money is created or destroyed; each posting nets to zero;
  append-only (ADR-002).

### Source funds

The source must be an **existing** balance. The engine checks
`available = −ledger.balance(source) ≥ gross` before posting; otherwise it rejects
with `InsufficientFunds` and posts nothing. It never debits old payers, never
recomputes the Operator Fee, never touches old PaymentIntents.

---

## Invariants

- **INV-APPSETTLE-001** — `gross = net + application_fee`; `application_fee ≤ gross`;
  no negative fee. Enforced in code **and** by DB CHECK constraints.
- **INV-APPSETTLE-002** — integer minor units only; no float.
- **INV-APPSETTLE-003** — idempotent: `UNIQUE(idempotency_key)` + idempotent
  posting keys (`:settle`/`:fee`); a completed settlement is returned unchanged.
- **INV-APPSETTLE-004** — a `COMPLETED` settlement is immutable; cancel/fail are
  rejected; a later pricing-rule change never alters it (snapshot is pinned).
- **INV-APPSETTLE-005** — every posting is balanced and append-only; the source
  debit total equals the gross.
- **INV-APPSETTLE-006** — the application fee is resolved only by the Pricing
  Engine; no percentage exists in this crate.
- **INV-APPSETTLE-007** (ADR-028, as stated in ADR-057 §4) — when the resolved
  application fee is greater than zero it may only be paid to a **validated
  Business Account**: the fee destination must exist and be `ACTIVE`, be KYB
  `APPROVED`, hold an `ACTIVE` wallet containing the destination account, and be
  classified `APPLICATION`/`PLATFORM` (an operator-only, audited decision; default
  `MERCHANT`). Every condition is evaluated by `evaluate_fee_destination`, which
  both `guard_application_fee_destination` (settlement) and
  `POST /internal/v1/settlement-readiness` call. Fail-closed: an unvetted
  destination is rejected, never rerouted. When the resolved fee is zero no
  destination is required and a named one is not validated. No dedicated
  application-purpose wallet account is required.
- **INV-APPSETTLE-008** (ADR-057) — the application fee is resolved **only** by the
  Pricing Engine, from the `SETTLEMENT` rule of the pricing profile the operator
  assigned (`resolve_settlement_fee`). No caller supplies a rate: the public
  surface refuses `application_fee_bps` and every other pricing field with 400
  `PRICING_FIELD_NOT_ACCEPTED`. *Historical:* under ADR-029 (superseded) an
  app-defined `application_fee_bps` skipped the Pricing Engine (snapshot
  `APP_DEFINED`, bounded at 5000 = 50%); that path is removed from the domain
  request, the route and the engine.

---

## Events (internal)

`application.settlement.created | completed | cancelled | failed` — emitted as
structured tracing events; refs + amounts only, no PII, no percentages. Not public
webhooks.

---

## Refunds / reversals (deferred)

Refunds/corrections are **out of scope** for this increment. A completed
settlement is corrected **only** by a future **reversal posting** (debit/credit
swapped), never by mutation. To be specified when the reversal path is built.

---

## Internal API (Increment 5)

Operator-only surface, reached **only** via the internal `/internal/v1` boundary
(never exposed by the public gateway). The caller supplies **references and
accounts only** — never a fee or a percentage; the application fee is resolved
internally by the Pricing Engine.

| Method & path | Purpose |
|---|---|
| `POST /internal/v1/application-settlements` | create (CREATED) |
| `POST /internal/v1/application-settlements/{id}/complete` | settle → COMPLETED |
| `POST /internal/v1/application-settlements/{id}/cancel` | → CANCELLED |
| `POST /internal/v1/application-settlements/{id}/fail` | → FAILED |
| `GET  /internal/v1/application-settlements/{id}` | fetch |
| `GET  /internal/v1/application-settlements?owner_ref=…` | list by owner |

Create body carries only: `idempotency_key`, `owner_ref`, `source_account_id`,
`beneficiary_account_id`, `application_fee_account_id` (optional),
`gross_amount_minor`, `currency`, and `pricing_profile`.

This is the **internal** API, called by the gateway, which supplies the profile
it resolved from the merchant's own record. The **public** settlement surface
accepts no pricing selector at all — not `business_category`, not
`pricing_profile`, not `fee_policy_ref`.

There is no `rate_bps` / `fee_minor` field anywhere, which this document used to
summarise as "a client can neither choose nor send a fee". The second half was
true and the first half was not: a client that names the reference chooses among
the operator's rates, and the more dimensions a rule pins the higher it ranks. A
selector is a price with extra steps.

## Scope (Increments 4–5)

Delivered: the engine, models, `app_settlements` table (0072), pricing-driven
application fee, balanced postings, idempotency, internal events, real-DB tests
(increment 4); the operator-only internal HTTP API + route test (increment 5).

**Not** in these increments: the app consumers — **DOA first**, then Mongo /
marketplace / crowdfunding — which call this capability and decide *when* to
settle (increment 6); the profile that prices them is the operator's assignment
(ADR-057), never theirs. No
DOA-specific logic exists here by design.
