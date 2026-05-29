# ADR-014 — Angola-First National Mission and Market Positioning

**Status:** Accepted  
**Date:** 2026-05-19  
**Supersedes:** None  
**Extends:** [ADR-013](ADR-013-wallet-native-identity.md)

---

## Context

ADR-013 established the wallet-native technical identity: Banza is a wallet ↔ wallet payment network, QR-native, @handle-based, instant settlement — not a card processor.

But it did not answer a second, equally important question: **whose network is this?**

A fintech platform can be wallet-native and still make the wrong market choices: trying to serve all of Africa before serving one country well, building for diaspora use cases before local ones, or framing the product as a generic "African Stripe" — which confuses investors, confuses developers, and confuses merchants.

Without a clear national mission statement, the following failure modes are possible:

1. **Geographic dilution** — building for 54 countries simultaneously means building nothing useful for any one market.
2. **Use-case dilution** — trying to solve every payment problem instead of solving Angola's specific payment problems.
3. **Wrong competitive frame** — positioning against Stripe or PayPal (who have no Angolan presence and no AOA infrastructure) instead of positioning as the replacement for cash and manual transfer.
4. **Wrong technical priorities** — building international card rails instead of local QR and EMIS integration.

Angola has specific, well-understood payment problems that Banza is uniquely positioned to solve. The mission must be encoded explicitly.

---

## Decision

**Banza's primary mission is to modernize and revolutionize digital payments in Angola. This is the anchor for all product, engineering, and positioning decisions.**

Banza is NOT:

* a pan-African payment aggregator (premature — Angola first, expansion second),
* a Stripe clone for Africa (wrong model — see ADR-013),
* a generic fintech platform,
* a cryptocurrency platform,
* a traditional banking app.

Banza IS:

* Angola's QR-native instant payment network,
* the first Angola-native SDK payment infrastructure,
* the wallet layer for Angolan digital commerce,
* the payment API for Angolan applications,
* the replacement for cash and WhatsApp payment confirmation in Angola.

---

## The National Objectives

### Objective 1: First QR-native instant payment network in Angola

Banza must make QR payments the normal expectation for Angolan consumers and merchants — the same way Pix did in Brazil and UPI did in India.

A cantina owner prints a QR. A customer scans it. Payment is instant. There is no manual confirmation, no bank transfer waiting, no WhatsApp proof image sent.

This is the target. It is achievable. It requires discipline and focus on Angola.

### Objective 2: First Angola-native SDK payment infrastructure

Any Angolan application — taxi app, delivery platform, marketplace, school system, donation platform, ecommerce site — should be able to integrate Banza in hours and accept instant Kwanza payments natively inside their product.

This does not exist today. Banza builds it.

---

## Market Reality: Angola's Payment Problems

### The cash problem
Despite mobile penetration, cash remains dominant for most transactions. The friction of digital payment — manual transfer, reference codes, waiting for confirmation — makes cash simpler. Banza must make digital simpler than cash.

### The WhatsApp proof problem
The current "digital" payment flow in many informal Angolan businesses:
1. Customer initiates bank transfer
2. Customer screenshots the confirmation
3. Customer sends screenshot to merchant on WhatsApp
4. Merchant waits, verifies, confirms

This is not digital commerce. It is manual reconciliation with an extra step. Banza eliminates it.

### The taxi app problem
Ride-hailing and delivery apps in Angola cannot close the payment loop in-app. The payment step forces a departure from the product — cash, external transfer, or third-party workaround. Banza enables in-app instant settlement for these flows.

### The SDK gap
There is no Angola-native payment SDK. Developers building Angolan applications have no clean, typed, idempotency-safe API layer to accept instant Kwanza payments. Banza fills this gap.

---

## The Role of EMIS

EMIS (Empresa Interbancária de Serviços) is Angola's interbank payment infrastructure. It provides:

* interbank settlement rails,
* reference payment systems (Multicaixa),
* debit network infrastructure.

EMIS is a **payment rail** — not a payment product.

