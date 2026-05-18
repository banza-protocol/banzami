# Banzami Product Strategy

**Version:** 1.0  
**Date:** 2026-05-19  
**Status:** Active  

---

## Mission

**To modernize and revolutionize digital payments in Angola.**

---

## Strategic Position

Banzami is Angola's QR-native instant payment network and the first Angola-native SDK payment infrastructure.

We are not building a generic fintech product. We are building national-scale payment infrastructure for a specific, well-understood market — Angola — with the discipline and depth that requires.

---

## The Problem We Solve

Angola's digital commerce is broken in a predictable and fixable way.

### The Cash Persistence Problem

Despite mobile penetration exceeding 60%, cash dominates most commercial transactions. The reason is not that Angolans distrust digital — it is that existing digital payment friction is *worse* than cash. Manual bank transfers require reference codes, waiting periods, and confirmation delays. Cash is instantaneous. Banzami makes digital payments faster than cash.

### The WhatsApp Proof Problem

The de facto "digital" payment flow in Angolan informal commerce:

1. Customer initiates bank transfer
2. Customer screenshots the confirmation
3. Customer sends the screenshot to the merchant on WhatsApp
4. Merchant verifies manually, then confirms

This is not digital commerce. It is analog reconciliation with extra steps. It fails at scale. It creates disputes. It requires trust in screenshots. Banzami eliminates this entirely: scan → confirm → instant settlement, no manual proof required.

### The In-App Payment Gap

Taxi apps, delivery platforms, and marketplaces in Angola cannot close the payment loop inside their products. The payment step forces users out of the app — to cash, external transfer, or fragile third-party workarounds. Banzami provides the SDK infrastructure so any Angolan app can accept instant Kwanza payments natively.

### The SDK Gap

There is no Angola-native payment SDK. Developers building Angolan applications have no clean, typed, idempotency-safe API to accept instant AOA payments. They improvise — with security vulnerabilities, inconsistent behavior, and no production-grade support. Banzami fills this gap.

---

## National Objectives

### Objective 1 — First QR-native instant payment network in Angola

Make QR payments the normal expectation for Angolan consumers and merchants, the same way Pix normalized QR in Brazil and UPI in India.

A cantina owner prints a Banzami QR. A customer scans it. Payment is instant and confirmed on both sides. No WhatsApp. No manual check. No waiting.

This is the target. It is achievable. It requires focus on Angola.

### Objective 2 — First Angola-native SDK payment infrastructure

Any Angolan application — taxi app, delivery platform, marketplace, school system, donation platform, ecommerce site — should integrate Banzami in hours and accept instant Kwanza payments natively inside their product.

This does not exist today. Banzami builds it.

---

## Target Users

### Merchants (primary SDK integrators)

| Segment | Use Case | Payment Surface |
|---------|----------|-----------------|
| Taxi / ride-hailing apps | In-app payment at ride completion | SDK |
| Food delivery platforms | Split and instant settlement on order | SDK |
| Small merchants (cantinas, kiosks) | QR point-of-sale | Static QR |
| Ecommerce sites | Checkout widget | Payment link / SDK |
| Donation platforms (e.g. DOA) | Instant creator / charity payment | Payment link |
| Schools and institutions | Fee collection with receipt | Payment request |
| Marketplaces | Multi-merchant settlement | SDK |

### Consumers

Angolan mobile users (Android and iOS) who want to:
- pay merchants via QR scan (no cash required),
- send money to friends via @handle (no IBAN required),
- pay invoices via payment links shared on WhatsApp/social.

---

## Use Case Priority

### Tier 1 — Core (must ship first, highest density investment)

1. **QR point-of-sale** — merchant displays static or dynamic QR; consumer scans and pays instantly
2. **Payment links** — merchant shares a link; consumer opens in browser and pays
3. **In-app payments via SDK** — any Angolan app integrates Banzami SDK and accepts instant AOA
4. **P2P transfers** — consumer sends money to another via @handle

### Tier 2 — Growth (follows network density)

5. **Taxi / ride-hailing** — in-app payment at ride completion
6. **Donations and creator payments** — platforms accept instant AOA without a custom integration
7. **Delivery and marketplace settlement** — split payout on order completion
8. **Small merchant wallet** — cantinas, market stalls, informal commerce

### Tier 3 — Scale (enterprise and government)

