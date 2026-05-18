# ADR-013 — Wallet-Native Payment Network Identity

**Status:** Accepted  
**Date:** 2026-05-18  
**Supersedes:** None  
**Extends:** [ADR-006](ADR-006-qr-payment-system.md), [ADR-009](ADR-009-payment-links.md)

---

## Context

As Banzami's architecture matured — double-entry ledger, wallet engine, QR payment system, payment links, consumer deposits, @handle identity — a question of fundamental identity emerged:

**What kind of payment network is Banzami, exactly?**

The initial documentation described Banzami as "fintech infrastructure" with wallet-native payments, but did not encode this identity as a binding architectural constraint. This left room for ambiguity: Could Banzami add card processing? Should the dashboard showcase card-entry UX? Should SDKs expose card tokenization APIs? Should documentation default to card-checkout examples?

Without a clear answer, engineering decisions would drift toward the global default — the Stripe model — because it is the most documented, most imitated, most familiar pattern in developer tooling. For a Stripe-style payment processor, this drift is natural. For Banzami, it would be catastrophic misalignment.

Angola and the African market where Banzami operates are **not card-first economies**. The dominant transaction models are:

* Mobile money (M-Pesa, Orange Money, Airtel Money)
* Bank transfer via national rails (EMIS, Multicaixa Express)
* QR-based instant payment (growing, modeled on Pix, WeChat Pay, UPI)
* Cash — still large in absolute volume

The population underserved by banking is also underserved by card infrastructure. Card ownership is low. Contactless terminal density is low. Card fraud risk relative to transaction volume is high.

The populations and merchants Banzami serves need **wallet-to-wallet instant transfers** addressable by QR code or @handle. This is what WhatsApp Pay, M-Pesa, WeChat Pay, and Pix built. These are the reference architectures for Banzami — not Stripe.

---

## Decision

**Banzami is a wallet-native payment network. This is a binding architectural constraint encoded in the engineering constitution (CLAUDE.md §2.7).**

### What this means, precisely:

1. **The canonical payment operation is a ledger transfer between two wallets.**
   - Consumer wallet → Merchant wallet (payment)
   - Consumer wallet → Consumer wallet (transfer)
   - Merchant wallet → Consumer wallet (refund)
   - All other flows derive from this primitive.

2. **QR codes are the primary payment initiation mechanism.**
   - Every merchant payment surface exposes a QR code.
   - The QR payload encodes wallet reference + optional amount + optional description.
   - Consumer scans → confirms → ledger transfer. No card data involved.

3. **@handles are the primary human-readable identity layer.**
   - `@shop.banzami.ao` is a payment address.
   - `@consumer_handle` is a transfer address.
   - Handles resolve to wallet IDs internally.

4. **Visa/Mastercard are future funding rails only — never the core network.**
   - Cards are a mechanism for topping up a Banzami wallet from an external card account.
   - Once kwanza lands in the Banzami wallet, the card is irrelevant to any subsequent payment.
   - Card credentials NEVER transit the core payment path.
   - Card tokenization, CVV handling, PCI DSS scope are isolated to a future card-top-up module, not the core network.

5. **Local rails (EMIS, Multicaixa Express) are Tier 1 integrations.**
   - These are the interoperability bridges to the Angolan banking system.
   - Consumer deposits via EMIS → wallet credit.
   - Merchant payouts via Multicaixa Express → bank account.

---

## Rationale

### Why wallet-native?

The Banzami wallet is the single account primitive. Every identity — consumer, merchant, operator — owns a wallet. The ledger tracks every debit and credit on every wallet immutably. Wallet-to-wallet transfer is the atomic operation from which every product feature (payment, transfer, refund, payout, settlement) is composed.

Building this way means:

* **No card rails in the critical path.** Card networks add latency (authorization round-trip), cost (interchange fees), chargebacks (contested payments), and fraud surface. By keeping cards out of the payment flow, Banzami's core path is faster, cheaper, and more controlled.
* **Instant settlement by default.** When both sender and receiver are Banzami wallets, settlement is a ledger write — milliseconds, not T+2. This is structurally impossible for card networks.
* **Full auditability.** Every kwanza in the system exists in a ledger account. There is no card "authorization hold" ambiguity. The state is always deterministic.
* **Market fit.** Angola's payments landscape will be transformed by QR-native, wallet-native money movement — not by replicating a card stack built for Western markets.

### Why explicitly rule out card-first identity?

Without an explicit constraint, engineering teams default to familiar patterns. Stripe's API design is the most documented payment API in the world. Left unconstrained, new features would naturally drift toward Stripe-shaped endpoints, card-shaped data models, and card-checkout UX.

Ruling this out explicitly forces every product decision to be evaluated against the wallet-native model. This is not anti-card; it is anti-drift.

---

## Alternatives Considered

### 1. Hybrid model: wallet-native for local, card for international

**Rejected.** This would split the product into two incompatible mental models and increase implementation complexity with no near-term benefit. International card acceptance is a v2+ concern. The core network must be coherent first.

### 2. Card-first with wallets as an abstraction layer

**Rejected.** This is the Stripe model. It optimizes for Western card infrastructure. It does not fit Angola's market, population, or regulatory environment. It would also put Banzami in direct competition with Stripe — a fight with no advantage.

### 3. No explicit constraint — let product evolve

**Rejected.** Without constraint, architecture drifts. The engineering constitution exists to prevent drift at decision points. This identity decision must be encoded as a constraint, not a preference.

---

## Consequences

### Positive

* Engineering teams have a clear north star for evaluating new features.
* SDK and documentation design converge on a coherent model (QR, wallets, @handles).
* Core payment path remains card-free: no PCI DSS scope on the critical path.
* Product differentiation is strong: Banzami is not "Angola's Stripe" but "Angola's Pix."

### Negative / Tradeoffs

* Merchants who are accustomed to card-first checkout will need education.
* International payment acceptance (for e-commerce selling to diaspora) requires a card funding rail to be built later — this is deferred work.
* PCI DSS compliance is deferred (not eliminated — a future card top-up module will require it).

### Mitigations

* Clear merchant onboarding materials explaining QR-first commerce and its benefits.
* A documented roadmap for the card-top-up module as a funding rail (not a payment rail).
* Checkout SDK that makes QR-native the easiest path for merchant integrations.

---

## Implementation Scope

This ADR does not introduce new code. It:

1. Encodes the identity constraint in CLAUDE.md §2.7
2. Requires all future ADRs, SDK designs, API designs, and documentation to be evaluated against this constraint
3. Establishes the following priority order for SDK surface area:
   - **Tier 1:** QR payment generation, payment links, wallet transfer, @handle resolution, payment requests
   - **Tier 2:** Webhooks, refunds, disputes, merchant profiles
   - **Tier 3:** Settlement, payouts, reconciliation
   - **Future only:** Card top-up, international rails

---

## References

* [ADR-006 — QR Payment System](ADR-006-qr-payment-system.md)
* [ADR-009 — Payment Links](ADR-009-payment-links.md)
* [ADR-012 — SDK-First Ecosystem](ADR-012-sdk-first-ecosystem.md)
* [CLAUDE.md §2.7](../../CLAUDE.md)
* Pix (Brazil Central Bank) — architecture reference
* UPI (NPCI India) — architecture reference
* M-Pesa — market reference
* WeChat Pay — UX reference
