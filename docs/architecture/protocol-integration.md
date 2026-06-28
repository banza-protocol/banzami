# Protocol integration — how Banzami relates to BANZA

**Status:** Standing rule · **Authority:** BANZA ADR-035, Banzami ADR-019

Banzami is the **reference operator** of the BANZA protocol. It is an
implementation and a product — **not** the source of the protocol's concepts.
This document records the one architectural rule that governs every new feature.

## The direction rule (protocol-first)

A new **structural** financial/protocolar concept (a new object, a new way value
is grouped/structured/settled, a new lifecycle/state machine, a new event, a new
wire field) originates in the **protocol** and flows **downward**:

```
        BANZA Protocol
   (defines the canonical concept:
    model · invariants · events · contracts · certification)
              │
              ▼
       Banzami Operator
   (implements it: persists state, reconciles,
    emits events, issues official receipts)
              │
              ▼
            SDK
   (exposes the operator/protocol capability
    as typed client APIs)
              │
              ▼
  Consumer / Merchant / Admin Apps
   (consume the capability — own UX only)
```

**Never the other way around.** Banzami does not invent a financial/protocolar
concept in an app and then try to fit it into BANZA. Apps and SDKs do not define
new financial behaviour on their own.

## Why

BANZA is specification-level: it defines behaviour, contracts, invariants,
certification and the federation/trust model. If a concept is invented app-side
and retrofitted into the protocol, BANZA ends up ratifying an implementation
accident instead of specifying a designed concept — with no canonical model, no
invariants, no events, and nothing to reconcile or certify. The protocol-first
direction prevents that inversion.

## Where things live (spatial boundary)

The direction rule (above) is the *temporal* companion to the *spatial* boundary
the protocol already defines — see
[`BANZA-PROTOCOL-VS-OPERATOR-POLICY`](https://github.com/banza-protocol/banza/blob/main/docs/governance/BANZA-PROTOCOL-VS-OPERATOR-POLICY.md):

| Protocol (`~/banza`, normative) | Operator (Banzami, non-normative to protocol) |
|---|---|
| Financial invariants, wire contracts (OpenAPI, webhook, QR, events, federation) | KYC/AML tiers, risk, fraud detection |
| Certification criteria & capabilities (L0–L4) | Fees/pricing (within `INV-STL-001`) |
| Trust/federation model | Onboarding UX, product surfaces, internal authorization |
| The canonical concepts (Wallet, Transfer, PaymentIntent, Collection, …) | Choice of language, DB, runtime, internal architecture |

## What is forbidden / permitted

**Forbidden**
- An app creating new financial logic with no BANZA model behind it.
- An SDK inventing a protocolar object/field/event not defined by a contract.
- The operator shipping financial behaviour incompatible with, or unknown to, BANZA.
- A mobile feature becoming the de-facto "truth" of the protocol.

**Permitted**
- Apps owning UX and consuming protocol capabilities the operator exposes.
- The operator implementing protocol-defined capabilities + operator-local policy.
- SDKs exposing operator/protocol APIs as typed clients.
- Prototyping an anticipated concept **behind a disabled flag**, clearly marked
  pre-protocol, pending the relevant BANZA ADR.

## Worked example — split/group payments (Collections)

The merchant "Cobrança dividida" (split charge) prototype (2026-06-28) anticipates
a protocol concept that does not exist yet. It is therefore **pre-protocol**,
disabled by default (`AppConfig.splitChargeEnabled`), and classified in
[ADR-019](../adr/ADR-019-protocol-first-product-development.md). The real feature
follows the protocol-first chain once **BANZA ADR-036 (Payment Collections)** is
Accepted — see [collections-implementation-plan](collections-implementation-plan.md).

## The one-line test

Before building product work, ask:

> *Does this introduce a new financial/protocolar concept?*
> If **yes**, it starts in `~/banza` (a BANZA ADR/RFC) — not in the app.
