# Domain: Pricing Engine

**Crate:** `banzami-pricing`
**Module:** `core/pricing/`
**ADRs:** Banzami ADR-021 · BANZA ADR-019
**Version:** 1.0

---

## Business Purpose

The Pricing Engine resolves **how much** the operator charges for a payment. It is
the **single place in the entire stack** where a fee percentage or a pricing rule
exists.

This is a hard architectural boundary (CLAUDE.md §1.2, BANZA ADR-005 / Banzami
ADR-019). The BANZA protocol and every app, SDK and public API carry only
**references** — `business_category`, `pricing_profile`, `fee_policy_ref` — and
the **resolved minor-unit result**. They never see, choose, compute or receive a
percentage or a rule. Apps observe only the net outcome.

> The protocol asks *"what kind of commerce is this?"*; the operator answers
> *"then the fee is N minor units"*. The reasoning behind N never leaves this
> crate.

---

## What this crate is — and is not

| Is | Is not |
|----|--------|
| Pure, deterministic fee resolution | A ledger writer (posts nothing) |
| Operator policy (percentages, tables) | A protocol concept (no protocol ADR to change a price) |
| Integer minor-unit arithmetic | Float math (never) |
| The fee *amount* + an audit snapshot | The fee *charge* (increment 3 posts the leg) |

The engine **holds no money and performs no ledger work.** It returns a number and
an audit snapshot; a caller decides what to do with it (increment 3 wires it into
the Operator-Fee ledger leg; an Application Settlement uses it for an application
fee on the net).

---

## Architecture

```
  PricingRuleProvider (Postgres)          engine::resolve  (PURE)
        │  load_rules(env)                      │
        ▼                                       ▼
   pricing_rules table  ──rules──▶  resolve(rules, context) ─▶ FeeResolution
   (migration 0070)                                              { fee_minor,
   operator policy ONLY                                            snapshot }
```

- **`engine::resolve(rules, context)`** is a pure function: no clock, no I/O, no
  randomness, no global state. The same inputs always produce the same
  `fee_minor` and the same `FeeSnapshot` — deterministic and idempotent. The
  effective-window check runs against `context.as_of` (caller-supplied), never
  `Utc::now()`.
- **`PostgresPricingRuleProvider`** loads the operator's enabled rules for an
  environment from `pricing_rules`. The engine never touches the database itself,
  keeping resolution pure and testable with an in-memory rule set.

---

## Reference concepts (mirror `~/banza/contracts/fees/`)

| Concept | Meaning | Carries a price? |
|---------|---------|------------------|
| `BusinessCategory` | What kind of commerce (DONATION, MARKETPLACE, …; extensible) | No |
| `PricingProfile` | Commercial tier (STANDARD, PARTNER, NGO, …) | No |
| `FeePolicyRef` | Opaque handle to a commercial policy (`pol_…`) | No |

Both enums are **open**: an unknown value is carried verbatim and resolves to a
**zero fee** until policy is configured — a payment is never blocked because a
category is new.

---

## Fee calculation

```
fee_minor = clamp(
    round( amount_minor × rate_bps / 10_000 , rounding ) + flat_minor,
    min_fee_minor, max_fee_minor
)
```

