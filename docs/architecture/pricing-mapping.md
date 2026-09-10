# Pricing Mapping — Banzami

How an owner's fee rate is decided, and why a merchant's category no longer
selects it.

Canonical model: [economic-model.md](./economic-model.md). Decisions: Banzami
ADR-021 (Pricing Engine) · ADR-031 (operation dimension) ·
[ADR-057](../adr/ADR-057-project-financial-readiness.md) (the operator alone
prices; supersedes ADR-029).

## The current chain

```
operator assigns a pricing profile to the owner   (BANZADMIN, audited)
   │
   ▼
fee-bearing operation being executed               (SETTLEMENT | PAYOUT)
   │  core/pricing — (profile, operation, effective window) → exactly one rule
   ▼
fee (rate_bps, flat, rounding) + immutable snapshot
```

| profile (SANDBOX) | SETTLEMENT | PAYOUT |
|---|---|---|
| `sandbox-default` — self-service default | 0 bps (explicit) | 75 bps |
| `sandbox-reference` — controlled non-zero policy | 200 bps | 75 bps |

No per-caller input participates. `business_category`, `pricing_profile`,
`fee_policy_ref`, a rate or a fee sent by a caller is refused (400
`PRICING_FIELD_NOT_ACCEPTED` on the settlement request).

## Where the category still appears

The onboarding taxonomy (`apps/website/lib/business-taxonomy.ts`,
[business-taxonomy.md](./business-taxonomy.md)) still records a category and a
derived `pricing_category` for a merchant. Both are **descriptive**: no pricing
rule is keyed on a category, and neither selects a rate.

## The settlement fee: who prices, who receives

There is one fee on an application settlement, and its two halves belong to
different parties:

| | Rate | Recipient |
|---|---|---|
| Decided by | the operator — the assigned profile's `SETTLEMENT` rule | the application — `fee_destination_banza_name` |
| Configured in | BANZADMIN (profile assignment + pricing rules) | the settlement request |
| Validated by | the Pricing Engine (0 / 1 / >1 rule) | ADR-028 when the resolved fee > 0 |

The operator's withdrawal fee is the profile's `PAYOUT` rule, charged when money
leaves the network. Neither appears as a value the application sends.

## Examples

**Ordinary Project on `sandbox-default`**
```
settlement fee = 0 bps  → no fee destination required; a named one is not validated
payout fee     = 75 bps
```

**Owner on `sandbox-reference`**
```
gross 100 000 → settlement fee 2 000 (200 bps) → fee destination, net 98 000 → beneficiary
fee destination must be ACTIVE, KYB APPROVED, hold an ACTIVE wallet with the
account, and be classified APPLICATION or PLATFORM (operator decision)
```

**DOA**
```
rate      = the SETTLEMENT rule of the profile the operator assigned to @doa's owner
recipient = @doa (named by DOA)
```

## Conflict avoidance

- **No rule** → `PRICING_NOT_CONFIGURED` (someone must assign a policy; never
  priced at zero by accident).
- **More than one rule** → `PRICING_CONFIGURATION_ERROR` (refused, never ranked).
- Every assigned profile must have exactly one rule per released operation
  (`tools/check-pricing-assignment.mjs`).

## Historical (superseded)

The mapping below described the retired model and is kept for context only.

- **Category chain.** `category (onboarding) → resolvePricing() → business_category
  + pricing_category → core/pricing rule_matches(business_category + currency
  [+ transaction_type]) → operator fee`. Seeded SANDBOX rules then were
  `donation-standard` (DONATION, 250 bps), `marketplace-standard` (MARKETPLACE,
  150 bps) and `merchant-payment-standard` (disabled → 0). Replaced by the
  profile model above ([economic-model.md](./economic-model.md)).
- **Operator fee vs application fee as two rates.** The operator fee was
  selected by `pricing_category`; the application fee was a rate the app chose
  and sent as `application_fee_bps` (ADR-029) — e.g. DOA sent
  `application_fee_bps = 200` → @doa. ADR-057 removed the caller-sent rate: the
  application now names only the recipient.
