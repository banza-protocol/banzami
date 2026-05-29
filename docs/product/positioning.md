# Banza Market Positioning

**Version:** 1.0  
**Date:** 2026-05-30  
**Status:** Active — updated for ADR-025 (naming inversion)

---

## The One-Line Position

**Banza é o protocolo aberto de infraestrutura financeira programável. Banzami é o operador de referência — a rede de pagamentos instantâneos construída sobre o Banza.**

*English: Banza is the open programmable financial infrastructure protocol. Banzami is the reference operator — the instant payment network built on Banza.*

---

## Canonical Three-Tier Hierarchy (ADR-025)

| Entity | What it is | What it is NOT |
|---|---|---|
| **BANZA** | Open programmable financial infrastructure — protocol, ledger, settlement engine, certification system, verifiable rules | A wallet app, QR product, company name, consumer-facing product |
| **BanzAI** | Native Protocol Operating System — explains, validates, simulates, certifies, traces the BANZA protocol | A chatbot, documentation assistant, support tool |
| **Banzami** | Reference operator and payment product built on BANZA — consumer wallets, merchant QR, Banzami SDK, Banzami Business | The organization, the protocol, the infrastructure, the ecosystem |

**Strategic differentiator:** Most financial protocols define rules. BANZA defines rules AND includes a native operating system (BanzAI) capable of explaining, validating, researching, simulating, certifying and tracing those rules.

---

## What BANZA IS

| Statement | Meaning |
|-----------|---------|
| Open programmable financial infrastructure | Not a payment app — a protocol with certified operators, verifiable rules, and an open implementation surface |
| Angola's QR-native instant payment protocol | QR codes are a protocol-native primitive any certified operator can implement; settlement is instant |
| The first Angola-native SDK payment infrastructure | Any Angolan app integrates via Banzami SDK and accepts AOA instantly — this infrastructure did not exist before |
| The certified operator network | Any organisation meeting BANZA certification requirements can become a protocol operator |
| A protocol with a native OS | BanzAI is the first-class cognitive interface of the BANZA protocol — not an optional module |

---

## What BANZA Is NOT

| Wrong Description | Why It Is Wrong |
|-------------------|-----------------|
| "Pan-African payment aggregator" | Premature. Angola first; expansion second. Claiming pan-African before achieving Angolan density is dishonest. |
| "Stripe for Africa" | Wrong model. Stripe is card-first, designed for Western card infrastructure. BANZA is wallet-native, QR-first, kwanza-native. |
| "Generic African fintech platform" | Too vague to mean anything. BANZA solves Angola's specific payment infrastructure gap. |
| "Cryptocurrency platform" | Out of scope. BANZA handles AOA via regulated banking infrastructure. |
| "Traditional banking app" | BANZA is not a bank. It is the protocol layer above banks. |
| "Banzami is the infrastructure" | Inversion: BANZA is the infrastructure; Banzami is the reference operator built on BANZA. |

---

## Positioning by Audience

### For developers integrating payments

> "The BANZA protocol provides the developer layer of Angola's programmable payments infrastructure. Integrate instant Kwanza payments inside your app in hours using the Banzami SDK. QR generation, payment links, webhooks — fully typed, idempotency-safe, webhook-verified."

Core proof points:
- Angola-native: AOA, pt-AO locale, @handle-based identity, EMIS-compatible
- SDK-first: typed APIs, automatic idempotency, retry handling, webhook signature verification
- No card complexity: wallet ↔ wallet transfers, QR generation, payment requests

### For Angolan merchants

> "Accept payments instantly. Print a QR. Get paid the moment a customer scans it. No waiting. No WhatsApp proof images. No manual bank transfer reconciliation."

Core proof points:
- Instant settlement — money appears in the merchant wallet the moment payment is confirmed
- QR-native — no card terminal, no POS hardware required for small merchants
- SDK for apps — taxi apps, delivery platforms, and ecommerce sites integrate in hours

### For investors

> "Banza is building Angola's open programmable financial infrastructure — the QR-native protocol with consumer wallets, merchant rails, and a developer SDK ecosystem that replaces cash and WhatsApp confirmation in the largest Portuguese-speaking country in Africa. BanzAI is the native protocol OS that makes BANZA uniquely explainable, validatable, and certifiable."

Core proof points:
- National mission with a specific market, not a vague continental play
- Defensible network effect: wallet density + merchant QR density + certified operator network
- BanzAI as strategic moat: protocol intelligence is embedded in infrastructure, not bolted on
- EMIS integration: not building rails from scratch; using Angola's existing regulated interbank infrastructure
- Reference models: Pix (Brazil), UPI (India) — both achieved national scale from focused initial deployment