- `rate_bps` is basis points — **the only percentage in the stack** (200 = 2.00%).
- All intermediates use `i128`; no float ever touches money (ADR-002 / §9.3).
- A fee is never charged on a non-positive amount, and is never negative.
- `RoundingMode`: `HALF_UP` (default), `HALF_EVEN` (banker's), `FLOOR`, `CEIL` —
  stored on the snapshot so a fee is always exactly reproducible.

### Rule matching & selection

A rule matches a context when **every non-wildcard matcher** equals the
corresponding context value (`None`/`NULL` matcher = wildcard). Matchers:
`business_category`, `pricing_profile`, `fee_policy_ref`, `currency`, `country`,
plus the effective window `[effective_from, effective_to)`.

When several rules match, the winner is chosen by:

1. **specificity** — most non-wildcard matchers wins (a DONATION/STANDARD rule
   beats a catch-all);
2. **priority** — higher `priority` breaks a specificity tie;
3. **version**, then rule id — a total, deterministic order.

No matching rule → **fee 0**, `snapshot.rule_id = None`. The caller still posts a
balanced, fee-less entry.

---

## Auditability

Every resolution returns a `FeeSnapshot`: the rule id + **version** that fired,
the components actually applied (`rate_bps`, `flat_minor`, rounding, min/max), the
echoed references, the input amount, the resolved `fee_minor`, the engine version
and the `as_of`. Persisted alongside whatever the fee funds, it makes any charge
re-derivable forever — even after the rule is superseded. Rules are **versioned
and time-bounded**; a price change appends a new version/window, it never rewrites
history.

---

## Invariants

- **INV-PRICING-001** — no float; all money math is integer minor units (`i128`
  intermediates).
- **INV-PRICING-002** — resolution is pure & deterministic: `(rules, context)`
  fully determine `fee_minor` and the snapshot.
- **INV-PRICING-003** — unknown/unpriced combination → fee 0 (safe default), never
  an error or a block.
- **INV-PRICING-004** — the most specific matching rule wins; ties resolved by a
  total order (priority → version → id).
- **INV-PRICING-005** — percentages/rules exist ONLY here and in `pricing_rules`;
  never in the protocol, SDK, apps or any public surface.
- **INV-PRICING-006** — the engine posts to no ledger and holds no money.

---

## Configuration

Rules live in `pricing_rules` (migration 0070), scoped by `environment`
(`LIVE`/`SANDBOX`). Seeding the operator's initial rule set is an operational task
(separate from this increment); with no rules configured every category resolves
to a zero fee.

---

## Operator Fee on capture (Increment 3)

At transaction **capture** (`core/transactions`), the engine resolves the operator
fee from `(amount, currency, business_category, pricing_profile?, fee_policy_ref?,
environment)` and applies it as a ledger movement — invisible to the payer, who
always sees the gross amount.

### Ledger realization — two balanced postings

This ledger is **strictly one DEBIT + one CREDIT per posting** (DB constraint
`uq_ledger_entry_posting_type` on `(posting_id, entry_type)`), so the fee cannot
be a third leg of the settle posting. It is realized as **two balanced postings**
that share the gross reservation:

```text
authorize:  DR transit(gross)      CR wallet:reserved(gross)

capture, posting 1 (key <idem>:capture):
            DR wallet:reserved(net)   CR wallet:available(net)    ← payee NET
capture, posting 2 (key <idem>:capture:fee):
            DR wallet:reserved(fee)   CR operator_fee_revenue(fee) ← operator fee
```

`reserved` is debited `net + fee = gross` (fully cleared); `available` receives
only the **net**; the **operator-fee REVENUE account** receives the fee. No money
is created or destroyed; each posting nets to zero; everything is append-only
(ADR-002). When the fee is 0 there is a single legacy settle posting.

### Operator revenue account

A single internal `AccountType::Revenue` account (`OPERATOR_FEE_REVENUE_ACCOUNT_ID`,
fixed in env, ensured at boot — mirrors the transit/bank system accounts). **Never**
a merchant wallet. The fee is fully auditable/reconcilable in the ledger.

### Persistence, idempotency & audit

Each capture writes one immutable `operator_fees` row (migration 0071): the
resolved `fee_minor`, the references, `pricing_rule_id` + `pricing_rule_version`,
`engine_version`, the immutable `snapshot_json`, and the fee `posting_id`.
`UNIQUE(transaction_id)` + the ledger's idempotent posting keys make a capture
replay a no-op — no double fee, no duplicate posting. A row is recorded even when
the fee is 0 (auditable). `fee > amount` is **rejected** (loud fail; never a
silent clamp, never a negative net). An internal `operator.fee.applied` event is
emitted (tracing; never a public webhook).

### Visibility

The fee is **operator-internal**: no public/SDK/payer surface accepts or returns
it; the payer sees the gross amount; the merchant sees the net in their wallet.
`business_category`/`pricing_profile`/`fee_policy_ref` are not yet accepted on the
public API (a later SDK increment) — until set, every transaction is unpriced and
resolves to a zero fee, so existing behaviour is unchanged.

### Refunds (deferred)

Refunds are **out of scope** for this increment. A future refund must reverse via
**reversal postings** (never mutation), and operator-fee refundability is a policy
decision (default: the operator fee on a refunded payment is non-refundable unless
policy says otherwise; a partial refund reverses a proportional fee). To be
specified when the refund path is implemented.

## Operator Fee vs Application Fee

The Pricing Engine resolves **both** the per-payment **Operator Fee** (this domain,
increment 3 — operator revenue, invisible to the payer) and the deferred
**Application Fee** charged by an app at settlement time (see
[application-settlement](../application-settlement/README.md), increment 4 — the
app's own charge on accumulated net value). Same engine, same `pricing_rules`,
different category/profile and different beneficiary of the fee. Neither exposes a
percentage outside this crate.

## Scope

- **Increment 2 (done):** engine, models, `pricing_rules` config + provider, tests.
- **Increment 3 (done):** Operator-Fee ledger postings on capture, `operator_fees`
  persistence, operator revenue account, real-DB invariant tests.
- **Increment 4 (done):** Application Settlement application fee
  ([core/app-settlement](../application-settlement/README.md)).
- **Increment 5 (done):** the **references** (`business_category` /
  `pricing_profile` / `fee_policy_ref`) are carried on the transaction-creation
  surface end-to-end (gateway → core-api → operator fee) and on the internal
  Application Settlement API; the TypeScript server SDK and Flutter SDK expose the
  reference types. **References only** cross the wire — never a fee, percentage or
  rule; public responses never return the operator fee.
- **Not yet** (per ADR-021 sequencing): app consumers — DOA then
  Mongo/marketplace/crowdfunding (6). The payment-link / QR / collections /
  wallet-payment surfaces and the Flutter client methods are **not** wired for
  refs yet because they settle via the `transfers` (P2P) path, which is not
  operator-fee-bearing; the fee point is the transaction/PaymentIntent fulfilment
  path. The Flutter SDK ships the reference enums for forward-compatibility.