Banza uses EMIS as an integration point, not as the product layer. The product layer — QR codes, wallets, SDKs, merchant dashboards, consumer apps, payment requests — is Banza. EMIS makes it possible to move real Kwanza into and out of the Banza wallet network.

This distinction is critical:

| Layer | Provider |
|-------|---------|
| Payment product (QR, wallet, SDK, UX) | Banza |
| Interbank settlement rail | EMIS / Multicaixa |
| Banking infrastructure | Angolan banks |
| Regulatory framework | BNA (Banco Nacional de Angola) |

---

## Bank Relationship Philosophy

Angolan banks are not competitors. They are:

* holders of the kwanza that consumers and merchants use,
* providers of settlement accounts,
* regulated infrastructure that Banza must interoperate with.

Banza does not replace banks. It provides the commerce layer above them:

* banks provide: accounts, compliance, settlement, currency,
* Banza provides: instant UX, QR, SDKs, wallets, merchant tools.

This positioning opens partnership opportunities rather than closing them.

---

## Ecosystem Target Use Cases

These are the specific Angolan use cases Banza is built to serve, in priority order:

### Tier 1 — Core Use Cases
1. **QR point-of-sale** — merchant displays QR, consumer scans and pays instantly
2. **Payment links** — merchant shares a link, consumer opens and pays
3. **In-app payments via SDK** — any app integrates Banza and accepts instant Kwanza
4. **P2P transfers** — consumer sends money to another via @handle

### Tier 2 — Growth Use Cases
5. **Taxi / ride-hailing** — in-app payment at ride completion
6. **Donations and creator payments** — platforms like DOA accept instant Kwanza
7. **Delivery and marketplace** — split and instant settlement on order completion
8. **Small merchant wallet** — cantinas, market sellers, informal commerce

### Tier 3 — Scale Use Cases
9. **Ecommerce checkout widget** — hosted checkout on web and mobile
10. **School and institution fees** — fee collection with receipt
11. **Government and utility payments** — future integration

---

## Geographic Expansion Philosophy

Angola first. Not because other markets are unimportant, but because:

1. A network effect requires density. A payment network that tries to serve 54 countries at once achieves critical mass in none.
2. Regulatory depth requires focus. Angola's BNA, EMIS integration, and KYB processes require dedicated attention.
3. Product-market fit requires specificity. A product optimised for Angola is a product optimised for real users.

When Banza has achieved network density in Angola — when QR payments are normal, when the SDK is integrated by a meaningful number of Angolan apps — geographic expansion becomes a logical and fundable next step.

That expansion will use the same wallet-native, QR-first, SDK-first model. The technical architecture is already designed for it. But it must not distract from Angola today.

---

## Consequences

### Engineering consequences

* All Tier 1 features must solve the Angolan use cases above.
* EMIS integration is Tier 1. International card rails are future.
* The consumer app experience must be optimised for Angolan mobile users (data-aware, offline-tolerant, Portuguese-first).
* Dashboard and admin tooling must support AOA as the primary currency.

### Product consequences

* Every new feature must be evaluated against: does this reduce cash usage or manual transfer confirmation in Angola?
* The positioning in all marketing, docs, and SDKs uses the Angolan-specific framing above.
* Investor communication uses the national mission as the primary story.

### Documentation consequences

* All developer documentation defaults to Angolan examples (AOA, pt-AO locale, @handle flows, QR flows).
* SDK documentation leads with QR payment and payment link examples — not card examples, not SEPA examples.

---

## References

* [ADR-013 — Wallet-Native Payment Network Identity](ADR-013-wallet-native-identity.md)
* [ADR-012 — SDK-First Ecosystem](ADR-012-sdk-first-ecosystem.md)
* [CLAUDE.md §1 — Mission](../../CLAUDE.md)
* Pix (Brazil) — national QR payment network reference
* UPI (India) — national instant payment reference
* M-Pesa (East Africa) — mobile money reference
* EMIS / Multicaixa — Angola interbank infrastructure
