# Domain: Pricing Engine

**Crate:** `banzami-pricing`
**Module:** `core/pricing/`
**ADRs:** Banzami ADR-021 · BANZA ADR-039
**Version:** 1.0

---

## Business Purpose

The Pricing Engine resolves **how much** the operator charges for a payment. It is
the **single place in the entire stack** where a fee percentage or a pricing rule
exists.

This is a hard architectural boundary (CLAUDE.md §1.2, BANZA ADR-035 / Banzami
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

## Scope (Increment 2)

Delivered: the engine, models, the `pricing_rules` config table + provider, and
the test suite. **Not** in this increment (per ADR-021 sequencing): the
Operator-Fee ledger leg on PaymentIntent fulfilment (increment 3), the Application
Settlement application fee (increment 4), SDK surface (5) and app consumers (6).
The hot financial path and the ledger are untouched here.
