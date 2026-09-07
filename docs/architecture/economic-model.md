# The economic model — where Banzami charges, and where it does not

**Status:** the canonical model. Owner-confirmed 2026-09-07.
**Implemented by:** Pricing Model V2 (migrations 0109–0110, `core/pricing`).
**Financial LIVE remains NOT READY / fail-closed.** Everything here describes
Sandbox.

---

## The one-line version

Money moving is not the same as money being charged for. Banzami charges at
**settlement** and **withdrawal**, and nowhere else.

---

## What is fee-bearing, and what is not

| operation | moves money | operator fee | why |
| --- | --- | --- | --- |
| **Transfer** | yes | **no** | The generic primitive. It carries merchant payments *and* P2P, so a fee inside it would charge people for sending money to each other. |
| **Payment / donation** | yes | **no** | Credits the merchant or campaign wallet **gross**. |
| **Capture** | yes | **no** | Left operator pricing in V2. `core/transactions` does not depend on the Pricing Engine at all. |
| **Collection** | yes | **no** | Splits an already-priced charge. |
| **Refund** | yes | **no** | Reverses value that was already priced. Re-pricing would charge for the same money twice. |
| **Application settlement** | yes | **YES** | Settling accumulated value to a beneficiary. |
| **Payout / withdrawal** | yes | **YES** | Money leaving the network. |

Exactly two crates depend on `banzami-pricing` for a fee:
`core/app-settlement` and `core/payouts`. That is checked, not remembered —
`tools/check-pricing-consumers.mjs` fails if a third appears.

---

## The distinction that keeps being got wrong

> "An owner on `sandbox-reference` is charged 200 bps on donations."

That sentence is **wrong**, and it appeared in this repository's own
documentation and evidence more than once. The accurate one:

> A donation credits the campaign wallet **gross**. An eligible **settlement**
> of those funds is priced at the owner's assigned rate.

A 100 000 donation credits 100 000. Settling that 100 000 at 200 bps costs
2 000 and nets 98 000. The two numbers belong to two different operations, one
step apart.

### Why capture did not simply get a 0-bps rule

It would have produced identical numbers. It would also have left capture inside
operator pricing, so the next person would have had to rediscover that it does
not belong there — and a future change to the "default" rate would have started
charging payments without anyone intending it.

The audit's P0 was that the pricing engine could not tell a settlement from a
capture. The fix was not to give capture an operation. It was to take capture
out.

---

## How a rate is chosen

Deterministically, from three things:

```
(assigned pricing profile, fee-bearing operation, effective window)  ->  exactly one rule
```

| candidates | outcome |
| --- | --- |
| 0 | `PRICING_NOT_CONFIGURED` — someone must assign a policy. **Not zero.** |
| 1 | apply it |
| >1 | `PRICING_CONFIGURATION_ERROR` — refused, never ranked |

There is no specificity ranking and no tiebreak. V1 ranked candidates by
counting non-null matchers and settled ties by comparing UUIDs — deterministic,
and economically arbitrary. It is also what let a caller-supplied
`fee_policy_ref` outrank the profile the operator had assigned.

**A rule that names no operation applies to nothing.** Not to everything. That
is what stops a fee-bearing operation introduced tomorrow from inheriting
today's rate on the day it ships.

### Zero is something a rule says

An explicit 0-bps settlement rule and the absence of any rule produce the same
number and are entirely different facts. The first is a policy; the second is a
configuration gap. Every money-moving path tells them apart, and every surface
that displays them says which it is — `sem decisão de preço registada`, not
`sem regra (0)`.

---

## Who decides

| decision | who | how |
| --- | --- | --- |
| which profile an owner is on | the operator | admin surfaces, audited |
| what a profile charges per operation | the operator | pricing rules, versioned |
| which operation is being priced | the engine | derived from the operation being executed |
| anything above | **the caller** | **never** |

No public surface accepts `business_category`, `pricing_profile`,
`fee_policy_ref`, a rate or a fee. This is asserted, mutation-tested, and named:
`tools/check-economic-authority.mjs` calls the class
**client-controlled economic-policy authority**, and its self-test reintroduces
every historical instance and requires the gate to fail on each.

A merchant's own descriptive text — its name, its category label — reaches no
fee path. It is a label, used as a label.

---

## Profile identity vs rate

A profile names a **commercial policy**. A rule names **what that policy charges
for one operation, at one time**.

So `sandbox-reference`, not `sandbox-donation-200`. The old code encoded a
business vertical the profile does not depend on and a rate that will change:
moving settlement to 150 bps would have left a profile called "…-200" charging
150, or forced an identity change that rewrites what historical rows point at.

Changing a rate is a new rule version. It is never a new profile.

---

## The current Sandbox matrix

| profile | SETTLEMENT | PAYOUT |
| --- | --- | --- |
| `sandbox-default` | **0 bps**, explicit | **75 bps** |
| `sandbox-reference` | **200 bps** | **75 bps** |

`sandbox-default` is what a fresh self-service developer receives, and its zero
is a rule that says zero. The 75 bps withdrawal rate is Banzami ADR-031,
restored under REPAIR_LOG RA-063 and corroborated by the ledger: 15 processed
payouts, gross 1 060 000, fee 7 950 — exactly 0.75% to the minor unit.

Every assigned profile must have exactly one rule for **each** released
operation. `tools/check-pricing-assignment.mjs` proves it, and
`tools/check-released-operations.mjs` makes adding a new operation fail CI until
every profile has a policy for it.

---

## What history must be able to answer

For any completed fee-bearing operation: which rule, which version, what rate,
what base, what fee, decided when.

Settlement has always recorded this. Payouts did **not** — the row held
`amount_minor` and nothing else, and explaining the RA-063 incident required
joining `ledger_postings` on a derived idempotency key (`<key>:process:fee`).
V2 gives payouts their own snapshot, written once at the decision point and
refused thereafter, so a later rule change cannot rewrite what was charged.

---

## Where the pricing is decided

| operation | decided at | on retry |
| --- | --- | --- |
| settlement | `create` | `complete` posts the stored fee; it does not re-resolve |
| payout | `process` | the posting is idempotent, so a replay does not re-charge |

---

## Related

- [Pricing model re-audit](../audit/2026-09-07-pricing-model-re-audit.md) — the findings this model answers
- [Where operator fees are charged](../audit/2026-09-07-where-operator-fees-are-charged.md) — including a conclusion I got wrong, kept visible
- [Indirect pricing authority](../audit/2026-09-07-pricing-indirect-authority.md)
- [Pricing domain](../domains/pricing/README.md)