9. **Ecommerce checkout widget** — hosted checkout on web and mobile
10. **School and institution fees** — fee collection with formal receipt
11. **Government and utility payments** — BNA-adjacent integration (long-term)

---

## What Banzami Is Not Building (Now)

| Excluded | Why |
|----------|-----|
| Card processing (Visa/Mastercard primary rails) | Wrong model for Angola; cards are a wallet top-up rail only |
| Pan-African expansion | Network effect requires density; Angola first |
| Cryptocurrency | Out of scope; regulatory risk; distraction |
| Traditional bank account management | Banks are partners, not competitors |
| Generic "Stripe for Africa" platform | Wrong positioning; we solve Angola's specific problems |

These are not permanent exclusions — card top-up is planned as a future funding rail. But they are not core product for v1 or v2.

---

## Competitive Positioning

### Against cash

Cash is the real competitor, not other fintechs. Cash is ubiquitous, trusted, and instant (in person). Banzami must match cash's immediacy while adding receipts, record-keeping, and remote payment capability.

### Against bank transfers

Bank transfers are slow, require IBAN/reference codes, and have no in-person confirmation flow. Banzami is demonstrably faster and simpler.

### Against EMIS / Multicaixa

EMIS is a rail, not a product. Banzami uses EMIS for interbank settlement and positions itself as the product layer above it. We are not competing with EMIS; we integrate it.

### Against international fintechs

Stripe, PayPal, Adyen have no Angolan presence, no AOA infrastructure, and no local rail integration. The competitive threat is negligible today. The correct frame is: what are Angolan businesses using *instead* of a proper payment product? (Answer: cash, WhatsApp, and manual bank transfers.)

---

## Growth Model

### Phase 1 — Network seeding

Sign high-traffic Angolan apps (taxi, delivery, ecommerce) as SDK integrators. Each integrator brings consumer exposure at scale. One taxi app with 50k monthly users creates more Banzami wallet activations than any marketing campaign.

### Phase 2 — Merchant density

QR deployment in physical merchants (cantinas, pharmacies, supermarkets, informal markets). The consumer app teaches the QR habit. Physical density makes QR the default payment option in daily life.

### Phase 3 — Network effects

When enough consumers have wallets and enough merchants accept QR, Banzami becomes the obvious integration for any new Angolan application. SDK adoption accelerates without active sales.

### Phase 4 — Geographic expansion

When Angola has achieved network density — measurable by QR adoption rate, active wallets, and SDK integrations — geographic expansion to neighboring markets (DRC, Congo-Brazzaville, Namibia, Zambia) becomes fundable and executable using the same wallet-native, QR-first model.

---

## Bank and Regulator Relationships

### Banks

Angolan banks are not competitors. They are:
- holders of the Kwanza that consumers and merchants use,
- providers of settlement accounts,
- regulated infrastructure that Banzami must interoperate with.

Banzami provides the commerce layer *above* banks:
- banks provide accounts, compliance, settlement, currency,
- Banzami provides instant UX, QR, SDKs, wallets, merchant tools.

This positioning opens partnership opportunities. Banks gain a modern commerce layer they cannot build themselves. Banzami gains access to licensed infrastructure it cannot own directly.

### BNA (Banco Nacional de Angola)

BNA is the monetary authority. All product decisions must account for BNA regulatory requirements: KYC, AML, transaction reporting, wallet licensing. Compliance is not a constraint that slows product — it is a trust asset that makes the product durable.

### EMIS

EMIS (Empresa Interbancária de Serviços) provides the interbank settlement rails and Multicaixa infrastructure. Banzami integrates EMIS for:
- AOA movement into and out of the Banzami wallet network,
- interbank settlement for merchants,
- Multicaixa Express compatibility.

EMIS integration is Tier 1 and non-negotiable. All other settlement rails are secondary.

---

## References

- [ADR-013 — Wallet-Native Payment Network Identity](../adr/ADR-013-wallet-native-identity.md)
- [ADR-014 — Angola-First National Mission](../adr/ADR-014-angola-national-mission.md)
- [CLAUDE.md §1 — Mission](../../CLAUDE.md)
- [Architecture README](../architecture/README.md)
- Pix (Brazil) — reference for QR national network adoption curve
- UPI (India) — reference for QR density and instant settlement at scale
- M-Pesa (Kenya/Tanzania) — reference for mobile money adoption in African markets
