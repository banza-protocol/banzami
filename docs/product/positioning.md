# Banzami Market Positioning

**Version:** 1.0  
**Date:** 2026-05-19  
**Status:** Active  

---

## The One-Line Position

**Banzami is Angola's instant payment network — QR-native, wallet-first, SDK-ready.**

---

## What Banzami IS

| Statement | Meaning |
|-----------|---------|
| Angola's QR-native instant payment network | QR codes are the primary merchant payment surface; settlement is instant, not delayed |
| The first Angola-native SDK payment infrastructure | Any Angolan app integrates Banza SDK and accepts AOA instantly — this infrastructure did not exist before |
| The wallet layer for Angolan digital commerce | Every account is a wallet; every payment is a wallet transfer; not card-centric |
| The payment API for Angolan applications | Taxi apps, delivery platforms, ecommerce, donation platforms — all use Banzami as their payment engine |
| The replacement for cash and WhatsApp payment confirmation | The explicit product target: eliminate manual transfer confirmation in Angolan commerce |

---

## What Banzami Is NOT

| Wrong Description | Why It Is Wrong |
|-------------------|-----------------|
| "Pan-African payment aggregator" | Premature. Angola first; expansion second. Claiming pan-African before achieving Angolan density is dishonest and distracts from what matters. |
| "Stripe for Africa" | Wrong model. Stripe is card-first, designed for Western card infrastructure. Banzami is wallet-native, QR-first, kwanza-native. The models are different. |
| "Generic African fintech platform" | Too vague to mean anything. Banzami solves Angola's specific payment problems. |
| "Cryptocurrency platform" | Out of scope. Banzami handles AOA via regulated banking infrastructure. |
| "Traditional banking app" | Banzami is not a bank. It is the commerce layer above banks. |
| "Card processor" | Cards are a future wallet top-up rail only. The core network is wallet ↔ wallet. |

---

## Positioning by Audience

### For Angolan merchants

> "Accept payments instantly. Print a QR. Get paid the moment a customer scans it. No waiting. No WhatsApp proof images. No manual bank transfer reconciliation."

Core proof points:
- Instant settlement — money appears in the merchant wallet the moment payment is confirmed
- QR-native — no card terminal, no POS hardware required for small merchants
- SDK for apps — taxi apps, delivery platforms, and ecommerce sites integrate in hours

### For Angolan developers

> "The first payment SDK built for Angola. Accept instant Kwanza payments inside your app in hours. Fully typed, idempotency-safe, webhook-verified."

Core proof points:
- Angola-native: AOA, pt-AO locale, @handle-based identity, EMIS-compatible
- SDK-first: typed APIs, automatic idempotency, retry handling, webhook signature verification
- No card complexity: wallet ↔ wallet transfers, QR generation, payment requests — not card tokenization forms

### For investors

> "Banzami is building the Pix of Angola — the QR-native national payment network that replaces cash and WhatsApp confirmation in the largest Portuguese-speaking country in Africa."

Core proof points:
- National mission with a specific market, not a vague continental play
- Defensible network effect: wallet density + merchant QR density = switching cost
- SDK ecosystem: every Angolan app that integrates Banzami is a node in the network
- EMIS integration: not building rails from scratch; using Angola's existing regulated interbank infrastructure
- Reference models: Pix (Brazil), UPI (India) — both achieved national scale from focused initial deployment
- Revenue model: transaction fees on instant settlement, payout fees, enterprise SDK licensing

### For Angolan banks (partnership framing)

> "Banzami is not competing with Angolan banks. We are the commerce layer above your infrastructure — bringing your customers instant digital payment UX, QR-native experiences, and developer SDKs that increase your platform's relevance in digital commerce."

---

## Reference Models

These platforms are cited as analogues for specific aspects of what Banzami builds. They are not competitors — none has meaningful Angolan presence.

| Platform | What Banzami Borrows |
|----------|---------------------|
| **Pix (Brazil)** | QR-native national payment network; instant settlement as the default; mass merchant adoption via simplicity |
| **UPI (India)** | @handle-based identity for payment addressing; national scale from focused domestic deployment |
| **M-Pesa (East Africa)** | Mobile-first financial inclusion; informal merchant adoption; trust via simplicity |
| **WeChat Pay (China)** | QR scan as the dominant consumer payment habit; wallet-native ecosystem |

Banzami is explicitly NOT modeled on:
- Stripe (card-first, Western infrastructure)
- PayPal (card-linked, remittance-adjacent, not local-rail-native)
- Adyen (enterprise card processing, no Angolan presence)
- Revolut (European neobank, card-primary)

---

## Language Rules

### Always use

- "instant payment" or "instant settlement" — not "fast payment" (fast is relative; instant is a product commitment)
- "wallet" — not "account" (accounts are bank constructs; Banzami has wallets)
- "AOA" or "Kwanza" — not generic "African currency"
- "@handle" — not "username" (the handle IS the payment address)
- "scan and pay" — not "tap to pay" (NFC is not the primary surface)
- "QR-native" — not "QR-enabled" (QR is not a feature; it is the primary payment UX)
- "Angola's payment network" — not "African payment network" (until expansion is proven)

### Avoid

- "pan-African" in any current-tense claim
- "Stripe for Africa" or "X for Africa" analogies (lazy positioning, wrong model)
- "fintech" alone without context (too generic)
- "card payment" in any primary context (card is a future top-up rail, not the product)
- "bank transfer" framed as a feature (bank transfers are the *problem* Banzami solves)

---

## The Elevator Pitch (60 seconds)

> In Angola, most businesses still get paid via manual bank transfers, verified by WhatsApp screenshots. It's slow, error-prone, and doesn't scale for apps.
>
> Banzami is Angola's QR-native instant payment network. A merchant prints a QR. A customer scans it. Money moves instantly — confirmed on both sides, no WhatsApp, no waiting, no reconciliation.
>
> For developers, we provide the first Angola-native SDK: any taxi app, delivery platform, or ecommerce site integrates Banza in hours and starts accepting instant Kwanza payments inside their product.
>
> We're building what Pix did for Brazil — but for Angola. Angola first, then the region.

---

## References

- [Product Strategy](strategy.md)
- [ADR-014 — Angola-First National Mission](../adr/ADR-014-angola-national-mission.md)
- [ADR-013 — Wallet-Native Payment Network Identity](../adr/ADR-013-wallet-native-identity.md)
- [CLAUDE.md §1 — Mission](../../CLAUDE.md)
