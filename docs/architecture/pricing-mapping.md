# Pricing Mapping — Banzami

How a merchant's category becomes an operator fee, and how that differs from a
platform's own application fee (e.g. DOA's 2%).

See also [business-taxonomy.md](./business-taxonomy.md) and Banzami ADR-021
(Pricing Engine) / ADR-031 (transaction_type dimension).

## The chain

```
category (onboarding)
   │  resolvePricing()  (lib/business-taxonomy.ts)
   ▼
business_category  +  pricing_category
   │  stored on the merchant at onboarding
   ▼
payment / merchant payment carries business_category (+ pricing_profile, transaction_type)
   │  core/pricing rule_matches (business_category + currency [+ transaction_type])
   ▼
operator fee (rate_bps, flat, rounding)
```

The Pricing Engine (`core/pricing`) resolves a rule by matching the transaction's
`business_category` against a rule's `business_category` (plus currency and the
optional `transaction_type` matcher). `pricing_category` from the taxonomy is the
value used for that match.

## business_category_pricing_map

The mapping is the taxonomy itself (`BUSINESS_TAXONOMY`): `category → { businessCategory, pricingCategory }`.
No per-merchant manual rule selection.

| pricing_category | seeded rule (SANDBOX) | fee |
|---|---|---|
| DONATION | donation-standard | 2.5% (250 bps) |
| MARKETPLACE | marketplace-standard | 1.5% (150 bps) |
| MERCHANT_PAYMENT | merchant-payment-standard | fallback (currently disabled → 0) |

> Note: the seeded rules use `business_category` values `DONATION`, `MARKETPLACE`
> (uppercase) and `merchant_payment` (lowercase). The taxonomy uses the uppercase
> canonical `MERCHANT_PAYMENT`; normalising the general-commerce rule key is a
> backend follow-up (the rule is disabled today, so the fallback is fee-free).

## Operator fee vs application fee

Two **separate** fees that must never be conflated:

| | Operator fee (Banzami) | Application fee (DOA) |
|---|---|---|
| Owner | Banzami operator | The app (DOA) |
| Defined in | BANZADMIN pricing rules | DOA settings |
| Selected by | `pricing_category` (merchant category) | the app, per settlement |
| Wire field | pricing rule → transaction fee | `application_fee_bps` |
| Example | donation-standard = 2.5% | 2% (200 bps) → @doa |

DOA sends `application_fee_bps = 200` at settlement (ADR-029). This is DOA's
platform commission, taken on top of / separate from any operator fee. It is NOT
a Banzami pricing rule and never appears in BANZADMIN pricing.

## Examples

**DOA (donation platform)**
```
category = Doações e causas → business_category = donation, pricing_category = DONATION
operator fee     = donation-standard (2.5%)
application fee  = 2% (application_fee_bps=200 → @doa)   ← DOA's own, separate
```

**Marketplace**
```
category = Marketplace e plataformas → business_category = marketplace, pricing_category = MARKETPLACE
operator fee = marketplace-standard (1.5%)
```

**Restaurante**
```
category = Alimentação e bebidas → business_category = food_and_drinks, pricing_category = MERCHANT_PAYMENT
operator fee = merchant-payment fallback (disabled → 0 today)
```

## Fallback & conflict avoidance

- **Fallback**: unmapped/`other` → `MERCHANT_PAYMENT` with `fallback: true`
  (operator reviews before activation).
- **Missing mapping** blocks activation (`resolvePricing()` → `null`).
- **Conflict**: at most one enabled rule should match a given
  (business_category, currency, transaction_type); overlapping enabled rules are
  a configuration error surfaced in BANZADMIN (specificity + `priority` break
  ties in the engine).
