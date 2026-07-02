# Pricing Resolution Engine — how the operator prices a business

**Status:** Implemented · **Version:** 1.0 · **Part of:**
[application-integration-engine.md](application-integration-engine.md) ·
**Decisions:** [ADR-031](../adr/ADR-031-transaction-type-pricing-dimension.md) ·
**Detail:** [pricing-mapping.md](pricing-mapping.md), [business-taxonomy.md](business-taxonomy.md)

## The rule

> **An application never chooses its operator fee. The business _category_ chooses it.**

```
Business Category   (what the business is: donation, retail, services, …)
      ↓  taxonomy map            (business-taxonomy.md)
Pricing Category    (e.g. DONATION)
      ↓  active pricing rule     (+ transaction_type dimension, ADR-031)
Pricing Rule        (fee bps and/or fixed component)
      ↓
Operator Fee        (computed by the operator, per transaction)
```

The resolved pricing is returned inside Business Resolution
(`GET /v1/business/me` → `pricing`), so an application can *display* its fee but
can never *set* it.

## Why category-driven

- **Consistency:** every business of a category is priced identically; no
  per-app negotiation leaks into app code.
- **Central control:** the operator changes a category's rule once; all apps in
  that category reflect it on the next resolution — no app release needed.
- **Auditability:** the fee on any transaction is reproducible from
  (category → rule → transaction_type), never from a client value.

## Transaction-type dimension (ADR-031)

A pricing rule can vary by `transaction_type` (e.g. a wallet withdrawal vs a
payment). The operator selects the dimension; the application supplies only the
business intent, not the price.

## Worked example — DOA

DOA's business category is `donation` → pricing category `DONATION`. DOA's
operator fee is whatever the `DONATION` rule says. To change it, an operator
changes the `DONATION` category rule — **never** a value in the DOA app. DOA's
own cut is a separate **application fee** (see
[settlement-resolution-engine.md](settlement-resolution-engine.md) and
[application-integration-engine.md §7](application-integration-engine.md#7-application-fee--operator-fee)).

## What the application must NOT do

- Hard-code, compute, or override any fee.
- Assume a fee; always read it from Business Resolution.
- Treat the operator fee and its own application fee as the same thing.
