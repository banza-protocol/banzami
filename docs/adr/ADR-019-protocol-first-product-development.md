# ADR-019: Protocol-first product development & pre-protocol feature policy

**Status:** Accepted  
**Date:** 2026-06-28  
**Authors:** Banzami Engineering  
**Supersedes:** —  
**Related:** BANZA ADR-035 (Protocol-first product development) · BANZA ADR-036 (Payment Collections, *Proposed*) · [ADR-016](ADR-016-banzami-banza-brand-architecture.md) · [BANZA-PROTOCOL-VS-OPERATOR-POLICY](https://github.com/banza-protocol/banza/blob/main/docs/governance/BANZA-PROTOCOL-VS-OPERATOR-POLICY.md)

---

## Context

Banzami is the **reference operator** of the BANZA protocol, not the source of
protocol concepts. BANZA **ADR-035** makes the direction of development explicit:
a new *structural* financial/protocolar concept must originate in the protocol
and flow downward —

```
BANZA Protocol  →  Banzami Operator  →  SDK  →  Consumer / Merchant / Admin Apps
```

— never the other way around. This ADR records Banzami's adoption of that rule
and the resulting classification of one feature that was, in effect, built
against the rule: the merchant **"Cobrança dividida" (split charge)** shipped on
2026-06-28 as N independent payment links grouped only in the mobile UI.

## Decision

1. **Banzami adopts BANZA ADR-035.** No Banzami app, SDK, or operator service may
   introduce a new financial/protocolar concept without a corresponding BANZA
   ADR/RFC. Banzami implements concepts the protocol defines; it owns UX,
   operator policy (KYC/AML tiers, fees within `INV-STL-001`, onboarding,
   internal authorization), runtime and architecture — not the canonical concepts.

2. **Split charge is classified as a pre-protocol prototype.** It anticipates
   BANZA **Collections** (ADR-036, *Proposed*) but is not an official feature
   because the protocol has no `Collection` concept yet. It is therefore:
   - **kept, not deleted** (it is a useful prototype and reference for ADR-036);
   - placed **behind a disabled-by-default flag** — `AppConfig.splitChargeEnabled`
     (`SPLIT_CHARGE_ENABLED`, default `false`). With the flag off, the merchant
     "Nova cobrança" screen is exactly the original simple charge; the split
     toggle is not rendered and split mode is unreachable;
   - **documented as pre-protocolar** in code and docs — it must not be presented
     as a final implementation of split/group payments.

3. **The real feature waits on the protocol.** Banzami implements split/group
   payments only after BANZA ADR-036 is **Accepted**, following the plan in
   [collections-implementation-plan](../architecture/collections-implementation-plan.md):
   operator persists Collections + shares, generates a link/QR per share,
   reconciles share state from real payments, emits the protocol events, and
   issues official receipts. The current app-side flow is replaced by SDK calls
   to that operator capability.

## What is forbidden / permitted (operator restatement of ADR-035)

**Forbidden**
- An app creating new financial logic with no BANZA model behind it.
- An SDK inventing a protocolar object/field/event not defined by a BANZA contract.
- The operator shipping financial behaviour incompatible with, or unknown to, BANZA.
- A mobile feature becoming the de-facto "truth" of the protocol.

**Permitted**
- Apps owning UX and consuming protocol capabilities the operator exposes.
- The operator implementing protocol-defined capabilities + operator-local policy.
- SDKs exposing operator/protocol APIs as typed clients.
- Prototyping an anticipated concept **behind a disabled flag**, clearly marked
  pre-protocol (exactly the split-charge case).

## Consequences

- No financial behaviour is exposed as an official Banzami feature outside the
  protocol. Split charge is dormant by default and labelled pre-protocol.
- The split-charge code remains available to inform BANZA ADR-036 and the
  eventual protocol-first implementation.
- Reviewers (human or agent) apply one test before merging product work: *"Does
  this introduce a new financial/protocolar concept? If yes, it needs a BANZA
  ADR first."*
