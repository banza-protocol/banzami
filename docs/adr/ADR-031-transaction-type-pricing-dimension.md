# ADR-031: Transaction-type pricing dimension for operator fees

**Status:** Accepted (design) — implementation in increments
**Date:** 2026-07-01
**Authors:** Banzami Engineering
**Extends:** Banzami ADR-021 (Operator Fee, Pricing Engine & Application Settlement)
**Implements (protocol):** BANZA ADR-039 (Generic Fee & Application-Settlement Architecture)
**Related:** ADR-002 (Double-entry ledger) · ADR-019 (Protocol-first product development) · [BANZA-PROTOCOL-VS-OPERATOR-POLICY](https://github.com/banza-protocol/banza/blob/main/docs/governance/BANZA-PROTOCOL-VS-OPERATOR-POLICY.md)

---

## Context

Banzami's Pricing Engine (ADR-021) resolves every operator fee from
`pricing_rules`, matching a `PricingContext` by **`business_category` + `currency`
+ effective window**, with `priority`/`version` as tiebreakers. This is the right
shape for **commerce/application settlements**, where a payment carries a business
category (DONATION, ECOMMERCE, MARKETPLACE, …).

It does **not** model fees that depend on the **kind of transaction** rather than
the merchant's business category:

- wallet → wallet transfer,
- personal P2P QR,
- personal payment link,
- generic merchant payment,
- wallet withdrawal.

These are transaction *types*, orthogonal to `business_category`. Operators
routinely price them differently (e.g. free P2P, a small merchant-payment rate, a
withdrawal rate). Today they cannot be expressed cleanly: overloading
`business_category` with a transaction type (as a stop-gap) cannot represent a
payment that has BOTH a business category (ECOMMERCE) AND a transaction type
(merchant_payment), and no flow builds such a context anyway.

**Boundary check (why this is a Banzami ADR, not a BANZA one).** Per
BANZA-PROTOCOL-VS-OPERATOR-POLICY, *"Fees and pricing (subject only to
`INV-STL-001` gross = net + fee)"* are **operator policy**. A new pricing-engine
matching dimension introduces **no** new wire-contract field, manifest capability,
certification criterion, interop rule, or invariant change — it is purely how the
operator selects one of its own fee rates. It therefore stays in the operator and
needs no protocol ADR. Fees produced by these rules remain ordinary Operator Fees
(BANZA ADR-039) and continue to satisfy `INV-STL-001`.

## Decision

Add an **optional `transaction_type` dimension** to the Pricing Engine — a new
matching key alongside `business_category` and `currency`. It is nullable and
backward-compatible: existing rules (with `transaction_type = NULL`) keep matching
exactly as before.

### Model

- `pricing_rules.transaction_type TEXT NULL` — a stable operator-defined label
  (`wallet_transfer`, `consumer_qr`, `personal_payment_link`, `merchant_payment`,
  `wallet_withdrawal`, …). Reference only, never a price (mirrors `business_category`).
- `PricingRule.transaction_type: Option<String>` and
  `PricingContext.transaction_type: Option<String>` in `core/pricing`.
- `rule_matches`: a rule with `transaction_type = Some(t)` matches only a context
  whose `transaction_type == Some(t)`; a rule with `None` matches any (unchanged
  behaviour). Same one-directional rule already used for `business_category`/`currency`.
- `specificity()` gains `+1` when `transaction_type.is_some()`, so a
  transaction-type-specific rule wins over a generic one; `priority`/`version`
  remain the final tiebreakers. Selection stays a total, deterministic order.

No invariant changes. `resolve()` stays a pure function. Fees still post through
the Operator Fee primitive (ADR-021 §), so `INV-STL-001` (`gross = net + fee`) and
double-entry are untouched.

### Rollout (phased)

- **Phase 1 — Engine + admin (this ADR, additive, no behaviour change).**
  Migration adds the column; `core/pricing` + core route `RuleBody` + admin-api
  audit + BANZADMIN form accept `transaction_type`. Existing flows are unaffected
  (nothing builds a context with a transaction_type yet). The five SANDBOX rules
  created for the operator are re-tagged with their `transaction_type`.

- **Phase 2 — Per-flow wiring + ledger (separate increments, one flow at a time).**
  Each money flow builds a `PricingContext { transaction_type, currency, amount }`,
  calls `resolve()`, and — when the fee is non-zero — posts it as an Operator Fee
  (existing ledger path), never as ad-hoc balance math. Order of least risk:
  1. `merchant_payment` (0,25%), 2. `wallet_withdrawal` (0,75%), 3. transfer/QR/link
  (0% — verify no fee is posted and the resolution is "free", not "unpriced").
  Each flow ships with real-DB tests asserting the fee amount and a balanced ledger.

### Scope guard

`transaction_type` is operator-internal. It is NOT added to any webhook/QR/event/
federation wire contract. If a future need arises to expose the transaction type
on a shared surface, THAT change would require a BANZA ADR — this one does not.

## Consequences

- Operators can price by transaction type without abusing `business_category`.
- Fully backward-compatible: null `transaction_type` = today's behaviour; the
  commerce rules (donation/marketplace/…) are unaffected.
- Fees remain Operator Fees within `INV-STL-001`; no protocol surface changes.
- Cost: one nullable column, a matching clause, and per-flow wiring in Phase 2.

## Alternatives considered

- **Overload `business_category`** with transaction types — rejected: cannot carry
  both a business category and a transaction type; muddies the reference concept.
- **A separate fee table per transaction type** — rejected: duplicates the engine,
  loses the single resolution path (ADR-021's core principle: everyone *calls* the
  engine, no one re-implements pricing).

## Rollback

Phase 1 is additive: disable the transaction-type rules (`.../disable`) and/or
leave `transaction_type` NULL — the engine behaves exactly as before. The column
is nullable and unused by any flow until Phase 2 wires it, so it can sit dormant.
