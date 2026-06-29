# ADR-021: Operator Fee, Pricing Engine & Application Settlement (operator implementation)

**Status:** Accepted (design) — implementation in increments
**Date:** 2026-06-29
**Authors:** Banzami Engineering
**Implements:** BANZA ADR-039 (Generic Fee & Application-Settlement Architecture)
**Related:** BANZA ADR-037 (PaymentIntent) · ADR-036 (Collections) · ADR-002 (Double-entry ledger) · Banzami ADR-019 (Protocol-first product development) · [BANZA-PROTOCOL-VS-OPERATOR-POLICY](https://github.com/banza-protocol/banza/blob/main/docs/governance/BANZA-PROTOCOL-VS-OPERATOR-POLICY.md)

---

## Context

BANZA ADR-039 ratified the generic fee/settlement architecture at the protocol
level: the reference concepts (`BusinessCategory`, `PricingProfile`,
`FeePolicyRef`) and the two primitives (**Operator Fee**, **Application
Settlement**). The protocol carries references + lifecycle only — **percentages
and pricing rules are operator policy**. This ADR records how the Banzami
operator implements that protocol downward (ADR-019: protocol → operator → SDK →
apps), with the Pricing Engine owning every number.

## Decision

Implement the protocol concepts in the Rust financial core, with the Pricing
Engine as an operator-owned module that the rest of the core *calls* and never
re-implements.

### 1. Pricing Engine (operator-owned)

A new `core/pricing` crate. Pure, deterministic, side-effect-free resolution:

```
resolve(business_category, pricing_profile?, fee_policy_ref?, country, currency, …)
   → fee_minor (integer minor units)
```

- The **only** place percentages/tables/rules exist in the whole stack. Driven by
  operator-policy configuration (a versioned, auditable rule set), never
  hard-coded in callers.
- Unknown `BusinessCategory` / unpriced combination → **0** (safe default); the
  ledger still posts a balanced, fee-less entry.
- Returns integer minor units (no float; ADR-002 / §9.3). Resolution is logged
  with the *inputs and the result*, never as a payer-visible field.

### 2. Operator Fee (per PaymentIntent fulfilment)

When a PaymentIntent (ADR-037) is fulfilled and the Transfer posts to the ledger,
the core adds **one balanced leg** to the *same* posting (`core/ledger` +
`core/transactions`):

```
posting {
  credit payee_wallet           amount_minor - fee_minor   (net)
  credit operator_fee_account   fee_minor                  (Operator Fee leg)
  …debit side of the transfer…
}   // sums to zero (ADR-002)
```

- `fee_minor` comes from the Pricing Engine; the fee is **irreversible** (a posted
  ledger entry — corrected only by a reversal posting, never mutated).
- Persisted as an `operator_fee` record (per the protocol `OperatorFee` contract):
  `payment_intent_id`, `posting_id`, `amount_minor`, the references, `created_at`.
- **Never** surfaced by any public API/SDK/UI. Only operator-internal dashboards
  read it. Emits the operator-internal `operator.fee.applied` event (outbox).

### 3. Application Settlement (deferred app→beneficiary)

A new `core/app-settlement` capability + `/admin`/operator APIs:

- Operates on net value already in an application-controlled wallet (e.g. a
  campaign wallet, a seller balance). The application **initiates** it (now / on
  campaign close / on delivery / period end — app policy).
- On COMPLETED, produces its **own** balanced posting moving
  `amount_minor − application_fee_minor` to the beneficiary and (optionally)
  `application_fee_minor` to an application-fee account. The application fee is
  resolved by the **same** Pricing Engine and is **distinct** from the Operator
  Fee. Computed on the **net** (post-operator-fee) value, never the gross.
- Lifecycle per the protocol `ApplicationSettlement` state machine; emits
  `application.settlement.created|completed|failed`.

### 4. Wire surface

Payment initiation (PaymentIntent / payment links / QR) accepts only
`business_category` + optional `pricing_profile` / `fee_policy_ref`. The public
API/SDK **never** accept or return an operator fee or a percentage. The net result
is what apps observe.

### 5. DOA as the first consumer

DOA reuses the mechanism with **no DOA-specific protocol code**:

```
Donation → PaymentIntent (business_category=DONATION) → Transfer → Ledger
           (Operator Fee leg)  →  net into the campaign wallet (immediately)

Campaign closes → Application Settlement (campaign wallet → beneficiary,
                  minus the DOA application fee on the net)
```

Mongo (settle on delivery), marketplaces (settle on sale), crowdfunding
(KWYR = settle now / AON = settle on success) reuse the identical primitives,
differing only in *when* the Application Settlement fires.

## Boundaries

- **Percentages live only in `core/pricing`** (operator policy). Never in `~/banza`,
  never in the SDK, never in apps.
- **Ledger untouched invariants** (ADR-002): append-only; the fee is one ordinary
  leg; settlements are later separate postings; no entry is ever mutated/deleted.
- **Not touched** by this design: KYC Consumer, the existing Collections capability
  (ADR-036) is *reused* as the multi-payer collection surface, not modified here.

## Implementation increments (this ADR is increment 1: design)

1. **(done)** Operator design + the protocol foundation (BANZA ADR-039 + contracts).
2. **(done)** `core/pricing` crate (engine + operator rule config) + tests.
3. **(done)** Operator-Fee on transaction capture (`core/transactions` +
   `core/wallets` + `core/ledger`) + `operator_fees` persistence (migration 0071) +
   real-DB invariant tests (balanced, idempotent, net-to-payee, immutable snapshot).
   **Realization note:** this ledger is strictly one DR + one CR per posting
   (constraint `uq_ledger_entry_posting_type`), so the fee is **two balanced
   postings** sharing the gross reservation (settle `net`, fee `fee`), not a third
   leg — same net effect, append-only. See
   [docs/domains/pricing/README.md](../domains/pricing/README.md).
4. **(done)** `core/app-settlement` engine + state machine + events + `app_settlements`
   persistence (migration 0072) + real-DB invariant tests. Deferred app→beneficiary
   settlement of accumulated net value; application fee (distinct from the operator
   fee) resolved by the same Pricing Engine; two balanced postings (settle net +
   fee), append-only. The operator/admin HTTP API surface is folded into increment 5
   (no public surface yet). See
   [docs/domains/application-settlement/README.md](../domains/application-settlement/README.md).
5. **(done)** SDK + internal API: `business_category` / `pricing_profile` /
   `fee_policy_ref` carried on the transaction-creation surface end-to-end
   (gateway → core-api → operator fee) and on the internal Application Settlement
   API (`/internal/v1/application-settlements`, operator-only); TypeScript server
   SDK + Flutter reference types. References only — never a fee/percentage on the
   wire; public responses never expose the operator fee. The payment-link / QR /
   collections / wallet-payment surfaces and Flutter client methods stay deferred
   (they settle via the `transfers` path, not the operator-fee path).
6. DOA on the architecture; then Mongo / marketplace / crowdfunding.

Nothing is deployed/pushed without an explicit GO; each increment ships and is
validated independently. The financial-correctness invariants (double-entry,
integer minor units, append-only, idempotency) are non-negotiable at every step.

## Consequences

- One operator mechanism powers every vertical; the operator evolves pricing with
  zero protocol change.
- Operator revenue (the fee leg) is fully auditable/reconcilable in the ledger.
- Apps never see, choose, compute or receive the operator fee — only the net.

## Limitations (current)

- This ADR is the **design + protocol foundation**; the Rust core implementation
  (increments 2–4), the SDK surface (5) and the app consumers (6) are subsequent
  increments, sequenced after the protocol ratification per ADR-019.
