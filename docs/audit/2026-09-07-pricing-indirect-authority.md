# Indirect pricing authority — audit

**Date:** 2026-09-07
**Scope:** every path where a fee is resolved, asking one question — *can the
caller influence which rule applies?*
**Status:** one live hole found and fixed (settlements); payout path cleared of
caller influence; one finding of the same defect class recorded and deferred with
a stated reason.

---

## Why this audit exists

The pricing defect that started this work was not that a client could send a
fee. No client could. It was that a client could send the *reference* that
selected the fee — `business_category`, `pricing_profile`, `fee_policy_ref` —
and each was defended in comments as "reference only, never a price". The
defence was accurate about the wire and wrong about the consequence: choosing
the reference is choosing the price by proxy.

Worse, the documented fallback made omission the cheapest move available:
absent reference resolved no rule, and no rule was treated as a zero fee. The
optimal strategy for a caller was to send nothing.

So this audit does not look for fee fields. It looks for **any caller-reachable
input that reaches a `PricingContext`**, and for **any path where an absent
rule silently produces zero**.

---

## Payout / withdrawal path — CLEARED

`PricingContext.transaction_type` is a rule dimension, and withdrawals price
against it (`wallet_withdrawal`, currently 0.75%). If a caller could set the
transaction type, they could select a cheaper rule — or one that does not exist,
which today resolves to free.

They cannot.

| Question | Finding |
| --- | --- |
| Does any payout HTTP route accept a transaction type? | No. `transaction_type` does not appear in `core/api/src/routes/payouts.rs` at all, nor in the gateway's payout surface. |
| Where does the value come from? | A module constant: `const WITHDRAWAL_TX_TYPE: &str = "wallet_withdrawal"` — `core/payouts/src/engine.rs:13`, used at `:116`. |
| Can any other context field be steered on this path? | No. `resolve_withdrawal_fee` builds the whole `PricingContext` itself and hard-codes the rest: `business_category` is an empty `Other`, and `pricing_profile`, `fee_policy_ref` and `country` are all `None`. Only the amount and currency come from the payout, and neither selects a rule. |

The payout path therefore has no indirect pricing authority. It is not merely
that the fields are ignored — they are not reachable, because the engine
constructs the context rather than receiving one.

---

## Finding: `fee_policy_ref` was still caller-controlled on settlements — FIXED

The first pass of this cleanup removed `business_category` from
`POST /v1/application-settlements` and resolved `pricing_profile` server-side.
`fee_policy_ref` was left in the request body and forwarded to Core.

It was defended the same way everything in this class has been defended — as a
reference resolved by the Pricing Engine, never a number. And it is a rule
dimension like the other two (`core/pricing/src/engine.rs:92`), which makes it
worse rather than harmless: rule selection ranks by **specificity**, counting
how many dimensions a rule pins. A rule keyed on a fee policy reference is more
specific than one keyed only on the merchant's profile, so it *wins*. A caller
who knew any policy reference could steer their own settlement onto the rule
behind it, over the top of the policy the operator assigned them.

It survived because the test guarding this surface checked one field by name.
`TestApplicationSettlement_CallerCannotChooseItsOwnPricing` asserted the absence
of `business_category` and nothing else, so removing one field looked like
closing the hole.

Fixed:

- the request struct no longer declares `fee_policy_ref`;
- the gateway service structs no longer carry `FeePolicyRef` or
  `BusinessCategory` at all — a field that still exists is a field something can
  start populating again — and `core_client` no longer serialises them;
- the guard now checks all three selectors as struct tags, plus that no
  `FeePolicyRef:` is forwarded and no `body.*` pricing input reaches the service.

The strengthened guard was mutation-checked: reintroducing the
`json:"fee_policy_ref"` tag alone fails it.

---

## Finding: an absent withdrawal rule is still silently free

`core/payouts/src/engine.rs:100-101` documents the behaviour plainly:

> No matching/enabled rule → 0 (free, fail-safe).

and the code matches it — `resolve(&rules, &ctx).fee_minor` is used directly,
guarded only against a fee exceeding gross. There is no equivalent of the
capture-path refusal.

This is the **same defect class** that was closed on capture and settlement: an
absent pricing decision and a decision of zero produce the same number, and the
withdrawal path still cannot tell them apart. Calling it "fail-safe" describes
who it is safe for — the failure mode is silent operator revenue loss, not a
loud stop.

It is deliberately **not fixed in the same change as the capture/settlement
refusal**, for one reason: withdrawals move a user's own money out. Making the
payout path refuse without first guaranteeing an explicit rule exists would
convert a revenue leak into a customer-facing outage. The fix has to arrive as
a pair — an explicitly seeded `wallet_withdrawal` rule, and only then the
refusal — and it needs its own database-backed gate.

No migration currently seeds a `wallet_withdrawal` pricing rule; the deployed
rate was created through the pricing admin surface. That is precisely the gap:
the operator's withdrawal economics presently depend on a row nothing in the
repository guarantees.

### This is not hypothetical — it has already happened once

`evidence/assurance/payouts/cap-payout-001-sandbox-e2e.json` records it in its
own note:

> the first run of that harness measured a fee of **zero**, because
> `pricing_rules` was empty on the deployed Sandbox and the payout path fails
> "safe" to zero when no rule matches. The rule was then restored by hand
> through core's internal pricing API (REPAIR_LOG RA-063).

So the deployed operator has already withdrawn money at no fee because a
configuration row was missing, and the only reason anyone noticed was that a
test harness happened to assert the amount. Nothing in the system objected. The
repair was to re-add the row — which leaves the same failure available the next
time the row is absent.

That is the argument for seeding the rule in a migration and refusing without
it, and it is why this is tracked as a defect rather than a nicety.

**Tracked as the remaining item in this defect class.**

---

## Method

Source-level, on `548706ea`:

- every construction of `PricingContext` across `core/` was read, not just the
  payout one, to check which fields are caller-reachable;
- the transaction and settlement paths were confirmed already refused (see
  `TransactionError::PricingNotConfigured` and
  `ApplicationSettlementError::Pricing`), with DB-backed tests holding them to
  it;
- the gateway request structs were checked to confirm the three selectors are
  gone from the public surface, which `TestTransactions_RequestCarriesNoPricingSelector`
  asserts against the source itself.