### For Angolan banks (partnership framing)

> "Banza is not competing with Angolan banks. We are the protocol layer above your infrastructure — bringing your customers instant digital payment UX, QR-native experiences, and developer SDKs that increase your platform's relevance in digital commerce."

---

## Infrastructure Layers

The BANZA protocol operates across three tiers:

| Tier | Entity | Surface | Who Uses It |
|------|--------|---------|-------------|
| **Protocol tier** | BANZA | Ledger engine, settlement rails, EMIS integration, certification, verifiable rules | Banks, certified operators, regulated integrators |
| **Intelligence tier** | BanzAI | Protocol OS — 16 modules: understand, explain, validate, simulate, predict, guide, certify, federate | Protocol operators, developers, governance reviewers |
| **Product tier** | Banzami (reference operator) | Consumer mobile app, Banzami Business (merchant), Banzami SDK (developer), QR payments | Consumers, merchants, Angolan developers |

Banzami is the reference operator that builds on top of BANZA. Other certified operators can build their own products on the same protocol.

---

## Reference Models

These platforms are cited as analogues for specific aspects of what BANZA builds. They are not competitors — none has meaningful Angolan presence.

| Platform | What BANZA Borrows |
|----------|---------------------|
| **Pix (Brazil)** | QR-native national payment network; instant settlement as the default; mass merchant adoption via simplicity |
| **UPI (India)** | @handle-based identity for payment addressing; national scale from focused domestic deployment; open operator model |
| **M-Pesa (East Africa)** | Mobile-first financial inclusion; informal merchant adoption; trust via simplicity |
| **WeChat Pay (China)** | QR scan as the dominant consumer payment habit; wallet-native ecosystem |

BANZA is explicitly NOT modeled on:
- Stripe (card-first, Western infrastructure)
- PayPal (card-linked, remittance-adjacent, not local-rail-native)
- Adyen (enterprise card processing, no Angolan presence)
- Revolut (European neobank, card-primary)

---

## Language Rules

### Always use

- "programmable financial infrastructure" or "open protocol" — not "wallet app" for BANZA
- "reference operator" for Banzami — not "the infrastructure"
- "instant payment" or "instant settlement" — not "fast payment"
- "wallet" — not "account"
- "AOA" or "Kwanza" — not generic "African currency"
- "@handle" — not "username"
- "scan and pay" — not "tap to pay"
- "QR-native" — not "QR-enabled"
- "Angola's payment infrastructure" or "Angola's payment protocol" — not "African payment network"
- "Banzami SDK" for the SDK — it belongs to the Banzami product layer

### Avoid

- "Banzami é a infraestrutura" — inversion; BANZA is the infrastructure, Banzami is the product
- "Banzami protocol" or "protocolo Banzami" — the protocol is BANZA, not Banzami
- "pan-African" in any current-tense claim
- "Stripe for Africa" analogies
- "card payment" in any primary context
- "bank transfer" framed as a feature

---

## The Elevator Pitch (60 seconds)

> In Angola, most businesses still get paid via manual bank transfers, verified by WhatsApp screenshots. It's slow, error-prone, and doesn't scale for apps.
>
> Banza is Angola's open programmable financial infrastructure — the protocol with instant settlement, QR-native payments, and verifiable rules that any certified operator can implement. Banzami is the first certified operator: a consumer wallet, a merchant QR tool, and a developer SDK, all built on the Banza protocol.
>
> What makes Banza different: BanzAI is the native protocol OS — it can explain, validate, simulate, and certify the entire protocol. Most protocols define rules. Banza defines rules AND includes a cognitive operating system for those rules.
>
> We're building what Pix did for Brazil — but with an open protocol architecture. Angola first, then the region.

---

## References

- [ADR-025 — Naming Inversion](../adr/ADR-025-naming-inversion.md)
- [ADR-016 — Banzami/Banza Brand Architecture](../adr/ADR-016-banzami-banza-brand-architecture.md) (superseded by ADR-025 on hierarchy)
- [ADR-014 — Angola-First National Mission](../adr/ADR-014-angola-national-mission.md)
- [ADR-013 — Wallet-Native Payment Network Identity](../adr/ADR-013-wallet-native-identity.md)
- [BANZA-POSITIONING-AUDIT-002](../migration/banza-positioning-audit.md)
- [BANZA-CANONICAL-IDENTITY-AUDIT Phase 2](../migration/banza-identity-deep-audit.md)
