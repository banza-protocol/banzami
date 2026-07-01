# Business Taxonomy — Banzami

Canonical classification of merchant businesses. The category (+ optional
subcategory) chosen at onboarding **automatically** determines the operator
pricing category — nobody assigns a pricing rule per merchant by hand.

Single source of truth: [`apps/website/lib/business-taxonomy.ts`](../../apps/website/lib/business-taxonomy.ts)
(`BUSINESS_TAXONOMY`). The onboarding categories/subcategories
(`lib/business-categories.ts`) are derived from it.

## Category vs subcategory vs business_category vs pricing_category

| Concept | Meaning | Example (DOA) |
|---|---|---|
| **category** | What the merchant picks (PT display name) | "Doações e causas" |
| **subcategory** | Refinement of the category | "Crowdfunding comunitário" |
| **business_category** | Canonical internal key stored on the merchant | `donation` |
| **pricing_category** | Operator fee category the Pricing Engine matches a rule on | `DONATION` |

The merchant only sees **category/subcategory**. The operator derives
`business_category` + `pricing_category` from the chosen category.

## Every category has a definition

Each entry in `BUSINESS_TAXONOMY` carries: `key`, `namePt`, `description`,
`subcategories`, `businessCategory`, `pricingCategory`, `riskHint`, `examples`.

| key | namePt | business_category | pricing_category |
|---|---|---|---|
| donation | Doações e causas | donation | DONATION |
| ngo | ONG e associações | donation | DONATION |
| marketplace | Marketplace e plataformas | marketplace | MARKETPLACE |
| food_and_drinks | Alimentação e bebidas | food_and_drinks | MERCHANT_PAYMENT |
| retail | Retalho | retail | MERCHANT_PAYMENT |
| pharmacy_health | Farmácia e saúde | pharmacy_health | MERCHANT_PAYMENT |
| services | Serviços | services | MERCHANT_PAYMENT |
| transport | Transportes | transport | MERCHANT_PAYMENT |
| education | Educação | education | MERCHANT_PAYMENT |
| beauty | Beleza e estética | beauty | MERCHANT_PAYMENT |
| technology | Tecnologia | technology | MERCHANT_PAYMENT |
| auto_parts | Oficinas e peças | auto_parts | MERCHANT_PAYMENT |
| hospitality | Hotelaria e alojamento | hospitality | MERCHANT_PAYMENT |
| entertainment | Entretenimento | entertainment | MERCHANT_PAYMENT |
| government | Governo e setor público | government | MERCHANT_PAYMENT |
| utilities | Utilities e contas | utilities | MERCHANT_PAYMENT |
| other | Outros (fallback) | other | MERCHANT_PAYMENT |

## DOA

DOA is a donations / crowdfunding platform. It classifies as:

```
category         = Doações e causas   (or ONG e associações)
business_category = donation
pricing_category  = DONATION           → operator rule donation-standard
```

DOA additionally charges its **own** application fee (2%) — see
[pricing-mapping.md](./pricing-mapping.md#operator-fee-vs-application-fee). That
application fee is NOT a Banzami pricing rule.

## No ambiguity

- Every active category maps to a `pricing_category` (`everyCategoryMapped()`).
- An unknown/unmapped category returns `null` from `resolvePricing()` — treated
  as a configuration error that must block activation.
- `other` is the only fallback and is flagged (`fallback: true`) so the operator
  reviews it before activation.

## Onboarding flow

1. Merchant picks a category (+ subcategory) at `/comerciantes/candidatura`.
2. The form calls `resolvePricing(category)` → `{ businessCategory, pricingCategory, fallback }`.
3. The application is submitted with `business_category` + `pricing_category`.
4. The operator stores them on the merchant; payments resolve the operator rule
   from `pricing_category` (see pricing-mapping.md).
