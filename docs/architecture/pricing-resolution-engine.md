# Pricing Resolution Engine — how the operator prices a business

**Status:** Implemented · **Version:** 1.0 · **Part of:**
[application-integration-engine.md](application-integration-engine.md) ·
**Decisions:** [ADR-057](../adr/ADR-057-project-financial-readiness.md),
[ADR-031](../adr/ADR-031-transaction-type-pricing-dimension.md) ·
**Detail:** [economic-model.md](economic-model.md) (canonical),
[pricing-mapping.md](pricing-mapping.md)

## The rule

> **An application never chooses a fee rate. The pricing profile the operator
> assigned chooses it.**

```
Assigned pricing profile   (operator decision, audited — e.g. sandbox-default)
      ↓  fee-bearing operation   (SETTLEMENT or PAYOUT — derived by the engine)
      ↓  effective window
Exactly one pricing rule   (rate bps and/or flat component)
      ↓
Fee                        (computed by the operator, snapshotted per operation)
```

| candidates | outcome |
|---|---|
| 0 | `PRICING_NOT_CONFIGURED` — refused, never priced at zero by accident |
| 1 | applied |
| >1 | `PRICING_CONFIGURATION_ERROR` — refused, never ranked |

Only **settlement** and **payout/withdrawal** are fee-bearing; transfers,
payments, captures, collections and refunds are not
([economic-model.md](economic-model.md)).

Current Sandbox matrix:

| profile | SETTLEMENT | PAYOUT |
|---|---|---|
| `sandbox-default` | 0 bps (a rule that says zero) | 75 bps |
| `sandbox-reference` | 200 bps | 75 bps |

The assigned profile and its rates are returned to a Project by
`GET /v1/financial-setup` → `pricing { profile, settlement_bps, payout_bps }`
(and to a merchant session by `GET /v1/integration` → `pricing { profile,
operations[] }`), so an application can *display* its rate but can never *set*
it. Readiness resolves the rate with `ApplicationSettlementEngine::resolve_settlement_fee`
— the same method settlement calls ([ADR-057](../adr/ADR-057-project-financial-readiness.md) §2).

## No caller pricing input

No public surface accepts a rate, fee, profile or category. A settlement request
carrying `application_fee_bps`, `fee_bps`, `rate_bps`, `pricing_profile`,
`business_category`, `fee_policy_ref`, `application_fee_minor` or `fee_minor` is
refused with 400 `PRICING_FIELD_NOT_ACCEPTED`. The caller names only **who**
receives an application fee (`fee_destination_banza_name`).

## Why profile-driven

- **Central control:** the operator decides which profile an owner is on and what
  each profile charges; changing a rate is a new rule version, not an app release.
- **Auditability:** the fee on any completed settlement or payout is reproducible
  from its immutable snapshot (profile, rule, version, applied bps, gross, fee,
  net) — never from a client value.
- **No self-pricing:** a merchant's descriptive category or name reaches no fee
  path; a business does not choose its own tariff by how it describes itself.

## Operation dimension (ADR-031)

A pricing rule names the operation it prices (`SETTLEMENT` or `PAYOUT`). The
engine derives the operation from what is being executed; the application
supplies only the business intent, not the price. A rule that names no operation
applies to nothing.

## Worked example — DOA

DOA's settlement rate is whatever the `SETTLEMENT` rule of the profile the
operator assigned to its Business Account says. To change it, an operator assigns
a different profile or versions the profile's rule — **never** a value in the DOA
app. DOA names the fee destination (`@doa`); if the resolved fee is greater than
zero, `@doa` must pass ADR-028 (including an operator classification as
`APPLICATION` / `PLATFORM`). See
[settlement-resolution-engine.md](settlement-resolution-engine.md) and
[application-integration-engine.md §7](application-integration-engine.md#7-application-fee-who-prices-who-receives).

## What the application must NOT do

- Hard-code, compute, send or override any fee or rate.
- Assume a fee; always read it from `GET /v1/financial-setup`.
- Treat the merchant's category as a price selector.

## Historical (superseded)

- **Category pricing.** This engine was first documented as "the business
  _category_ chooses the fee" (category → pricing category → rule). Nothing is
  priced by category any more; see [pricing-mapping.md](pricing-mapping.md) for
  the retired chain.
- **App-defined application fee (ADR-029).** An application could send
  `application_fee_bps` and bypass this engine. Removed by ADR-057.
