# Banzami — Official Reference Document

**Version:** 1.0  
**Date:** 2026-05-19  
**Status:** Official  
**Author:** Fidel Monteiro — `@fm65`

---

> **Banzami is Angola's QR-native instant payment network.**  
> Wallet-to-wallet. Instant settlement. No card required. Built for every Angolan.

---

Angola does not need a copy of someone else's payment system.  
Angola needs its own — built for Kwanza, built for QR, built for the smartphone in every pocket.

**That is Banzami.**

---

## Table of Contents

1. [What Is Banzami?](#1-what-is-banzami)
2. [Why Banzami Exists](#2-why-banzami-exists)
3. [Why Now?](#3-why-now)
4. [The Vision](#4-the-vision)
5. [A Morning in Luanda](#5-a-morning-in-luanda)
6. [How Banzami Works](#6-how-banzami-works)
7. [Core Features](#7-core-features)
8. [Real Angola Use Cases](#8-real-angola-use-cases)
9. [QR Payment Ecosystem](#9-qr-payment-ecosystem)
10. [Wallet-Native Philosophy](#10-wallet-native-philosophy)
11. [Banzami for Merchants](#11-banzami-for-merchants)
12. [Banzami for Developers](#12-banzami-for-developers)
13. [Banzami for Consumers](#13-banzami-for-consumers)
14. [The Banzami Flywheel](#14-the-banzami-flywheel)
15. [Banzami Business Ecosystem](#15-banzami-business-ecosystem)
16. [Security & Financial Integrity](#16-security--financial-integrity)
17. [Technical Architecture](#17-technical-architecture)
18. [The Banzami Ecosystem](#18-the-banzami-ecosystem)
19. [Roadmap & Future](#19-roadmap--future)
20. [Final Vision Statement](#20-final-vision-statement)

---

## 1. What Is Banzami?

Banzami is **Angola's instant payment network** — a complete digital payment infrastructure built specifically for Angolan commerce, Angolan merchants, and Angolan consumers.

It is not a bank. It is not a card processor. It is not a generic fintech platform adapted from a Western model and rebranded for Africa.

Banzami is a **wallet-native payment network**: every account is a digital wallet, every payment is an instant wallet-to-wallet transfer, and every merchant interaction is a QR code. Money moves between wallets in real time — confirmed, settled, and visible in seconds.

### The four pillars of Banzami

| Pillar | What it means |
|--------|---------------|
| **Wallet-native** | Every account is a digital Kwanza wallet. Payments are direct wallet transfers. No IBAN required. No bank code required. No card required. |
| **QR-native** | The primary merchant payment surface is a QR code. A merchant prints a QR. A consumer scans it. Payment is instant. No card terminal, no hardware, no friction. |
| **Instant settlement** | Money moves the moment payment is confirmed. Not the next business day. Not after manual verification. Instantly — in the same transaction. |
| **SDK-first** | Every Angolan application — taxi apps, delivery platforms, ecommerce sites, donation platforms — integrates Banzami in hours and accepts instant Kwanza payments natively inside their product. |

### The canonical payment experience

```
Consumer scans merchant QR
          ↓
Confirms amount and merchant identity (one tap)
          ↓
Payment committed and settled atomically
          ↓
Merchant receives instant notification + balance update
          ↓
Consumer sees success confirmation
```

**Total time from scan to confirmed settlement: under 3 seconds.**

### Identity in Banzami

Every person and every merchant in the Banzami network has a **@handle** — a human-readable payment address. Sending money in Banzami looks like this:

```
Pay: @cantina.luanda
Amount: 2.500 Kz
```

No bank account number. No IBAN. No reference codes. No card details. Just a handle and an amount.

### Who Banzami serves

- **Merchants** — from cantinas and market stalls to ecommerce platforms and taxi apps
- **Developers** — building the next generation of Angolan applications that need to accept payments
- **Consumers** — every Angolan who wants to pay, send money, and receive payments instantly
- **Banks and partners** — who want to offer their customers a modern digital commerce layer

---

### Why the name Banzami?

**Banza** is a word rooted in the Kimbundu language tradition — one of Angola's oldest living languages, spoken by millions of Angolans, present in place names across the country, and woven into the cultural memory of this nation. A *banza* is a place. A gathering. A home. A centre of life where people come together.

Banzami takes that root and builds from it. A payment network takes its character from the people who use it. A name that is distinctly Angolan — not a borrowed word, not a translated concept, not a brand invented in another continent — was the only honest choice.

The name is a signal: this platform was made here. For here.

---

## 2. Why Banzami Exists

Angola has a payments problem. It is not a technology problem — Angola has strong mobile penetration, growing internet infrastructure, and a population that is ready for digital commerce. The problem is that the existing payment experience is broken in predictable, fixable ways.

### 2.1 The cash dependency

Despite widespread smartphone usage, cash remains the dominant payment method in Angola for one clear reason: **cash is simpler than the existing digital alternatives**.

Paying digitally today means finding a bank branch or ATM, initiating a transfer, copying a reference code, waiting for confirmation, and sometimes manually proving the payment to the merchant. For small, everyday purchases — a meal at a cantina, a ride home, a purchase at the market — cash is simply faster.

**Banzami makes digital payments faster than cash.**

### 2.2 The WhatsApp proof problem

The current "digital" payment flow in Angolan informal commerce is not digital at all:

```
Step 1 — Customer initiates a bank transfer
Step 2 — Customer takes a screenshot of the confirmation
Step 3 — Customer sends the screenshot to the merchant via WhatsApp
Step 4 — Merchant inspects the screenshot manually
Step 5 — Merchant decides whether to trust it
```

This is manual reconciliation disguised as digital payment. It creates disputes. Screenshots can be fabricated. It fails completely at scale. The merchant must trust a photo on a screen, and the customer must hope the merchant honours it.

**Banzami eliminates this entirely.** When a customer scans a Banzami QR and confirms payment, the merchant sees instant, cryptographically confirmed notification in their app. No screenshots. No WhatsApp messages. No manual check. The payment is settled and the merchant wallet is updated in real time.

### 2.3 The in-app payment gap

Angolan taxi apps, delivery platforms, and marketplaces cannot close the payment loop inside their products. The payment step forces users outside the app — to cash, to an external bank transfer, to fragile workarounds that break more often than they work.

The result: broken user experiences, high dropout rates, and merchants who cannot deliver a seamless digital service regardless of how good their product is.

Banzami provides the SDK infrastructure that allows any Angolan application to embed a complete payment flow — confirmation, settlement, receipt — without the consumer ever leaving the app.

### 2.4 The SDK gap

There is no Angola-native payment SDK. A developer building an Angolan application has no clean, typed, production-ready API for accepting instant Kwanza payments. They improvise — with security vulnerabilities, inconsistent behaviour, no retry logic, and no meaningful support when something goes wrong.

Banzami is the first payment infrastructure built specifically for Angolan developers: typed SDKs, automatic idempotency, exponential backoff retry, webhook signature verification, and sandbox testing — all production-grade, all out of the box.

### 2.5 The merchant exclusion problem

Small merchants — cantinas, pharmacies, market vendors — are excluded from digital commerce because existing solutions require expensive hardware, formal bank agreements with complex requirements, or card terminal infrastructure that the majority of Angola's merchants simply cannot access.

Banzami requires none of this. A merchant needs a phone and a printed QR code. That is the entire infrastructure requirement to begin accepting instant digital payments.

---

## 3. Why Now?

The conditions for a payment network transformation in Angola are not future possibilities. They are present realities.

### 3.1 The smartphone is already there

Angola has one of the fastest-growing mobile penetration rates on the continent. Smartphones are no longer scarce. They are in cantinas, in markets, in taxis, in schools, in homes across Luanda, Benguela, Huambo, and beyond. The device that delivers Banzami is already in the pocket of the person we need to reach.

The infrastructure barrier that once blocked digital commerce — "people don't have phones" — no longer exists.

### 3.2 The WhatsApp economy is proof

Angola already has a digital economy. It runs on WhatsApp. Products are sold, services are negotiated, and even payments are confirmed — via screenshots — over WhatsApp every day.

This is not a sign that Angolans are not ready for digital commerce. It is proof that they already conduct digital commerce, using whatever tools are available. Banzami is the better tool. It does what WhatsApp-plus-screenshots does, but correctly, instantly, and securely.

The habit already exists. Banzami improves it.

### 3.3 QR has already proven the model globally

In Brazil, Pix created a QR-native instant payment network that became the dominant payment method in under three years. In India, UPI processes billions of transactions monthly using @handle-based instant transfers. In China, WeChat Pay made QR scanning so habitual that physical cash has become the exception in major cities.

None of these countries had special advantages. They had a clear infrastructure, a focused rollout, and a product that was genuinely better than cash. Angola has all the same preconditions. The model is proven.

### 3.4 The informal economy needs digital infrastructure

The majority of Angolan commerce happens informally. Market vendors, street merchants, freelancers, small businesses — these are not edge cases. They are the economic backbone of the country. Existing digital payment solutions have systematically excluded them.

A QR-native, hardware-free, zero-monthly-fee payment network is the first solution that fits how informal Angolan commerce actually works.

### 3.5 The developer generation is ready

Angola has a growing generation of developers building mobile applications, web platforms, and digital services for the local market. They are skilled, motivated, and working on real problems. What they lack is an Angolan payment API — a clean, reliable way to accept Kwanza in their products.

Banzami is that infrastructure. The developer community is ready to build with it.

### 3.6 The leapfrog opportunity

Angola has the opportunity to leapfrog the card infrastructure phase entirely. Western economies built payment networks around cards in the 1980s and are now slowly migrating away from them. Angola never built a card network at scale. That means Angola can go directly to the better model: wallet-native, QR-first, instant settlement.

Angola does not need to repeat a 40-year detour. It can start at the destination.

---

## 4. The Vision

Angola's digital economy is not broken — it is unfinished. The infrastructure exists. The population is ready. What is missing is the payment layer that connects them.

Banzami's vision is to complete that layer.

### The target future

```
A cantina owner in Luanda prints a QR code and places it on the counter.
A customer orders, picks up their phone, and scans the QR.
Payment is confirmed in under 3 seconds.
The owner's phone shows: "Recebeu 2.500 Kz."
No cash changes hands. No screenshots are sent. No one waits for anything.
```

```
A taxi driver completes a ride.
The app shows the fare.
The passenger taps "Pagar."
Money moves from the passenger's Banzami wallet to the driver's wallet instantly.
The ride closes. The driver sees the payment. The passenger gets a receipt.
No cash. No friction. No manual confirmation.
```

```
A student needs to pay school fees.
The school sends a payment request to the parent's Banzami app.
The parent sees the amount, the school name, and the term.
One tap. Paid. The school records it immediately.
```

These are not ambitious futures. They are achievable today, with infrastructure that already exists, for users who are already connected. Banzami is the missing layer.

### What success looks like

Banzami's mission is achieved when:

- QR payments are the **normal expectation** in Angolan shops, restaurants, and markets — not a novelty
- Every Angolan taxi app, delivery platform, and ecommerce site uses a Banzami SDK as its payment engine
- The WhatsApp proof-of-payment has disappeared from Angolan commerce
- A significant share of everyday Angolan transactions happen digitally, without cash
- Angolan developers have a payment infrastructure they are proud to build on
- The Banzami network has become infrastructure — part of how Angola works

The reference models for this kind of transformation exist. Brazil's **Pix** turned QR payments into the national default in under three years. India's **UPI** made @handle-based instant transfers the standard for one billion people. Both started with focus: one country, one network, one clear promise to every user.

**Banzami is that for Angola.**

---

## 5. A Morning in Luanda

*This is not a product demo. This is a vision of ordinary life when Banzami has become the default.*

---

**7h15.** Amélia wakes up, checks her Banzami wallet on her phone. She received 5.000 Kz overnight — her younger brother paid back money she lent him last week. He sent it from Benguela at 23h00. It arrived instantly. There was no bank transfer. There was no WhatsApp message. He typed `@amelia.luanda`, entered the amount, confirmed with his PIN, and it was done.

**8h00.** At the corner cantina near her apartment, Amélia orders coffee and bread. She points her phone at the QR code taped to the wall. The app shows `@cantina.margarida`. She types `1.500 Kz` and presses her thumb to confirm. Margarida's phone lights up at the counter: *"Recebeu 1.500 Kz de @amelia.luanda."* No change. No waiting. Breakfast done.

**8h30.** Amélia works as a freelance graphic designer. A client owed her for a logo. She had sent a payment link last week: `pay.banzami.org/fatura-logo-92`. This morning she opens the merchant dashboard on her laptop and sees the status change to **Pago** — the client paid at 8h22. She has the money. She has the digital receipt. She did not have to send a single WhatsApp message to chase it.

**12h30.** Lunch with three colleagues. The restaurant generates a dynamic QR for the group's table — total 18.000 Kz, split four ways. Each person scans the QR from their phones and pays 4.500 Kz. The restaurant's app shows `18.000 Kz recebidos` within seconds of the last scan. No one pulls out a wallet. No one does mental arithmetic trying to make change. The table clears in minutes.

**17h00.** Amélia takes a ride home. The app shows the fare at the end of the trip: 3.200 Kz. She taps "Pagar." One tap, biometric confirm. The driver's phone notifies him. The ride closes in the app. Neither of them mentioned cash.

**19h30.** Her daughter's school sent a payment request this morning — monthly tuition for March: 35.000 Kz. Amélia opens it in the Banzami app. The school name is there. The amount is there. The description says "Propinas — Março 2026." She pays in one tap. The school marks the fee as settled. No queue. No bank. No receipt to carry.

**22h00.** Before sleeping, Amélia checks her wallet. Today she spent 1.500 Kz (cantina), 4.500 Kz (lunch), 3.200 Kz (taxi), 35.000 Kz (school fees). Received 5.000 Kz (brother) and 25.000 Kz (client). Every transaction is there, timestamped, labelled, clear. No mystery. No missing Kwanza. Full visibility over her day.

---

*Cash never appeared. WhatsApp proof images were never sent. No one queued at a bank. No reference codes were copied. No one waited.*

*This is a normal Tuesday in Luanda. Powered by Banzami.*

---

## 6. How Banzami Works

### 6.1 The fundamental operation

Everything in Banzami is built on one operation:

```
Consumer Wallet  ────[instant ledger transfer]────▶  Merchant Wallet
```

When a consumer pays a merchant, money moves from one digital wallet to another. The transfer is atomic, instant, and recorded in an immutable financial ledger. There is no intermediate state, no pending period, no settlement delay. The money is in the merchant wallet the moment the consumer confirms payment.

This is the core of the network. Every product feature — QR codes, payment links, payment requests, SDK integrations — is a different way of initiating this same fundamental operation.

### 6.2 Wallets

Every person and every merchant in Banzami has a **digital Kwanza wallet**. A wallet holds AOA balances, receives payments, and sends transfers. It is not a bank account — it is a Banzami-native payment account, instantly accessible from any device.

```
┌─────────────────────────────────────┐
│  @joao.silva                        │
│  Wallet ID: wlt_...                 │
│                                     │
│  Available:    12.750 Kz  ← spendable now
│  Reserved:      2.500 Kz  ← pending operation
│  ─────────────────────────────────  │
│  Total:        15.250 Kz            │
└─────────────────────────────────────┘
```

The **available** balance can be spent or transferred immediately. The **reserved** balance covers pending operations. Both are always accurate. There is no "please check back in a few minutes."

### 6.3 @Handles

Every Banzami account has a **@handle** — a unique, human-readable identifier that doubles as the payment address.

```
@joao.silva          ← consumer handle
@cantina.luanda      ← merchant handle
@escola.benguela     ← institution handle
@doa.creators        ← platform handle
```

Handles replace the need for bank account numbers, IBANs, or reference codes. To send money to someone, you type their handle. To receive money, you share your handle. Merchants print their handle on physical signs next to their QR code. It is simultaneously a brand, an address, and a payment identity.

### 6.4 QR payments

A **QR code** is a visual payment address — a scannable shortcut to a wallet. Scanning it tells the consumer's app exactly where the payment should go.

**Static QR** — permanent, linked to a wallet. The consumer scans, enters the amount, and pays. Printed once, used indefinitely.

**Dynamic QR** — generated for a specific transaction, with a fixed amount and expiry. The consumer scans and only needs to confirm.

```
QR scan flow:

┌──────────────────────────────────┐
│  Consumer opens phone camera     │
│  or Banzami app                  │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  Scans merchant QR code          │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  App decodes:                    │
│  → Merchant: @cantina.luanda     │
│  → Amount: 2.500 Kz (dynamic)    │
│    or consumer enters (static)   │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  Confirmation screen:            │
│  "Pagar 2.500 Kz a               │
│   @cantina.luanda?"              │
│                                  │
│  [✓ Confirmar com impressão]     │
└──────────────┬───────────────────┘
               │ biometric / PIN
               ▼
┌──────────────────────────────────┐
│  ✅ PAGO — 2.500 Kz              │
│  @cantina.luanda                 │
│  Há 2 segundos                   │
└──────────────────────────────────┘
```

Simultaneously:

```
Merchant phone: 📳 "Recebeu 2.500 Kz de @joao.silva"
Merchant wallet: balance updated in real time
```

### 6.5 Payment links

A **payment link** is a shareable URL containing a pre-configured payment request. The merchant sends it via WhatsApp, SMS, email, or social media. The consumer opens it in a browser and pays with their Banzami wallet.

```
https://pay.banzami.org/abc123
```

Payment links directly replace the "send me the WhatsApp screenshot" flow. The consumer clicks a link, sees the merchant and amount, confirms payment, and the merchant sees instant settlement — no screenshot, no manual check, no trust required.

### 6.6 Payment requests

A **payment request** is a digital invoice pushed directly to a specific consumer's wallet. The consumer sees it as a notification and pays or declines with a single tap.

```
Merchant sends:    "Pagamento de 15.000 Kz — Encomenda #42"
Consumer receives: push notification → opens Banzami app
Consumer taps:     "Pagar"
Result:            instant settlement + receipt for both
```

### 6.7 EMIS and the banking layer

Banzami integrates with **EMIS** (Empresa Interbancária de Serviços) — Angola's interbank payment infrastructure — to allow money to flow between Banzami wallets and the Angolan banking system.

EMIS is the rail. Banzami is the product.

```
┌────────────────────────────────────────────┐
│   Banzami Product Layer                    │
│   wallets · QR · SDKs · merchant tools     │
│   @handles · payment links · instant UX    │
├────────────────────────────────────────────┤
│   EMIS / Multicaixa Express                │
│   (Angola's interbank settlement rail)     │
├────────────────────────────────────────────┤
│   Angolan Banks                            │
│   (accounts, regulated settlement)        │
├────────────────────────────────────────────┤
│   BNA — Banco Nacional de Angola           │
│   (monetary authority, regulation)         │
└────────────────────────────────────────────┘
```

Banzami does not replace the banking system. It builds the commerce layer above it.

---

## 7. Core Features

### Payments

| Feature | Description |
|---------|-------------|
| **QR payments** | Consumer scans merchant QR; instant wallet-to-wallet settlement; no hardware required |
| **P2P transfers** | Consumer sends money to any @handle; instant; no bank details needed |
| **Payment links** | Shareable URLs; consumer opens in browser and pays; merchant sees instant confirmation |
| **Payment requests** | Digital invoice pushed to a consumer's wallet; pay or decline in one tap |
| **Instant settlement** | Money in the recipient wallet the moment payment is confirmed; no pending periods |

### Merchant tools

| Feature | Description |
|---------|-------------|
| **Merchant wallet** | Dedicated business wallet for receiving payments, tracking balances, and requesting payouts |
| **Merchant dashboard** | Web interface for transaction history, analytics, refunds, disputes, and team management |
| **QR storefront** | Public merchant profile page at `pay.banzami.org/profiles/@handle` |
| **Static QR generation** | Permanent QR code for the merchant's wallet; print and display anywhere |
| **Dynamic QR generation** | Per-transaction QR with fixed amount and expiry |
| **Payouts** | Withdraw wallet balance to an Angolan bank account on demand |
| **Refunds** | Issue partial or full refunds from the merchant dashboard or API |
| **Dispute management** | Structured resolution process for payment disputes |

### Developer platform

| Feature | Description |
|---------|-------------|
| **REST API** | Versioned, idempotent HTTP API for all platform operations |
| **TypeScript SDK** | Fully typed Node.js/browser SDK with automatic idempotency and retry |
| **PHP SDK** | PSR-18 compatible SDK with Laravel integration |
| **Go SDK** | Native Go client with context propagation and structured errors |
| **Python SDK** | Async-first SDK with Pydantic v2 and Django/FastAPI support |
| **Flutter SDK** | Mobile SDK for in-app payment flows and QR commerce |
| **Webhook system** | Real-time event delivery with HMAC-SHA256 signature verification and automatic retry |
| **Sandbox environment** | Fully isolated test environment; identical API surface; no real money |

### Infrastructure

| Feature | Description |
|---------|-------------|
| **Idempotency** | All payment operations are safe to retry; duplicate submissions produce no side effects |
| **Double-entry ledger** | Every monetary movement recorded as immutable ledger entries; fully auditable |
| **Reconciliation** | Automated daily reconciliation of all wallet balances and ledger entries |
| **Risk engine** | Real-time transaction screening for fraud and compliance signals |
| **KYC/KYB** | Identity verification for consumers and merchants; tiered by transaction volume |

---

## 8. Real Angola Use Cases

### 8.1 Taxi and ride-hailing apps

**The problem today:**  
An Angolan ride-hailing app completes a trip but cannot collect payment in-app. The driver says "cash only." The passenger scrambles for change. The platform has zero visibility into payments. The driver carries cash all day — a safety risk.

**With Banzami:**  
The ride ends. The app shows the fare. The passenger sees a confirmation screen. One tap — biometric or PIN. The fare transfers instantly from the passenger's wallet to the driver's. The platform receives a webhook. The ride closes automatically.

```
BEFORE: Ride ends → driver requests cash → passenger finds change → no digital record
AFTER:  Ride ends → app shows fare → passenger taps "Pagar" → instant settlement
```

### 8.2 Cantinas and small merchants

**The problem today:**  
A cantina owner wants to accept digital payments. A bank POS terminal requires a formal bank agreement and charges per transaction. Most small merchants do not qualify. The only alternative is accepting bank transfers and waiting for WhatsApp screenshots — some of which are fabricated.

**With Banzami:**  
The owner registers on Banzami, creates a wallet, and downloads their QR code. They print it on paper and place it on the counter. When a customer scans it and pays, the owner's phone shows "Recebeu 2.500 Kz." No terminal. No monthly fee. No waiting. No screenshots.

```
BEFORE: Customer pays → sends WhatsApp screenshot → owner verifies manually
AFTER:  Customer scans QR → pays instantly → owner's phone confirms in real time
```

### 8.3 Ecommerce and online stores

**The problem today:**  
An Angolan ecommerce site has no reliable way to collect online payments in Kwanza. International processors do not support AOA. Customers are redirected to external banking portals. Checkout abandonment is high.

**With Banzami:**  
The site integrates the Banzami TypeScript SDK. At checkout, the customer confirms payment with their wallet. Settlement is instant. The store receives a webhook and fulfils the order. No redirect. No external portal.

```typescript
// Ecommerce checkout — TypeScript
const link = await client.createPaymentLink({
  merchantId:  'mch_...',
  walletId:    'wlt_...',
  amountMinor: 45000,           // 45 000 Kz
  description: 'Encomenda #1042 — 3 produtos',
});
// Customer pays → webhook fires → order fulfilled
```

### 8.4 Donation and creator platforms

**The problem today:**  
A creator or NGO running a platform like DOA cannot accept instant digital donations in Kwanza. Supporters send bank transfers and email proof. Many drop off. The platform has no real-time tracking.

**With Banzami:**  
The platform integrates Banzami payment links or payment requests. A supporter taps "Apoiar com 1.000 Kz." The donation transfers instantly. The creator sees it in real time. The entire flow happens in-app.

```
BEFORE: Supporter sends transfer → emails proof → platform waits
AFTER:  Supporter taps "Apoiar" → instant transfer → creator sees it immediately
```

### 8.5 Delivery apps and marketplaces

**The problem today:**  
A food delivery app cannot close the payment loop in-app. Cash on delivery creates safety risks for drivers, fraud risk for merchants, and broken UX for consumers.

**With Banzami:**  
The delivery app integrates the Flutter SDK. When the driver marks an order delivered, the consumer's app prompts for payment. One tap — instant settlement. The restaurant and the driver both see it. Cash disappears from the flow entirely.

### 8.6 Schools and institutions

**The problem today:**  
A school collects tuition via bank transfer. Parents queue at banks. Receipts are delivered manually. The school has no real-time view of outstanding balances.

**With Banzami:**  
The school issues payment requests for each student. Parents receive a notification, see the student name and amount, and pay with one tap. The school dashboard shows paid and outstanding in real time.

```
BEFORE: Parent queues at bank → manual transfer → delivers receipt → school processes manually
AFTER:  Parent taps "Pagar" → instant settlement → school sees it in real time
```

### 8.7 Freelancers and professionals

**The problem today:**  
A freelance designer invoices a client. The client makes a bank transfer. The freelancer waits hours for confirmation. There is no structured payment record.

**With Banzami:**  
The freelancer generates a payment link or request. The client clicks, confirms, and the wallet is credited instantly. Both parties have a timestamped digital receipt.

### 8.8 Restaurants and cafés

**The problem today:**  
A group dinner ends. The table tries to split the bill via individual bank transfers to the server's account. The server must reconcile multiple payments manually before the table can leave.

**With Banzami:**  
The restaurant generates a dynamic QR for the table's total. Customers scan and pay their share. Each payment is confirmed instantly. When the full amount is reached, the table is done.

---

## 9. QR Payment Ecosystem

QR codes are not a feature in Banzami — they are the **primary payment surface**.

The logic is fundamental. A QR code is a visual payment address. It can be printed, displayed on a screen, shared as an image, or embedded in a document. It requires no card terminal, no NFC hardware, no proprietary equipment. A merchant with a phone and a printer has everything they need.

### 9.1 Static QR

A static QR encodes a wallet reference and @handle. Printed once, used indefinitely.

**Typical placement:** taped to a cantina wall, placed at a market stall, set on a restaurant table, shown on a phone screen.

```
┌──────────────────────────────────────────────┐
│                                              │
│   QR payload: banzami://pay/@cantina.luanda  │
│                                              │
│   ┌────────────────────┐                     │
│   │  ▓▓▓  ░░  ▓▓▓▓    │  @cantina.luanda    │
│   │  ▓▓▓  ░░  ▓▓▓▓    │                     │
│   │    ░░░░░░░░        │  Scan to Pay        │
│   │  ▓▓▓  ░░  ▓▓▓▓    │                     │
│   └────────────────────┘                     │
│                                              │
└──────────────────────────────────────────────┘
```

When a consumer scans a static QR, they see the merchant name and enter the amount. One confirmation, instant payment.

### 9.2 Dynamic QR

A dynamic QR encodes a specific amount and expires after use or a time limit.

```
QR payload: banzami://pay/qr/qrc_abc123
            └── resolves to: @cantina.luanda, 2.500 Kz, expires in 5 min
```

The consumer scans. The amount is pre-filled. They only confirm. Used for per-transaction flows: restaurant orders, delivery confirmations, POS integrations.

### 9.3 Merchant QR storefront

Every merchant has a public profile page at `pay.banzami.org/profiles/@handle`:

```
┌──────────────────────────────────────────────┐
│  [Logo]  Cantina da Margarida                │
│          @cantina.luanda                     │
│          Comida · Luanda, Maianga            │
│                                              │
│  "A melhor comida caseira do bairro."        │
│                                              │
│  [ Pagar agora — 2.500 Kz ]                  │
│                                              │
│  IG: @cantina.luanda  WA: +244 9xx xxx xxx   │
└──────────────────────────────────────────────┘
```

Shareable on Instagram, WhatsApp, printed flyers, and email. Any consumer who visits can pay instantly.

### 9.4 P2P QR

Consumers display their personal QR to receive money from friends or family. Identical flow to a merchant QR — wallet-to-wallet, instant.

**Common use:** splitting a bill, repaying a friend, parent sending lunch money to a child at school.

### 9.5 Why QR is the right surface for Angola

| Alternative | Why it fails |
|-------------|-------------|
| Card terminals | Expensive hardware, bank agreement required, excludes the majority of merchants |
| Bank transfer | IBAN and reference codes, no instant confirmation, manual reconciliation |
| NFC payments | Requires NFC-capable hardware, not universal |
| Cash | No digital record, security risk, no remote or online payment |
| **QR (Banzami)** | Works with any smartphone, zero hardware cost, instant confirmation, free to display, works remotely |

QR eliminates the infrastructure barrier that has kept small merchants outside of digital commerce. A merchant with a phone and a printer is ready to accept instant digital payments.

---

## 10. Wallet-Native Philosophy

### 10.1 What wallet-native means

In a card-based system, money flows through card networks (Visa, Mastercard), is authorized by issuers, and settles between banks over one to three business days. The consumer never directly holds money — they hold access to a card-linked balance that a foreign network processes on their behalf.

Banzami is fundamentally different.

Every account holder owns a **digital Kwanza wallet**. When a consumer pays a merchant, money moves directly from one wallet to another in a single, atomic ledger operation. No card network. No foreign authorization. Settlement is not deferred — it happens in the same transaction.

### 10.2 The primary payment rail

```
┌───────────────────┐                      ┌───────────────────┐
│   Consumer        │                      │   Merchant        │
│   Wallet          │ ─[ledger transfer]─▶ │   Wallet          │
│   @joao.silva     │                      │   @cantina.luanda │
│   Balance: 15Kz   │                      │   Balance: 0Kz    │
└───────────────────┘                      └───────────────────┘
         ↓ After payment                            ↓
    Balance: 12.5 Kz                       Balance: 2.5 Kz
```

This is the complete picture. No card network. No intermediary processor. One ledger operation. Both balances update instantly and atomically.

### 10.3 Banzami is NOT card-first

| Payment model | How it works | Banzami? |
|---------------|-------------|----------|
| Stripe / POS terminal | Card tokenisation → card network → issuer auth → settlement in days | ✗ |
| Bank transfer | IBAN + reference → interbank messaging → settlement in hours/days | ✗ |
| Mobile money (no local rail) | Foreign float account → delayed settlement | ✗ |
| **Banzami** | **Wallet → ledger transfer → wallet — instant, local, in Kwanza** | **✓** |

Cards do not exist in the core Banzami network. In a future phase, card top-up will allow consumers to fund their Banzami wallet from a debit card — but that card is used to add funds, not to make payments. Every payment, regardless of how the wallet was funded, is a wallet-to-wallet transfer.

### 10.4 Local rails, local money

Banzami's settlement runs on Angolan infrastructure — EMIS and the Angolan banking system. This is not a limitation. It is a deliberate strength.

A payment network built on foreign card infrastructure depends on foreign approval, foreign pricing, and foreign availability. Banzami's settlement is Angolan, in Kwanza, on rails that Angola controls. It works when international networks do not. It charges in AOA without currency conversion. It operates within the regulatory framework of the Banco Nacional de Angola.

Local infrastructure for a local economy.

### 10.5 Three expressions of the same identity

```
Wallet ↔ Wallet    the financial identity — holds and transfers Kwanza
QR ↔ QR            the physical identity — how you pay in person
Handle ↔ Handle    the digital identity — how you address payments anywhere
```

These three layers are expressions of the same underlying account. Together, they make Banzami usable in every context: physical commerce, digital commerce, remote payments, and person-to-person transfers.

---

## 11. Banzami for Merchants

### 11.1 Getting started

A merchant registers on Banzami, provides basic business information, and receives a merchant wallet and a @handle within minutes. A static QR code is ready for download immediately.

No POS terminal required. No card agreement needed. No minimum monthly volume. KYC verification is required before live settlement, but the process is fully digital.

The time between "I want to accept digital payments" and "I am accepting digital payments" should be measured in minutes, not weeks.

### 11.2 The merchant dashboard

Every merchant has a web-based dashboard:

| Section | What it shows |
|---------|---------------|
| **Wallet balance** | Available and reserved balance, updated in real time |
| **Transactions** | Every payment received — timestamp, amount, consumer @handle |
| **Analytics** | Daily/monthly volume, transaction counts, peak hours |
| **Payment links** | Create, share, and manage payment links |
| **Payment requests** | Send payment requests to specific consumers |
| **Refunds** | Issue full or partial refunds |
| **Disputes** | View and respond to consumer disputes |
| **Payouts** | Withdraw to an Angolan bank account on demand |
| **API keys** | Generate and manage credentials for SDK integrations |
| **Team access** | Add staff with controlled permissions |

### 11.3 Three ways to receive payment

| Surface | How | Best for |
|---------|-----|----------|
| **Static QR** | Print and display permanently | Cantinas, kiosks, physical retail |
| **Payment link** | Share via WhatsApp, SMS, or social media | Remote sales, informal commerce |
| **SDK integration** | Embed in an app | Taxi apps, delivery, ecommerce |

### 11.4 Payouts

Wallet balances are withdrawn to an Angolan bank account on demand — from the dashboard or via the API. Banzami initiates the payout immediately via EMIS and tracks it with full transparency. No manual requests. No opaque timelines.

### 11.5 The QR storefront

Every merchant has a permanent public profile at `pay.banzami.org/profiles/@handle`. This is the digital identity that anchors the merchant in the Banzami network — shareable as a link, printable as a QR, discoverable via search. Any consumer who reaches it can pay instantly.

---

## 12. Banzami for Developers

### 12.1 SDK-first architecture

Banzami is engineered for developers. The recommended integration path is always through an official Banzami SDK — never raw HTTP calls, never handcrafted clients, never improvised workarounds.

Official SDKs provide by default:

- **Typed API surfaces** — no guessing about request or response shapes
- **Automatic idempotency** — every POST is safe to retry; no duplicate charges
- **Exponential backoff retry** — transient failures are handled without code
- **Webhook signature verification** — security by default, not by optional configuration
- **Environment isolation** — sandbox and live are fully separate; no accidental production calls
- **Structured errors** — meaningful error hierarchy, not raw HTTP codes

### 12.2 Available SDKs

| SDK | Language | Primary use |
|-----|----------|-------------|
| `@banzami/sdk` | TypeScript / Node.js | Backend APIs, ecommerce, server-side payment flows |
| `banzami/sdk-php` | PHP | Web apps, Laravel, WooCommerce |
| `banzami-go` | Go | High-performance services, microservices |
| `banzami-python` | Python | Django, FastAPI, data pipelines |
| `banzami_flutter` | Flutter / Dart | Mobile apps, in-app payment flows, QR commerce |

### 12.3 TypeScript SDK — integration example

```typescript
import { BanzamiClient } from '@banzami/sdk';

const client = new BanzamiClient({
  baseUrl: 'https://api.banzami.org',
  apiKey:  'bz_live_...',
});

// Generate a dynamic QR for a taxi ride
const qr = await client.createDynamicQr({
  ownerId:     'cns_driver_id',
  amountMinor: 3200,              // 3 200 Kz
  reference:   'Corrida #1041',
  expiresAt:   new Date(Date.now() + 5 * 60 * 1000),
});

// Passenger scans → confirms → webhook fires:
// { type: "transaction.completed", data: { ... } }
```

### 12.4 PHP SDK — payment link example

```php
use Banzami\BanzamiClient;

$client = new BanzamiClient(apiKey: 'bz_live_...');

// Create a payment link for a WooCommerce order
$link = $client->createPaymentLink([
    'merchant_id'  => 'mch_...',
    'wallet_id'    => 'wlt_...',
    'amount_minor' => 45000,          // 45 000 Kz
    'description'  => 'Encomenda #1042',
    'expires_at'   => (new DateTime('+24 hours'))->format(DateTime::RFC3339),
]);

// Redirect customer to: https://pay.banzami.org/{$link['slug']}
```

### 12.5 Flutter SDK — in-app payment sheet

```dart
// Delivery app: trigger payment when order is confirmed delivered
final result = await BanzamiPay.confirm(
  context:     context,
  merchantId:  'mch_...',
  amountMinor: 8500,           // 8 500 Kz
  reference:   'Pedido #77',
  currency:    'AOA',
);

if (result.status == PaymentStatus.completed) {
  Navigator.pushNamed(context, '/order-complete');
}
```

The SDK handles the entire payment flow inside a sheet — consumer authentication, wallet lookup, confirmation UI, real-time status, success/failure callbacks. The host app receives a typed result and never implements payment logic from scratch.

### 12.6 Webhooks

Every significant event in Banzami triggers a signed webhook delivery. Applications subscribe to event types and receive them within seconds of the triggering action.

```typescript
// Express webhook handler
app.post('/webhooks/banzami', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const event = BanzamiWebhooks.constructEvent(
      req.body,
      req.headers['banzami-signature'],
      process.env.BANZAMI_WEBHOOK_SECRET,
    );

    switch (event.type) {
      case 'transaction.completed':
        await fulfillOrder(event.data.metadata.orderId);
        break;
      case 'payout.completed':
        await markPayoutSettled(event.data.id);
        break;
      case 'refund.completed':
        await processRefundConfirmation(event.data.id);
        break;
    }

    res.json({ received: true });
  } catch (err) {
    if (err instanceof BanzamiWebhookError) return res.status(400).send('Invalid signature');
    throw err;
  }
});
```

### 12.7 Sandbox environment

Every account has access to a full sandbox with separate API keys (`bz_sandbox_...`), isolated data, and no real money movement. The sandbox API surface is identical to production. Build, test, and validate the entire integration before touching a live credential.

### 12.8 Core API reference

| Category | Operations |
|----------|-----------|
| Transactions | Create, capture, void, list, get |
| Wallets | Get balance, list transactions |
| Transfers | Create, list |
| QR codes | Create static, create dynamic, decode, mark used |
| Payment links | Create, get, list, cancel, get public, get status |
| Payment requests | Create, get, list, pay, decline, cancel |
| Refunds | Create, get, list |
| Disputes | Open, get, list |
| Payouts | Create, get, list |
| Webhooks | Register endpoint, list events, list deliveries |
| Merchants | Create, get, update |
| Consumers | Create, get by handle |
| API keys | Create, list, revoke |

---

## 13. Banzami for Consumers

### 13.1 The consumer experience

Banzami is for every Angolan with a smartphone. No traditional bank account required to get started. No technical knowledge needed. One phone. One wallet. Everything else follows.

### 13.2 Getting a wallet

```
1. Enter your phone number
2. Verify with a one-time code
3. Choose your @handle
4. Set a PIN (biometric optional)

→ Wallet ready. You can receive money immediately.
```

Under two minutes from start to finish.

### 13.3 Paying with QR

```
You arrive at a cantina.
A QR code is on the counter.

You open Banzami. Tap "Pagar."
You scan.

App shows: "Pagar a @cantina.luanda"
You enter 1.500 Kz.
You confirm with your fingerprint.

Screen: ✅ Pago. 1.500 Kz.

The cantina owner's phone lights up.
Done.
```

### 13.4 Sending money to a friend

```
You owe a friend for lunch.

Open Banzami. Tap "Enviar."
Type: @maria.luanda
Enter: 3.000 Kz
Tap "Confirmar."

Done. Maria's wallet is credited instantly.
She receives: "Recebeu 3.000 Kz de @joao.silva."
```

### 13.5 Paying a payment link

A merchant sends via WhatsApp:

```
"Aqui está o link: pay.banzami.org/xyz789"
```

You tap it. A page opens:
- Merchant name and logo
- Amount: 15.000 Kz
- Description: Encomenda #12

Tap "Pagar com Banzami." Confirm with PIN. Done.

### 13.6 Receiving a payment request

Your child's school sends a payment request. Your app shows:

```
📩 Pagamento solicitado
35.000 Kz — Escola Primária de Benguela (Março)
[Pagar]  [Ver detalhes]
```

One tap. Paid. The school records it immediately.

### 13.7 Your wallet is your record

The Banzami app shows every transaction — sent and received — with timestamps, amounts, and the other party's @handle. No mystery charges. No unaccounted cash. Complete visibility over your financial activity.

---

### 13.8 Why consumers will adopt Banzami

The question is not whether digital payments are better. They objectively are. The question is whether Banzami is better than the specific alternatives Angolans use today.

| Current alternative | Banzami advantage |
|--------------------|-------------------|
| Cash | No change needed; remote payments possible; full digital receipt; no risk of carrying money |
| Bank transfer | No reference codes; no IBAN; instant confirmation; no screenshot proof required |
| WhatsApp screenshot | Cryptographically confirmed; no risk of fabricated proof; merchant sees it in real time |
| Waiting for confirmation | There is no waiting. Settlement is instant. |
| Splitting bills manually | QR-based split; each person pays their share independently; no mental arithmetic, no awkward recollection |

Beyond the comparisons:

- **One identity for all payments.** Your @handle is your address for every payment: merchants, friends, family, institutions.
- **Safer than cash.** Money stays in your wallet until you confirm a payment. A lost phone does not mean lost money.
- **No change problem.** No one needs exact change. No one apologises for not having small notes.
- **Families and distance.** Send money to family in another city instantly. No queues, no transfer codes, no waiting.
- **Invisible to strangers.** QR payments are between your phone and the merchant's system. No one sees your financial information.

The consumer adoption story is not about technology adoption. It is about making something that people already want to do — pay and be paid — simpler and more reliable than it has ever been.

---

## 14. The Banzami Flywheel

A payment network is not a product you build and ship. It is a network you grow — and its value compounds as it grows.

### The flywheel mechanism

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│         More merchants accept QR                                 │
│                    │                                             │
│                    ▼                                             │
│         More reasons for consumers to get a wallet               │
│                    │                                             │
│                    ▼                                             │
│         More consumers have wallets                              │
│                    │                                             │
│                    ▼                                             │
│         More merchants want to accept QR                         │
│                    │                                             │
│            ┌───────┘                                             │
│            ▼                                                     │
│         More SDK integrations                                    │
│                    │                                             │
│                    ▼                                             │
│         More consumers discover Banzami inside apps              │
│                    │                                             │
│                    ▼                                             │
│         More wallet circulation                                  │
│                    │                                             │
│                    ▼                                             │
│         Less cash dependence                                     │
│                    │                                             │
│                    ▼                                             │
│         Banzami becomes the default                              │
│                    │                                             │
│                    └──────────────────▶ (cycle accelerates)      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### The three growth engines

**Engine 1 — Merchant QR density**

Every merchant who joins Banzami is a new reason for a consumer to get a wallet. A cantina, a pharmacy, a market vendor, a restaurant — each one is a node in the network. As merchant density increases in a neighbourhood or a city, the friction for a consumer to go without a Banzami wallet increases. Eventually the question is not "should I get Banzami?" but "why don't I have Banzami yet?"

**Engine 2 — SDK integrations**

Every Angolan app that integrates the Banzami SDK brings its entire user base into contact with the Banzami wallet. A taxi app with 50,000 active users creates more wallet activations than any marketing campaign. A delivery platform, a streaming service, a gaming app — each integration is a multiplier on consumer adoption, without any additional acquisition cost.

**Engine 3 — Wallet circulation**

As more consumers hold wallets and more merchants accept payments, money begins to circulate inside the Banzami network. A consumer pays a cantina. The cantina pays a supplier. The supplier pays staff. Staff pay merchants. Each Kwanza that stays in the network rather than leaving as cash withdrawal increases liquidity for everyone and reduces the friction of leaving.

### Why density before expansion

The flywheel does not spin across geography. It spins within a market.

A Banzami network with 10,000 Angolan merchants and 500,000 Angolan wallets is dramatically more valuable to every participant than a Banzami presence in 10 countries with 100 merchants each. The network effect requires concentration. This is why Angola comes first — not because other markets are unimportant, but because the flywheel must be spinning strongly before expansion makes sense.

---

## 15. Banzami Business Ecosystem

Banzami is not a single product — it is an ecosystem of interconnected participants, each of whom benefits from the network's growth.

### 15.1 Network participants

```
┌─────────────────────────────────────────────────────────────┐
│                     BANZAMI NETWORK                         │
│                                                             │
│  ┌──────────────┐     pay     ┌──────────────────────────┐  │
│  │  Consumers   │────────────▶│  Merchants               │  │
│  │  (wallets)   │◀────────────│  (wallets + dashboard)   │  │
│  └──────────────┘   receive   └──────────────────────────┘  │
│         │                              │                    │
│         ▼                              ▼                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          Banzami Ledger & Wallet Engine              │   │
│  │       (double-entry, instant, immutable)             │   │
│  └──────────────────────────────────────────────────────┘   │
│         │                              │                    │
│         ▼                              ▼                    │
│  ┌──────────────┐             ┌──────────────────────────┐  │
│  │  Apps with   │             │  EMIS / Angolan Banks    │  │
│  │  Banzami SDK │             │  (interbank settlement)  │  │
│  └──────────────┘             └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 15.2 Bank and partner relationships

Angolan banks are not Banzami's competitors. They are essential partners.

- **Banks provide:** licensed accounts, settlement infrastructure, regulatory compliance, and the Kwanza balances that fund Banzami wallets.
- **Banzami provides:** instant payment UX, QR commerce layer, developer SDKs, merchant tools, and the network effect that makes digital payments habitual.

Banks gain a modern commerce product on top of their existing infrastructure without building it themselves. Banzami gains access to the regulated infrastructure it cannot own directly. This is a partnership with aligned incentives — not a conflict.

### 15.3 Revenue model

| Revenue stream | Mechanism |
|----------------|-----------|
| **Transaction fees** | Small percentage of each successful merchant settlement |
| **Payout fees** | Nominal fee per bank withdrawal from a merchant wallet |
| **Enterprise SDK licensing** | Volume pricing for high-transaction integrators |
| **Premium merchant tools** | Advanced analytics, multi-location management (future) |

All fees are transparent and disclosed at onboarding. No hidden charges. No monthly minimums. No hardware costs.

---

## 16. Security & Financial Integrity

Banzami handles real money. Security and financial integrity are not features — they are the foundation upon which everything else is built.

### 16.1 Double-entry ledger

Every monetary movement in Banzami is recorded as an immutable **double-entry ledger entry** — the same accounting principle used by banks and financial institutions for centuries.

```
Consumer pays 2.500 Kz to a merchant:

  Consumer Wallet   │ DEBIT  │ -2.500 Kz
  Merchant Wallet   │ CREDIT │ +2.500 Kz
  ──────────────────────────────────────
  Net:              │        │     0 Kz
```

No money is created or destroyed. Every Kwanza in the system is accounted for at every moment. If a ledger entry would create an imbalance, the operation is rejected before it commits.

### 16.2 Immutability and audit trails

Ledger entries cannot be edited or deleted. A refund does not modify the original transaction — it creates a new, opposing entry. This means the complete financial history of every wallet is always fully reconstructible.

In the event of any audit, dispute, or regulatory inquiry, every payment can be traced from initiation to settlement with a complete, tamper-proof record.

### 16.3 Idempotency

Every payment operation is **idempotent** — submitting the same operation twice produces no additional effect. Network failures sometimes cause retries. Without idempotency, a retry would create a duplicate charge.

Banzami assigns a unique idempotency key to every operation. If the same key is submitted again, the original result is returned immediately, without creating a new transaction.

### 16.4 Risk engine

Every transaction passes through a real-time risk engine before committing to the ledger:

- transaction velocity (unusual frequency from a single wallet)
- amount anomalies (amounts far outside a wallet's normal range)
- account signals (newly registered accounts, unverified identity)
- device and session signals (inconsistent device fingerprint or location)

Transactions above risk thresholds are held for review or declined before the ledger is touched.

### 16.5 KYC and KYB

**KYC (Know Your Customer):** every consumer is identity-verified before live payments are enabled. Verification uses Angolan identity documents (B.I., Passaporte, or Carta de Condução), tiered by transaction volume.

**KYB (Know Your Business):** every merchant is business-verified. NIF verification for formal entities; identity verification for individual merchants.

These processes satisfy BNA (Banco Nacional de Angola) requirements for digital payment operators.

### 16.6 Encryption and data security

| Protection | Standard |
|-----------|---------|
| Data at rest | AES-256 encryption |
| Data in transit | TLS 1.3 |
| API keys | SHA-256 hashed at rest; raw key shown only once |
| Webhook secrets | Hashed at rest; HMAC signing only |
| KYC documents | Encrypted storage with access audit log |

### 16.7 Sandbox isolation

Sandbox and production are **completely isolated** — different API keys, different data, different infrastructure. Real money never moves in sandbox. This isolation is enforced at both the API layer and the infrastructure layer. There is no way to accidentally route sandbox traffic to production.

### 16.8 Reconciliation

Automated reconciliation runs daily:

- Sum of all wallet balances reconciled against all ledger credits and debits
- Expected EMIS settlement amounts reconciled against actual bank credits
- Pending payout amounts reconciled against completed bank transfers

Any discrepancy — no matter how small — triggers an alert and a resolution workflow. The platform targets zero unresolved discrepancies at any point in time.

---

## 17. Technical Architecture

### 17.1 Design principles

Banzami is engineered as **national-scale financial infrastructure**. Not a startup MVP. Not a proof of concept. Infrastructure designed to operate for decades.

Every architectural decision is ordered by:

1. **Correctness** — financial operations are safe, auditable, and deterministic above all else
2. **Reliability** — the platform is available when merchants and consumers need it
3. **Security** — every layer is built with a threat model
4. **Observability** — every component emits metrics, traces, and structured logs
5. **Maintainability** — the codebase is designed for long-term operation, not short-term velocity

### 17.2 Technology stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Financial core** | Rust | Memory safety, deterministic performance, zero garbage collection pauses in the payment path |
| **API layer** | Go | Simplicity, reliability, excellent concurrency for API serving |
| **Frontend** | TypeScript + Next.js | Type-safe, modern, excellent developer experience |
| **Mobile SDKs** | Flutter | Cross-platform; single codebase for Android and iOS |
| **Database** | PostgreSQL | The single source of financial truth; ACID guarantees; proven at scale |
| **Cache & coordination** | Redis | Rate limiting, idempotency storage, session management, pub/sub for real-time events |
| **Observability** | OpenTelemetry + Prometheus + Grafana | Full-stack visibility from API gateway to ledger write |
| **Infrastructure** | Docker + Hetzner/OVH + Cloudflare | Reliable, cost-effective, African-adjacent infrastructure |

### 17.3 Core architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                 │
│   Consumer App · Merchant Dashboard · 3rd-party App · SDKs      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS / TLS 1.3
┌──────────────────────────▼──────────────────────────────────────┐
│               CLOUDFLARE (DDoS, WAF, CDN)                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    API GATEWAY (Go)                             │
│        Auth · Rate limiting · Routing · Webhook delivery        │
└──────┬──────────────────────────────────────────┬──────────────┘
       │                                          │
┌──────▼───────────┐                  ┌───────────▼──────────────┐
│  PUBLIC API (Go)  │                  │    ADMIN API (Go)        │
│  Payments · QR   │                  │    Settlements           │
│  Transfers · SDK │                  │    Disputes              │
│  Profiles        │                  │    Reconciliation        │
└──────┬───────────┘                  └───────────┬──────────────┘
       │                                          │
┌──────▼──────────────────────────────────────────▼──────────────┐
│                       CORE API (Rust)                           │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │  Ledger  │  │ Wallets  │  │   Txns   │  │  Settlement  │    │
│  │  Engine  │  │  Engine  │  │  Engine  │  │  Reconcile   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │   Risk   │  │Compliance│  │ Payouts  │  │  Refunds /   │    │
│  │  Engine  │  │   Core   │  │  Engine  │  │  Disputes    │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                          POSTGRESQL                             │
│                (single source of financial truth)               │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                    EMIS / ANGOLAN BANKS                         │
│                 (interbank settlement rail)                     │
└─────────────────────────────────────────────────────────────────┘
```

### 17.4 The payment critical path

The critical path is kept deliberately minimal:

```
auth → risk check → compliance → ledger write → wallet update → response
```

Everything outside this path is asynchronous:
- webhook delivery
- analytics recording
- reconciliation jobs
- push notification dispatch
- reporting

This keeps the operation the consumer and merchant wait for — the confirmation — as fast as possible, with no unnecessary blocking.

### 17.5 Instant settlement guarantee

Three architectural contracts underpin every transaction:

1. **Ledger writes are synchronous and atomic.** The transaction is not confirmed until ledger entries are durable. Financial correctness is never traded for speed.
2. **Wallet balances update immediately** after every committed transaction. When the consumer's success screen appears, the merchant's balance has already changed. There is no "will update shortly."
3. **Webhook delivery begins immediately** after transaction commit. The merchant's server-side integration receives the event within seconds of confirmation.

### 17.6 Modular monolith approach

Banzami is a **modular monolith** — one deployable unit with strongly isolated internal modules, clear domain boundaries, and explicit internal interfaces.

This is a deliberate choice. Premature microservices introduce distributed systems complexity, operational overhead, and failure modes that are not justified until scaling boundaries are proven by real traffic. The modular monolith is simpler to reason about, deploy, and maintain — and it can be decomposed into services exactly when, and only when, the evidence demands it.

### 17.7 Observability

Every service emits:

- **Metrics** (Prometheus) — request rates, error rates, latency percentiles, wallet operations, settlement volumes
- **Traces** (OpenTelemetry) — end-to-end request traces from API gateway to ledger write
- **Structured logs** — JSON with transaction IDs, operation types, and outcomes
- **Health signals** — liveness and readiness endpoints

Three primary Grafana dashboards provide operational visibility:

| Dashboard | Coverage |
|-----------|---------|
| **Payments** | Transaction rates, error rates, QR completion, webhook delivery |
| **Wallets & Ledger** | Transfer volume, latency percentiles, balance read rates, refunds and disputes |
| **Settlements & Payouts** | Settlement rates, payout throughput, reconciliation operations |

---

## 18. The Banzami Ecosystem

### 18.1 Full platform map

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BANZAMI PLATFORM                            │
│                                                                     │
│  CONSUMER LAYER                                                     │
│  ┌──────────────────┐   ┌──────────────────────────────────────┐    │
│  │  Consumer App    │   │  pay.banzami.org                     │    │
│  │  (Flutter)       │   │  payment links · QR · storefronts    │    │
│  └──────────────────┘   └──────────────────────────────────────┘    │
│                                                                     │
│  MERCHANT LAYER                                                     │
│  ┌──────────────────┐   ┌──────────────────────────────────────┐    │
│  │  Merchant        │   │  QR (static + dynamic)               │    │
│  │  Dashboard       │   │  Payment links · Requests            │    │
│  │  (Next.js)       │   │  Refunds · Disputes · Analytics      │    │
│  └──────────────────┘   └──────────────────────────────────────┘    │
│                                                                     │
│  OPERATIONS LAYER                                                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Admin Dashboard — Settlements · Reconciliation · Disputes    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  DEVELOPER LAYER                                                    │
│  ┌────────────┐ ┌──────┐ ┌────┐ ┌──────────┐ ┌────────────────┐    │
│  │ TypeScript │ │  PHP │ │ Go │ │  Python  │ │    Flutter     │    │
│  │    SDK     │ │  SDK │ │SDK │ │   SDK    │ │     SDK        │    │
│  └────────────┘ └──────┘ └────┘ └──────────┘ └────────────────┘    │
│                                                                     │
│  INFRASTRUCTURE LAYER                                               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Rust Core · Go APIs · PostgreSQL · Redis · Grafana           │   │
│  │  OpenTelemetry · Prometheus · Cloudflare · Docker             │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 18.2 The developer platform

The developer platform is the infrastructure through which Angola's application builders access instant payments:

- API documentation — comprehensive reference for every endpoint
- SDK documentation — integration guides for every language
- Sandbox environment — test without limits, without risk
- Webhook testing tools — inspect and replay webhook events
- API key management — generate, rotate, and revoke credentials
- Integration examples — reference implementations for common flows

### 18.3 Plugin ecosystem

| Plugin | Platform | What it does |
|--------|----------|-------------|
| WooCommerce | WordPress | Payment gateway for WooCommerce-powered Angolan stores |
| PrestaShop (future) | PrestaShop | Payment module for PrestaShop merchants |

Plugins use the SDK internally — they inherit all SDK guarantees: idempotency, retry handling, signature verification.

### 18.4 Real-time event catalogue

| Event | When it fires |
|-------|--------------|
| `transaction.completed` | Payment settled successfully |
| `transaction.failed` | Payment attempt failed |
| `payout.completed` | Bank withdrawal settled |
| `refund.created` | Refund initiated |
| `refund.completed` | Refund settled |
| `dispute.opened` | Consumer opens a dispute |
| `dispute.resolved` | Dispute resolved |
| `payment_request.paid` | Consumer pays a payment request |
| `payment_request.declined` | Consumer declines a payment request |

---

## 19. Roadmap & Future

### Near-term

| Feature | Description |
|---------|-------------|
| **Python SDK** | Async-first with Pydantic v2; Django and FastAPI integrations |
| **Merchant profile management** | Dashboard UI for creating and editing public merchant profiles |
| **FCM payment request notifications** | Push notifications for incoming payment requests |
| **Webhook event expansion** | Events for refunds, disputes, and payment requests |

### Medium-term

| Feature | Description |
|---------|-------------|
| **Consumer mobile app** | Native Flutter app: wallet, QR scanner, P2P transfers, transaction history |
| **Recurring payments** | Scheduled requests for subscriptions, school fees, and memberships |
| **Split payments** | Group bills divided automatically between multiple consumers |
| **Merchant discovery** | In-app merchant directory; find and pay local merchants |
| **Offline QR** | Static QR payments that queue and settle when connectivity resumes |

### Long-term

| Feature | Description |
|---------|-------------|
| **Marketplace payments** | Multi-merchant settlement in a single consumer purchase |
| **Card wallet top-up** | Fund a Banzami wallet using a debit card (card is a funding rail — not the payment model) |
| **Financial interoperability** | Deeper EMIS integration; broader Angolan banking infrastructure compatibility |
| **Geographic expansion** | After Angola achieves network density: the same model, applied to neighbouring markets |
| **Business accounts** | Multi-user accounts with role-based permissions and accounting integrations |

### On geographic expansion

Expansion is a future milestone, not a current objective. A payment network becomes valuable through density. A network thin across many countries is worth less to every participant than a network dense in one. Banzami achieves real network density in Angola first, then expands with a model that has already been proven.

The architecture is already designed for it. The timing is not yet.

---

## 20. Final Vision Statement

### What Angola's commerce deserves

Angola's commerce deserves infrastructure that matches its energy.

Not infrastructure adapted from a foreign model that was never designed for Kwanza, for informal merchants, or for QR-native payments. Not infrastructure dependent on foreign rails, foreign approval, or foreign pricing.

Infrastructure built here. For here.

**That is Banzami.**

### The transformation

**Today:**
- A merchant cannot accept digital payments without expensive hardware or a bank agreement
- A consumer must photograph bank transfers and send them via WhatsApp to prove a purchase
- A developer building an Angolan app has no payment SDK built for their market
- A taxi app cannot close the payment loop in-app
- A cantina has no choice but cash
- A school reconciles fee payments from physical receipts, manually, at the end of the week

**Tomorrow — with Banzami:**
- A merchant prints a QR and accepts instant payments from any smartphone, immediately
- A consumer scans, confirms, and pays in under 3 seconds — with a cryptographic receipt
- A developer integrates a typed, production-ready SDK and ships a payment feature in hours
- A taxi app closes every ride with instant in-app settlement
- A cantina has a wallet, a dashboard, and full visibility over every transaction
- A school knows in real time exactly who has paid

### Why this matters beyond commerce

Payments are not just transactions. They are trust.

When a payment is instant and confirmed, both parties can move forward without doubt. When a receipt is digital and permanent, there is no dispute about what was agreed. When a wallet is always accessible, the ability to participate in economic life is not restricted by geography, formal banking access, or physical cash.

Banzami makes the Angolan economy more liquid, more transparent, and more accessible — not by replacing what exists, but by completing what is missing.

### The promise

Every engineering decision, every product choice, and every design in Banzami reflects one commitment:

**Digital payments in Angola should be instant, accessible, integrated, and usable by everyone.**

Not for some merchants. Not for some consumers. Not for some applications.

For every cantina. For every taxi. For every school, market vendor, ecommerce site, delivery platform, freelancer, and family.

For Angola.

```
   SCAN   →   CONFIRM   →   PAID INSTANTLY
```

---

*Banzami — Angola's instant payment network.*  
*Wallet-native. QR-first. Built for every Angolan.*

---

**Document references:**

- [ADR-013 — Wallet-Native Payment Network Identity](adr/ADR-013-wallet-native-identity.md)
- [ADR-014 — Angola-First National Mission](adr/ADR-014-angola-national-mission.md)
- [ADR-012 — SDK-First Ecosystem](adr/ADR-012-sdk-first-ecosystem.md)
- [Product Strategy](product/strategy.md)
- [Market Positioning](product/positioning.md)
- [Mobile UX Philosophy](standards/mobile-ux-philosophy.md)
- [Merchant Onboarding](domains/merchant-onboarding/README.md)
- [Architecture README](architecture/README.md)
- [TypeScript SDK](../sdk/typescript/README.md)
- [PHP SDK](../sdk/php/README.md)
- [CLAUDE.md — Engineering Constitution](../CLAUDE.md)
