# Banzami — Official Reference Document

**Version:** 1.0  
**Date:** 2026-05-19  
**Status:** Official  
**Author:** Fidel Monteiro — `@fm65`  

---

> **Banzami is Angola's QR-native instant payment network.**  
> Wallet-to-wallet. Instant settlement. Built for every Angolan.

---

## Table of Contents

1. [What Is Banzami?](#1-what-is-banzami)
2. [Why Banzami Exists](#2-why-banzami-exists)
3. [The Vision](#3-the-vision)
4. [How Banzami Works](#4-how-banzami-works)
5. [Core Features](#5-core-features)
6. [Real Angola Use Cases](#6-real-angola-use-cases)
7. [QR Payment Ecosystem](#7-qr-payment-ecosystem)
8. [Wallet-Native Philosophy](#8-wallet-native-philosophy)
9. [Banzami for Merchants](#9-banzami-for-merchants)
10. [Banzami for Developers](#10-banzami-for-developers)
11. [Banzami for Consumers](#11-banzami-for-consumers)
12. [Banzami Business Ecosystem](#12-banzami-business-ecosystem)
13. [Security & Financial Integrity](#13-security--financial-integrity)
14. [Technical Architecture](#14-technical-architecture)
15. [The Banzami Ecosystem](#15-the-banzami-ecosystem)
16. [Roadmap & Future](#16-roadmap--future)
17. [Final Vision Statement](#17-final-vision-statement)

---

## 1. What Is Banzami?

Banzami is **Angola's instant payment network** — a complete digital payment infrastructure built specifically for Angolan commerce, Angolan merchants, and Angolan consumers.

It is not a bank. It is not a card processor. It is not a generic fintech platform copied from a Western model.

Banzami is a **wallet-native payment network**: every account is a digital wallet, every payment is an instant wallet-to-wallet transfer, and every merchant interaction is a QR code. Money moves between wallets in real time — confirmed, settled, and visible in seconds.

### The four pillars of Banzami

| Pillar | What it means |
|--------|---------------|
| **Wallet-native** | Every account is a digital Kwanza wallet. Payments are wallet transfers, not card transactions. No IBAN required. No bank code required. |
| **QR-native** | The primary merchant payment surface is a QR code. A merchant prints a QR. A consumer scans it. Payment is instant. No card terminal, no hardware, no friction. |
| **Instant settlement** | Money moves the moment payment is confirmed. Not the next business day. Not after manual verification. Instantly. |
| **SDK-first** | Every Angolan application — taxi apps, delivery platforms, ecommerce sites, donation platforms — can integrate Banzami in hours and accept instant Kwanza payments natively inside their product. |

### The canonical payment experience

```
Consumer scans merchant QR
          ↓
Confirms amount and merchant identity (one tap)
          ↓
Payment committed and settled instantly
          ↓
Merchant receives instant notification + balance update
          ↓
Consumer sees success confirmation
```

Total time from scan to confirmed settlement: **under 3 seconds**.

### Identity in Banzami

Every person and every merchant in the Banzami network has a **@handle** — a human-readable payment address. Sending money to someone in Banzami looks like this:

```
Pay: @cantina.luanda
Amount: 2.500 Kz
```

No bank account number. No IBAN. No reference codes. Just a handle and an amount.

### Who Banzami serves

- **Merchants** — from cantinas and market stalls to ecommerce platforms and taxi apps
- **Developers** — building the next generation of Angolan applications that need to accept payments
- **Consumers** — every Angolan who wants to pay, send money, and receive payments instantly
- **Banks and partners** — who want to offer their customers a modern digital commerce layer

---

## 2. Why Banzami Exists

Angola has a payments problem. It is not a technology problem — Angola has high mobile penetration, capable infrastructure, and a population that is ready for digital commerce. The problem is that the existing payment experience is broken in predictable, fixable ways.

### 2.1 The cash dependency

Despite widespread smartphone usage, cash is the dominant payment method in Angola for a simple reason: **cash is easier than the existing digital alternatives**.

Paying digitally today means: finding a bank branch or ATM, initiating a transfer, copying a reference code, waiting for confirmation, and sometimes manually confirming with the merchant. For small, everyday purchases — a meal at a cantina, a ride home, a purchase at the market — cash is simply faster.

Banzami makes digital payments faster than cash.

### 2.2 The WhatsApp proof problem

The current "digital" payment flow in Angolan informal commerce is not digital at all. It looks like this:

```
Step 1 — Customer initiates a bank transfer
Step 2 — Customer takes a screenshot of the confirmation
Step 3 — Customer sends the screenshot to the merchant via WhatsApp
Step 4 — Merchant inspects the screenshot manually
Step 5 — Merchant decides whether to trust it and confirms the sale
```

This is manual reconciliation disguised as a digital payment. It creates disputes. It fails at scale. It requires the customer to trust that the merchant will honour the screenshot, and the merchant to trust that the screenshot is genuine.

**Banzami eliminates this entirely.** When a customer scans a Banzami QR and confirms payment, the merchant sees instant confirmation in their app. No screenshots. No WhatsApp messages. No manual check. The payment is cryptographically confirmed and the merchant wallet is updated in real time.

### 2.3 The in-app payment gap

Angolan taxi apps, delivery platforms, and marketplaces cannot close the payment loop inside their products. The payment step forces users outside the app — to cash, to an external bank transfer, or to fragile workarounds.

The result is a broken user experience, higher dropout rates, and merchants who cannot offer a seamless digital service to their customers.

Banzami provides the SDK infrastructure that allows any Angolan application to embed a complete payment flow — confirmation, settlement, receipt — without the consumer ever leaving the app.

### 2.4 The SDK gap

There is no Angola-native payment SDK. A developer building an Angolan application has no clean, production-ready API for accepting instant Kwanza payments. They improvise — with security vulnerabilities, inconsistent behaviour, and no meaningful support when something goes wrong.

Banzami is the first payment infrastructure built specifically for Angolan developers: typed SDKs, automatic idempotency, retry handling, webhook signature verification, and sandbox testing — all available out of the box.

### 2.5 The merchant exclusion problem

Small merchants — cantinas, pharmacies, informal market sellers — are excluded from digital commerce because existing solutions require expensive hardware, formal bank accounts with complex requirements, or card terminal infrastructure that is inaccessible to the majority of Angola's merchants.

Banzami requires none of this. A merchant needs a phone and a printed QR code. That is the entire infrastructure requirement to start accepting instant digital payments.

---

## 3. The Vision

Angola's digital economy is not broken — it is unfinished. The infrastructure exists. The population is ready. What is missing is the payment layer that connects them.

Banzami's vision is to complete that layer.

### The target future

```
A cantina owner in Luanda prints a QR code and sticks it on the counter.
A customer walks in, orders food, and scans the QR.
Payment is confirmed in under 3 seconds.
The cantina owner's phone lights up: "Recebeu 2.500 Kz."
No cash changes hands. No screenshots are sent. No one waits for anything.
```

```
A taxi driver completes a ride in Luanda.
The app shows the fare.
The passenger taps "Pagar".
Money moves from the passenger's Banzami wallet to the driver's wallet instantly.
The ride is closed. The driver sees the payment. The passenger gets a receipt.
No cash. No friction. No manual confirmation.
```

```
A student in Benguela needs to pay school fees.
The school sends a payment link via WhatsApp.
The student opens the link, sees the amount and school name, and pays with one tap.
The school receives instant confirmation. The student receives a digital receipt.
```

These are not ambitious futures. They are achievable today, with infrastructure that already exists, for users who are already connected. Banzami is the missing layer.

### What success looks like

Banzami's mission is achieved when:

- QR payments are the **normal expectation** for Angolan consumers in shops, restaurants, and markets — not a novelty
- Every Angolan taxi app, delivery platform, and ecommerce site uses a Banzami SDK as its payment engine
- The WhatsApp proof-of-payment has disappeared from Angolan commerce
- A significant portion of everyday Angolan transactions happen digitally, without cash
- Angolan developers have a payment infrastructure they are proud to build on

The reference models for this kind of transformation exist. Brazil's **Pix** turned QR payments into the national default in under three years. India's **UPI** made @handle-based instant transfers the standard for one billion people. Both started with focus: one country, one network, one clear promise to every user.

Banzami is that for Angola.

---

## 4. How Banzami Works

### 4.1 The fundamental operation

Everything in Banzami is built on one operation:

```
Consumer Wallet  ────[instant ledger transfer]────▶  Merchant Wallet
```

When a consumer pays a merchant, money moves from one digital wallet to another. The transfer is atomic, instant, and recorded in an immutable financial ledger. There is no intermediate state, no pending period, no settlement delay. The money is in the merchant wallet the moment the consumer confirms payment.

This is the core of the network. Every product feature — QR codes, payment links, payment requests, SDK integrations — is a different way of initiating this same fundamental operation.

### 4.2 Wallets

Every person and every merchant in Banzami has a **digital Kwanza wallet**. A wallet holds AOA balances, receives payments, and sends transfers. It is not a bank account — it is a Banzami-native payment account.

```
Wallet structure:

┌─────────────────────────────────┐
│  @joao.silva                    │
│  Wallet ID: wlt_...             │
│                                 │
│  Available:    12.750 Kz        │
│  Reserved:      2.500 Kz        │
│  ─────────────────────────────  │
│  Total:        15.250 Kz        │
└─────────────────────────────────┘
```

The **available** balance is what can be spent or transferred immediately. The **reserved** balance covers pending operations (such as a payment that has been initiated but not yet confirmed). Together they represent the full wallet position.

### 4.3 @Handles

Every Banzami account has a **@handle** — a unique, human-readable identifier that doubles as a payment address.

```
@joao.silva          ← consumer handle
@cantina.luanda      ← merchant handle
@escola.benguela     ← institution handle
```

Handles replace the need for bank account numbers, IBANs, or reference codes. To send money to someone, you type their handle. To receive money, you share your handle. Merchants print their handle on physical signs alongside their QR code.

### 4.4 QR payments

A **QR code** is a visual representation of a payment destination. Scanning it immediately tells the consumer's app where the payment should go.

**Static QR** — a permanent QR linked to a wallet. The consumer scans it and enters the amount. This is the standard merchant QR: printed once, used indefinitely.

**Dynamic QR** — a QR generated for a specific amount and transaction. It expires after use or after a time limit. Used for fixed-price purchases, invoices, and automated flows.

```
QR scan flow:

Consumer opens camera or Banzami app
              ↓
Scans the merchant's QR code
              ↓
App decodes: merchant identity + amount (if dynamic)
              ↓
Confirmation screen: "Pagar 2.500 Kz a @cantina.luanda?"
              ↓
Consumer confirms (biometric or PIN)
              ↓
Instant settlement — both parties see confirmation
```

### 4.5 Payment links

A **payment link** is a shareable URL that contains a pre-configured payment request. The merchant sends the link via WhatsApp, SMS, email, or any messaging channel. The consumer opens the link in a browser and pays with their Banzami wallet.

```
https://pay.banzami.org/abc123
```

Payment links replace the "send me proof via WhatsApp" flow that currently dominates informal Angolan commerce. Instead of sending a screenshot of a bank transfer, the consumer clicks a link, confirms the payment, and the merchant sees instant confirmation.

### 4.6 Payment requests

A **payment request** is a digital invoice pushed directly to a specific consumer's wallet. The consumer sees the request in their Banzami app and can pay or decline with a single tap.

```
Merchant sends:    "Pagamento de 15.000 Kz — Encomenda #42"
Consumer receives: notification in Banzami app
Consumer taps:     "Pagar"
Result:            instant settlement + receipt for both parties
```

### 4.7 EMIS and the banking layer

Banzami integrates with **EMIS** (Empresa Interbancária de Serviços) — Angola's interbank payment infrastructure — to allow money to flow between Banzami wallets and the Angolan banking system.

EMIS is not the product. EMIS is the rail.

Banzami provides the product layer — wallets, QR codes, SDKs, merchant dashboards, payment links — on top of the regulated Angolan banking infrastructure.

```
Layer map:

┌────────────────────────────────────────────┐
│   Banzami Product Layer                    │
│   (wallets, QR, SDKs, merchant tools)      │
├────────────────────────────────────────────┤
│   EMIS / Multicaixa (interbank rail)       │
├────────────────────────────────────────────┤
│   Angolan Banks (accounts, settlement)     │
├────────────────────────────────────────────┤
│   BNA (Banco Nacional de Angola)           │
│   (monetary authority, regulation)         │
└────────────────────────────────────────────┘
```

---

## 5. Core Features

### Payments

| Feature | Description |
|---------|-------------|
| **QR payments** | Consumer scans merchant QR; instant wallet-to-wallet settlement; no hardware required |
| **P2P transfers** | Consumer sends money to any @handle; instant; no bank details needed |
| **Payment links** | Shareable URLs; consumer opens in browser and pays; merchant sees instant confirmation |
| **Payment requests** | Digital invoice pushed to a consumer's wallet; pay or decline in one tap |
| **Instant settlement** | Money in the recipient wallet the moment payment is confirmed; no pending delays |

### Merchant tools

| Feature | Description |
|---------|-------------|
| **Merchant wallet** | Dedicated business wallet for receiving payments, tracking balances, and requesting payouts |
| **Merchant dashboard** | Web interface for transaction history, analytics, refunds, disputes, and team management |
| **QR storefront** | Public merchant profile page at `pay.banzami.org/profiles/@handle` |
| **Static QR generation** | Permanent QR code for the merchant's wallet; print and display anywhere |
| **Dynamic QR generation** | Per-transaction QR with fixed amount and expiry |
| **Payouts** | Withdraw wallet balance to an Angolan bank account on demand |
| **Refunds** | Issue partial or full refunds directly from the merchant dashboard or API |
| **Dispute management** | Structured process for resolving payment disputes between merchants and consumers |

### Developer platform

| Feature | Description |
|---------|-------------|
| **REST API** | Versioned, idempotent HTTP API for all platform operations |
| **TypeScript SDK** | Fully typed Node.js/browser SDK with automatic idempotency and retry handling |
| **PHP SDK** | PSR-18 compatible SDK with Laravel integration |
| **Go SDK** | Native Go client with context propagation and structured error types |
| **Python SDK** | Async-first SDK with Pydantic v2 models and Django/FastAPI support |
| **Flutter SDK** | Mobile SDK for in-app payment flows and QR commerce |
| **Webhook system** | Real-time event delivery with HMAC-SHA256 signature verification and automatic retry |
| **Sandbox environment** | Fully isolated test environment; no real money; identical API surface |

### Infrastructure

| Feature | Description |
|---------|-------------|
| **Idempotency** | All payment operations are safe to retry; duplicate submissions produce no side effects |
| **Double-entry ledger** | Every monetary movement recorded as immutable ledger entries; fully auditable |
| **Reconciliation** | Automated daily reconciliation of all wallet balances and ledger entries |
| **Risk engine** | Real-time transaction screening for fraud indicators and compliance signals |
| **KYC/KYB** | Identity verification for consumers and merchants; tiered by transaction volume |

---

## 6. Real Angola Use Cases

### 6.1 Taxi and ride-hailing apps

**The problem today:**  
An Angolan ride-hailing app picks up a passenger. At the end of the ride, the app shows the fare but cannot collect it in-app. The driver says "cash only." The passenger scrambles for change. The driver has no way to accept digital payment without leaving the app experience. The platform loses visibility into every transaction.

**With Banzami:**  
The ride ends. The app shows the fare. The passenger sees a payment confirmation screen. One tap — biometric or PIN. The fare transfers instantly from the passenger's Banzami wallet to the driver's wallet. The platform receives a webhook confirming the transaction. The driver sees the payment in real time. The ride closes automatically.

```
BEFORE: Ride ends → driver requests cash → passenger finds change → no record
AFTER:  Ride ends → app shows fare → passenger taps "Pagar" → instant settlement
```

### 6.2 Cantinas and small merchants

**The problem today:**  
A cantina owner in Luanda wants to accept digital payments. A bank POS terminal costs money to rent, requires a bank agreement, and charges per transaction. Most cantina owners do not qualify. Their only option is to accept bank transfers and wait for WhatsApp screenshots — which some customers fake.

**With Banzami:**  
The cantina owner registers on Banzami, creates a merchant wallet, and downloads their QR code. They print it on a piece of paper and stick it next to the cash register. When a customer scans it and pays, the owner's phone shows "Recebeu 2.500 Kz." No terminal. No monthly fee. No waiting. No screenshots.

```
BEFORE: Customer pays → sends WhatsApp screenshot → owner verifies manually
AFTER:  Customer scans QR → pays instantly → owner's phone confirms in real time
```

### 6.3 Ecommerce and online stores

**The problem today:**  
An Angolan ecommerce site has no reliable way to collect online payments in Kwanza. International payment processors do not support AOA. Customers are redirected to external banking portals. Checkout abandonment is high. A significant portion of "orders" are never paid.

**With Banzami:**  
The site integrates the Banzami TypeScript SDK. At checkout, the customer sees a Banzami payment option. They confirm with their wallet. Settlement is instant. The store receives a webhook and fulfils the order. No redirect. No external bank portal. No waiting.

```typescript
// Ecommerce checkout integration
const link = await client.createPaymentLink({
  merchantId:  'mch_...',
  walletId:    'wlt_...',
  amountMinor: 45000,           // 45 000 Kz
  description: 'Encomenda #1042 — 3 produtos',
});

// Send link to customer → they pay → webhook confirms
```

### 6.4 Donation and creator platforms

**The problem today:**  
A creator or NGO running a platform like DOA cannot accept instant digital donations in Kwanza. Supporters are asked to send bank transfers and share proof via email or social media. Many supporters drop off at this step. The platform has no real-time donation tracking.

**With Banzami:**  
The platform integrates Banzami payment links or payment requests. A supporter opens the platform, sees a creator's campaign, taps "Apoiar com 1.000 Kz," and the donation is transferred instantly. The creator sees the donation in real time. The platform receives a webhook. The entire flow happens in-app.

```
BEFORE: Supporter sends bank transfer → emails proof → platform waits → slow tracking
AFTER:  Supporter taps "Apoiar" → instant transfer → creator sees it immediately
```

### 6.5 Delivery apps and marketplaces

**The problem today:**  
A food delivery app in Angola collects orders but cannot settle payment inside the app. Cash on delivery is the norm. This creates safety risks for drivers, fraud risks for merchants, and poor experience for consumers.

**With Banzami:**  
The delivery app integrates the Banzami Flutter SDK. When the driver marks an order as delivered, the app triggers a payment confirmation on the consumer's phone. One tap, instant settlement. The restaurant and the driver both see the payment. Cash disappears from the flow.

### 6.6 Schools and institutions

**The problem today:**  
A school collects tuition fees via bank transfer. Parents queue at the bank, make transfers, take the receipt to the school office, and wait for someone to process it manually. The school has no real-time view of who has paid.

**With Banzami:**  
The school issues payment requests via Banzami for each student. Parents receive a notification in their Banzami app, see the student's name and amount, and pay with one tap. The school dashboard shows paid and outstanding fees in real time.

```
BEFORE: Parent queues at bank → manual transfer → delivers receipt → school processes manually
AFTER:  Parent taps "Pagar" in Banzami app → instant settlement → school sees it in real time
```

### 6.7 Freelancers and professionals

**The problem today:**  
A freelance designer or consultant invoices a client in Angola. The client initiates a bank transfer. The freelancer waits hours or days for confirmation. There is no structured record of the payment.

**With Banzami:**  
The freelancer generates a payment link or payment request for the invoice amount. The client clicks the link, confirms the payment, and the freelancer's wallet is credited instantly. Both parties have a digital receipt.

### 6.8 Restaurants and cafés

**The problem today:**  
A restaurant in Luanda accepts cash or bank transfer. At the end of a group dinner, the table splits the bill by sending the server multiple different transfer amounts — which the server must reconcile manually before the table can leave.

**With Banzami:**  
The restaurant generates a dynamic QR for the table's total. Customers scan and pay their share. Each payment is confirmed instantly. The restaurant's app shows the running total. When the full amount is collected, service is complete.

---

## 7. QR Payment Ecosystem

QR codes are not a feature in Banzami — they are the **primary payment surface**.

The logic is simple. A QR code is a visual payment address. It can be printed, displayed on a screen, shared as an image, or embedded in a document. It requires no card terminal, no NFC hardware, and no proprietary equipment. A merchant with a phone and a printer has everything they need.

### 7.1 Static QR

A static QR encodes a wallet reference and @handle. It is permanent — printed once and used indefinitely.

**Typical use:** stuck on the wall of a cantina, taped to a market stall, displayed on a small sign at a restaurant table.

```
QR payload: banzami://pay/@cantina.luanda
```

When a consumer scans a static QR, they see the merchant name and are asked to enter an amount. They confirm and pay.

### 7.2 Dynamic QR

A dynamic QR encodes a specific amount and expires after use or after a time limit.

**Typical use:** generated per transaction by a POS system, delivery app, or ticket platform.

```
QR payload: banzami://pay/qr/qrc_abc123
            └── resolves to: @cantina.luanda, 2.500 Kz, expires in 5 minutes
```

When a consumer scans a dynamic QR, the amount is pre-filled. They only need to confirm.

### 7.3 Merchant QR storefront

Every merchant has a public profile page at `pay.banzami.org/profiles/@handle`. This page displays:
- the merchant's logo and name,
- a description and category,
- a **Pay** button that initiates a QR payment flow.

Merchants can share this link on social media, in their WhatsApp business bio, or on printed flyers. Any consumer who visits the link can pay them instantly.

### 7.4 P2P QR

Consumers can also display a personal QR to receive money from friends or family. The flow is identical to a merchant QR but between individual wallets.

**Example:** splitting a bill, repaying a friend, or a parent sending lunch money to a child.

### 7.5 Why QR is central

| Alternative | Problem |
|-------------|---------|
| Card terminals | Expensive hardware; requires bank agreement; excludes small merchants |
| Bank transfer | Requires IBAN and reference codes; no instant confirmation |
| NFC payments | Requires NFC-capable hardware; not universal in Angola |
| Cash | No digital record; security risk; no remote payment possible |
| **QR (Banzami)** | Works with any smartphone; no hardware; instant; free to display |

QR payments eliminate the infrastructure barrier that has excluded small merchants from digital commerce in Angola. A merchant needs a phone to sign up and a printer — or even just a screen — to display their QR.

---

## 8. Wallet-Native Philosophy

### 8.1 What wallet-native means

In a card-based payment system, money moves through card networks (Visa, Mastercard), is verified by card issuers, and settles between banks over one to three business days. The consumer never directly "holds" money — they hold access to a credit or debit balance that card networks process on their behalf.

Banzami is different.

In Banzami, every account holder owns a **digital Kwanza wallet**. When a consumer pays a merchant, money moves directly from one wallet to another — in a single, atomic ledger operation, with no card network involved. Settlement is not deferred. It happens in the same transaction.

### 8.2 The primary payment rail

```
┌─────────────────┐                    ┌─────────────────┐
│  Consumer       │                    │  Merchant       │
│  Wallet         │──[ledger transfer]▶│  Wallet         │
│  @joao.silva    │                    │  @cantina.luanda│
│  Balance: 15Kz  │                    │  Balance: 0Kz   │
└─────────────────┘                    └─────────────────┘
          ↓ After payment                       ↓
   Balance: 12.5 Kz                    Balance: 2.5 Kz
```

This is the complete picture. No card network. No intermediary. One ledger operation. Both balances update instantly and atomically.

### 8.3 Banzami is NOT card-first

| Model | How it works | Banzami? |
|-------|-------------|----------|
| Stripe | Card tokenisation → card network (Visa/Mastercard) → issuer auth → settlement in days | No |
| Traditional POS | Card swipe/insert → card network → issuer → settlement | No |
| Bank transfer | IBAN + reference → interbank messaging → settlement in hours/days | No |
| **Banzami** | Wallet → ledger transfer → wallet | **Yes** |

Cards are not part of the Banzami core network. In a future phase, card top-up will allow consumers to add funds to their Banzami wallet using a debit card — but the card is used only to fund the wallet, not to make payments. Every payment, regardless of how the wallet was funded, is a wallet-to-wallet transfer.

### 8.4 Local rails, local money

Banzami's settlement infrastructure is built on Angolan rails — EMIS and the Angolan banking system. This is intentional. A payment network built on foreign card infrastructure is dependent on foreign approval, foreign pricing, and foreign availability. Banzami's settlement is Angolan, in Kwanza, on Angolan infrastructure.

This is not a limitation. It is a strength. It means Banzami works when international card networks do not, charges in AOA without currency conversion, and operates within the regulatory framework of the Banco Nacional de Angola.

### 8.5 Three levels of the same identity

```
Wallet ↔ Wallet    ←→   the financial identity (holds and transfers money)
QR ↔ QR            ←→   the physical identity (how you pay in person)
Handle ↔ Handle    ←→   the digital identity (how you address payments)
```

These three layers — wallet, QR, and handle — are all expressions of the same underlying account. They make Banzami usable in every context: physical commerce, digital commerce, remote payments, and peer-to-peer transfers.

---

## 9. Banzami for Merchants

### 9.1 Getting started

A merchant registers on Banzami, provides basic business information, and is issued a merchant wallet and a @handle within minutes. A static QR code is available for download immediately.

No POS terminal is required. No card terminal agreement is needed. No bank approval is required to start accepting payments in sandbox mode. KYC verification is required before live settlement is enabled, but the process is simple and fully digital.

### 9.2 The merchant dashboard

Every merchant has access to a web-based dashboard that provides:

- **Transaction history** — every payment received, with timestamp, amount, and consumer reference
- **Wallet balance** — available balance with a clear split between available and reserved funds
- **Analytics** — daily and monthly volume, transaction counts, peak hours
- **Payment links** — create, share, and manage payment links
- **Refunds** — issue full or partial refunds directly from the dashboard
- **Disputes** — view and respond to consumer disputes with a structured resolution process
- **Payouts** — request a bank transfer of the wallet balance to an Angolan bank account
- **API keys** — generate and manage API credentials for SDK integrations
- **Team access** — add staff with controlled permissions

### 9.3 Accepting payments

A merchant has three primary ways to receive a payment:

| Method | How | Best for |
|--------|-----|----------|
| **Static QR** | Print and display permanently | Cantinas, market stalls, physical retail |
| **Payment link** | Share via WhatsApp or social media | Remote sales, informal commerce, delivery |
| **SDK integration** | Embed in an app via SDK | Taxi apps, delivery platforms, ecommerce |

### 9.4 Payouts

Merchant wallet balances can be withdrawn to a registered Angolan bank account on demand. A payout is initiated from the dashboard or via the API. Funds are transferred via EMIS to the merchant's bank account.

Payout timing follows the EMIS interbank schedule. Banzami's role is to ensure the payout is initiated immediately and tracked with full transparency.

### 9.5 Refunds

A refund reverses a payment — partially or in full — from the merchant wallet back to the consumer's wallet. Refunds are instant when the merchant wallet has sufficient balance. They are initiated from the dashboard or via the API and generate their own transaction record for full auditability.

### 9.6 The QR storefront

Every merchant has a public profile page on `pay.banzami.org`. This page is their digital storefront: it shows the merchant name, logo, description, category, and a Pay button. Consumers who visit the page can pay directly.

Merchants can share their profile URL on Instagram, Facebook, their website, or in printed materials. It serves as a permanent, shareable payment address for the digital world.

---

## 10. Banzami for Developers

### 10.1 SDK-first architecture

Banzami is designed for developers. The recommended integration path for any application is through an official Banzami SDK — not raw HTTP calls, not handcrafted clients, not workarounds.

Official SDKs provide:
- fully typed API surfaces (no guesswork about request/response shapes),
- automatic idempotency key management (safe retry without duplicates),
- configurable retry with exponential backoff (handles transient failures),
- HMAC-SHA256 webhook signature verification (security by default),
- sandbox/live environment isolation (no accidental production calls during testing),
- structured error hierarchy (meaningful error handling, not raw HTTP codes).

### 10.2 Available SDKs

| SDK | Language | Primary use |
|-----|----------|-------------|
| `@banzami/sdk` | TypeScript / Node.js | Backend APIs, ecommerce, server-side payment flows |
| `banzami/sdk-php` | PHP | Web apps, Laravel integrations, WooCommerce |
| `banzami-go` | Go | High-performance services, microservices |
| `banzami-python` | Python | Django, FastAPI, data pipelines |
| `banzami_flutter` | Flutter / Dart | Mobile apps, in-app payment flows, QR commerce |

### 10.3 TypeScript SDK — quick start

```typescript
import { BanzamiClient, formatMinor } from '@banzami/sdk';

const client = new BanzamiClient({
  baseUrl: 'https://api.banzami.org',
  apiKey:  'bz_live_...',
});

// Create a payment link for an ecommerce order
const link = await client.createPaymentLink({
  merchantId:  'mch_...',
  walletId:    'wlt_...',
  amountMinor: 45000,                // 45 000 Kz
  description: 'Encomenda #1042',
  expiresAt:   new Date(Date.now() + 24 * 60 * 60 * 1000),
});

console.log(`Share this link: https://pay.banzami.org/${link.slug}`);
```

### 10.4 PHP SDK — quick start

```php
use Banzami\BanzamiClient;

$client = new BanzamiClient(apiKey: 'bz_live_...');

// Generate a dynamic QR for a specific transaction
$qr = $client->createDynamicQr([
    'owner_id'     => 'cns_merchant_id',
    'amount_minor' => 25000,          // 25 000 Kz
    'reference'    => 'Mesa #7',
    'expires_at'   => (new DateTime('+10 minutes'))->format(DateTime::RFC3339),
]);

echo "QR payload: {$qr['payload']}";
```

### 10.5 Flutter SDK — in-app payment

```dart
// Trigger a payment confirmation sheet inside a taxi app
final result = await BanzamiPay.confirm(
  context: context,
  merchantId:  'mch_...',
  amountMinor: 2500,           // 2 500 Kz
  reference:   'Corrida #88',
  currency:    'AOA',
);

if (result.status == PaymentStatus.completed) {
  navigateToRideSummary();
}
```

The SDK handles the entire payment flow — consumer authentication, wallet lookup, confirmation sheet UI, real-time status polling, and success/failure callbacks. The host app never needs to implement payment logic from scratch.

### 10.6 Webhooks

Webhooks deliver real-time notifications for every event in the Banzami platform: payment completed, payout processed, refund issued, dispute opened.

Every webhook delivery is signed with HMAC-SHA256. Applications must verify the signature before processing any event.

```typescript
import { BanzamiWebhooks, BanzamiWebhookError } from '@banzami/sdk';

// In your webhook handler (Express):
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
    }

    res.json({ received: true });
  } catch (err) {
    if (err instanceof BanzamiWebhookError) {
      return res.status(400).send('Invalid signature');
    }
    throw err;
  }
});
```

### 10.7 Sandbox environment

Every Banzami account has access to a full sandbox environment. Sandbox uses separate API keys (`bz_sandbox_...`), a separate base URL, and isolated data. Real money never moves in sandbox.

The sandbox API surface is identical to production. Integration, testing, and staging workflows can run completely in sandbox before any live credentials are used.

### 10.8 Core API reference

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

## 11. Banzami for Consumers

### 11.1 The consumer experience

Banzami is built for every Angolan with a smartphone. You do not need a traditional bank account to get started. You do not need to understand how the technology works. You need a phone and a Banzami wallet.

### 11.2 Getting a wallet

Registration takes under two minutes:
- Enter your phone number
- Verify with a one-time code
- Choose your @handle
- Set a PIN (and optionally enable biometric authentication)

Your wallet is ready. You can receive money immediately.

### 11.3 Paying with QR

The most common consumer action in Banzami is scanning a QR code.

```
You arrive at a cantina.
You see a QR code on the counter.
You open the Banzami app and tap "Pagar."
You scan the QR.
You see: "Pagar a @cantina.luanda"
You enter the amount: 1.500 Kz
You confirm with your fingerprint.
Your screen shows: "✅ Pago. 1.500 Kz."
The cantina owner's phone lights up.
Done.
```

### 11.4 Sending money to a friend

```
You owe a friend money for lunch.
You open the Banzami app and tap "Enviar."
You type: @maria.luanda
You enter: 3.000 Kz
You tap "Confirmar."
Done. Maria's wallet is credited instantly.
She receives a notification: "Recebeu 3.000 Kz de @joao.silva."
```

### 11.5 Paying a payment link

A merchant sends you a WhatsApp message:

```
"Aqui está o link para o pagamento: pay.banzami.org/xyz789"
```

You tap the link. Your browser opens a page showing:
- Merchant name and logo
- Amount: 15.000 Kz
- Description: Encomenda #12

You tap "Pagar com Banzami." You confirm with your PIN. Done. The merchant sees the payment instantly.

### 11.6 Receiving a payment request

A school sends your child's monthly fee as a payment request.

Your Banzami app shows a notification:
```
"Pagamento solicitado: 35.000 Kz — Escola Primária de Benguela (Março)"
```

You open it, check the amount and description, and tap "Pagar." Done. The school records the payment immediately.

### 11.7 Viewing your wallet

The Banzami app shows:
- your current balance (available and reserved),
- your full transaction history (every payment sent and received),
- your @handle and QR code (for receiving money),
- your pending payment requests.

---

## 12. Banzami Business Ecosystem

Banzami is not a single product — it is an ecosystem of interconnected participants, each of whom benefits from the network's growth.

### 12.1 Network participants

```
┌─────────────────────────────────────────────────────────────┐
│                     BANZAMI NETWORK                         │
│                                                             │
│  ┌──────────────┐     pay     ┌──────────────────────────┐  │
│  │  Consumers   │────────────▶│  Merchants               │  │
│  │  (wallets)   │             │  (wallets + dashboard)   │  │
│  └──────────────┘             └──────────────────────────┘  │
│         │                              │                    │
│         ▼                              ▼                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          Banzami Ledger & Wallet Engine              │   │
│  │          (double-entry, instant, immutable)          │   │
│  └──────────────────────────────────────────────────────┘   │
│         │                              │                    │
│         ▼                              ▼                    │
│  ┌──────────────┐             ┌──────────────────────────┐  │
│  │  Apps with   │             │  EMIS / Angolan Banks    │  │
│  │  Banzami SDK │             │  (interbank settlement)  │  │
│  └──────────────┘             └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 12.2 The network effect

Every new merchant who joins Banzami gives consumers a new place to spend their Kwanza digitally. Every new consumer who joins Banzami gives merchants a new customer who can pay without cash. The two sides reinforce each other.

Every Angolan application that integrates the Banzami SDK becomes a node in the network — bringing its own user base into the Banzami ecosystem and accelerating wallet adoption.

This is why network density matters more than geographic breadth. A dense Angolan network is more valuable to every participant than a thin presence across multiple countries.

### 12.3 Bank and partner relationships

Angolan banks are not Banzami's competitors. They are essential partners.

- **Banks provide:** licensed accounts, settlement infrastructure, regulatory compliance, and the Kwanza balances that fund Banzami wallets.
- **Banzami provides:** the instant payment UX, QR commerce layer, developer SDKs, merchant tools, and the network effect that makes digital payments habitual.

Banks gain a modern payment product on top of their existing infrastructure without having to build it. Banzami gains access to the regulated infrastructure it cannot own directly. This is a partnership, not a competition.

### 12.4 Revenue model

Banzami generates revenue through:

- **Transaction fees** on merchant payments — a small percentage of each successful settlement
- **Payout fees** — a nominal fee per bank withdrawal from a merchant wallet
- **Enterprise SDK licensing** — volume pricing for high-transaction-volume SDK integrators
- **Premium merchant tools** — advanced analytics, multi-location management, team access (future)

All fees are transparent and disclosed at onboarding. There are no hidden charges, no monthly minimums, and no hardware costs.

---

## 13. Security & Financial Integrity

Banzami handles real money. Security and financial integrity are not features — they are the foundation of everything the platform does.

### 13.1 Double-entry ledger

Every monetary movement in Banzami is recorded as an immutable **double-entry ledger entry**. This is the same accounting principle that banks and financial institutions have used for centuries — every debit is balanced by a corresponding credit, and every credit by a corresponding debit.

```
Consumer pays 2.500 Kz to a merchant:

Ledger entries created:
  Consumer Wallet   | DEBIT  | -2.500 Kz
  Merchant Wallet   | CREDIT | +2.500 Kz

Net: 0 (money is conserved — it moves, it does not appear or disappear)
```

No money is ever created or destroyed in the ledger. Every Kz in the system is accounted for at every moment. If the numbers do not balance, the system rejects the operation.

### 13.2 Immutability and audit trails

Ledger entries are **immutable** — they cannot be edited or deleted. A refund does not modify the original transaction; it creates a new, opposing ledger entry that reverses the effect. This means every state of every wallet at every point in time is fully reconstructible from the ledger history.

This is a core regulatory and trust requirement. In the event of any dispute or audit, every payment can be traced from initiation to settlement with a complete, tamper-proof record.

### 13.3 Idempotency

Every payment operation in Banzami is **idempotent** — submitting the same operation twice produces no additional effect. This is critical for a payment network: network failures sometimes cause requests to be retried. Without idempotency, a retry could create a duplicate charge.

Banzami assigns a unique idempotency key to every operation. If the same key is submitted again, the original result is returned — safely and immediately — without creating a new transaction.

### 13.4 Risk engine

Every transaction passes through a real-time risk engine before it is committed to the ledger. The risk engine evaluates:

- transaction velocity (unusual frequency from a single wallet),
- amount anomalies (amounts far outside a wallet's normal range),
- account signals (newly registered accounts, unverified KYC),
- geographic signals (device or IP location inconsistencies).

Transactions that exceed risk thresholds are held for review or declined, depending on the risk score. This protects both consumers and merchants from fraudulent activity.

### 13.5 KYC and KYB

**KYC (Know Your Customer)** — every consumer account is identity-verified before live payments are enabled. Verification uses Angolan identity documents (B.I., Passaporte, or Carta de Condução) and is tiered by transaction volume.

**KYB (Know Your Business)** — every merchant account is business-verified. This includes NIF verification for formal businesses and identity verification for individual merchants.

These processes satisfy the requirements of the Banco Nacional de Angola (BNA) for digital payment operations.

### 13.6 Encryption and data security

- All financial data is encrypted at rest using AES-256.
- All communications use TLS 1.3 in transit.
- API keys are stored as hashed values — the raw key is shown only once at creation.
- Webhook secrets are hashed at rest and used only for HMAC signature generation.
- KYC documents are stored with access controls and a full access audit log.

### 13.7 Sandbox isolation

The sandbox environment is **completely isolated** from production. Sandbox API keys cannot access production data. Production keys cannot access sandbox data. Real money never moves in sandbox. This isolation is enforced at the API layer and the infrastructure layer.

### 13.8 Reconciliation

An automated reconciliation process runs every day. It compares:
- the sum of all wallet balances against the total of all ledger credits and debits,
- expected EMIS settlement amounts against actual bank credits,
- pending payout amounts against completed bank transfers.

Any discrepancy — no matter how small — triggers an alert and a resolution process. The Banzami platform is designed to have zero unresolved discrepancies at any point in time.

---

## 14. Technical Architecture

### 14.1 Design principles

Banzami is engineered as **national-scale financial infrastructure**, not a startup MVP. Every architectural decision prioritises:

1. **Correctness** — financial operations are safe, auditable, and deterministic above all else
2. **Reliability** — the platform is available when merchants and consumers need it
3. **Security** — every layer is designed with a threat model in mind
4. **Observability** — every component emits metrics, traces, and structured logs
5. **Maintainability** — the codebase is designed for decades of operation, not months

### 14.2 Technology stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Financial core** | Rust | Memory safety, deterministic performance, no garbage collection pauses in the payment critical path |
| **API layer** | Go | Simplicity, reliability, excellent concurrency for API serving |
| **Frontend** | TypeScript + Next.js | Modern, type-safe, excellent developer experience |
| **Mobile SDKs** | Flutter | Cross-platform; single codebase for Android and iOS |
| **Database** | PostgreSQL | The single source of financial truth; ACID guarantees; proven at scale |
| **Cache & coordination** | Redis | Rate limiting, idempotency storage, session management, pub/sub |
| **Observability** | OpenTelemetry + Prometheus + Grafana | Full-stack visibility from request to ledger entry |
| **Infrastructure** | Docker + Hetzner/OVH + Cloudflare | Reliable, cost-effective, African-adjacent data centre presence |

### 14.3 Core architecture diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                  │
│   Consumer App   Merchant Dashboard   3rd-party App   SDK       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS / TLS 1.3
┌──────────────────────────▼──────────────────────────────────────┐
│                    CLOUDFLARE (DDoS, WAF, CDN)                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                      API GATEWAY (Go)                           │
│   Auth · Rate limiting · Request routing · Webhook delivery     │
└──────┬────────────────────────────────────────────┬────────────┘
       │                                            │
┌──────▼──────────┐                    ┌────────────▼────────────┐
│  PUBLIC API (Go) │                    │   ADMIN API (Go)        │
│  Payments, QR   │                    │   Settlements, Disputes │
│  Transfers, SDK │                    │   Reconciliation        │
└──────┬──────────┘                    └────────────┬────────────┘
       │                                            │
┌──────▼────────────────────────────────────────────▼────────────┐
│                     CORE API (Rust)                             │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │  Ledger  │ │ Wallets  │ │  Txns    │ │  Settlement /    │   │
│  │  Engine  │ │  Engine  │ │  Engine  │ │  Reconciliation  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │   Risk   │ │Compliance│ │ Payouts  │ │   Refunds /      │   │
│  │  Engine  │ │   Core   │ │  Engine  │ │   Disputes       │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                       POSTGRESQL                                │
│                 (single source of financial truth)              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    EMIS / ANGOLAN BANKS                         │
│                 (interbank settlement rail)                     │
└─────────────────────────────────────────────────────────────────┘
```

### 14.4 The payment critical path

Banzami's architecture is designed to keep the payment critical path minimal:

```
auth → risk check → compliance → ledger write → wallet update → response
```

Everything outside this path runs asynchronously:
- webhook delivery,
- analytics recording,
- reconciliation jobs,
- notification dispatch,
- reporting.

This ensures that the core payment operation — the part the consumer and merchant wait for — is as fast as possible, with no unnecessary blocking operations.

### 14.5 Instant settlement guarantee

Banzami's architectural contract with every transaction:

1. **Ledger writes are synchronous and atomic.** The transaction is not confirmed until the ledger entries are durable. Financial correctness is never sacrificed for speed.
2. **Wallet balances update immediately** after every committed transaction. There is no delayed balance refresh. When the consumer's success screen appears, the merchant's balance has already changed.
3. **Webhook delivery begins immediately** after transaction commit. The merchant's server-side integration receives the event within seconds of payment confirmation.

### 14.6 Modular monolith approach

Banzami is structured as a **modular monolith** — one deployable unit with strongly isolated internal modules, each with clear domain boundaries and explicit internal interfaces.

This is a deliberate choice. Microservices are complex to operate, require sophisticated orchestration, and introduce distributed systems failure modes. A well-structured modular monolith is simpler to reason about, simpler to deploy, and simpler to maintain — while still allowing individual modules to be extracted into separate services when operational necessity justifies it.

The rule: extract a service only when a scaling boundary is proven, not in anticipation of future scale.

### 14.7 Observability

Every Banzami service emits:

- **Metrics** (Prometheus) — request rates, error rates, latency percentiles, wallet operation counts, settlement amounts
- **Traces** (OpenTelemetry) — end-to-end request traces from API gateway to ledger write
- **Structured logs** — JSON-formatted logs with transaction IDs, operation types, and outcome fields
- **Health signals** — liveness and readiness endpoints for every service

Three primary Grafana dashboards provide operational visibility:
- **Payments dashboard** — transaction rates, error rates, QR completion rates, webhook delivery
- **Wallets & ledger dashboard** — transfer volume, latency percentiles, balance read rates
- **Settlements & payouts dashboard** — settlement rates, payout throughput, reconciliation status

---

## 15. The Banzami Ecosystem

### 15.1 The full platform map

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BANZAMI PLATFORM                             │
│                                                                     │
│  CONSUMER LAYER                                                     │
│  ┌─────────────────┐   ┌────────────────────────────────────────┐   │
│  │  Consumer App   │   │  pay.banzami.org (payment link / QR)   │   │
│  │  (Flutter)      │   │  profiles/@handle (merchant storefront)│   │
│  └─────────────────┘   └────────────────────────────────────────┘   │
│                                                                     │
│  MERCHANT LAYER                                                     │
│  ┌─────────────────┐   ┌────────────────────────────────────────┐   │
│  │  Merchant       │   │  Banzami QR (static + dynamic)         │   │
│  │  Dashboard      │   │  Payment links · Payment requests      │   │
│  │  (Next.js)      │   │  Refunds · Disputes · Analytics        │   │
│  └─────────────────┘   └────────────────────────────────────────┘   │
│                                                                     │
│  OPERATIONS LAYER                                                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Admin Dashboard — Settlements · Reconciliation · Disputes   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  DEVELOPER LAYER                                                    │
│  ┌──────────┐ ┌──────┐ ┌────┐ ┌──────────┐ ┌──────────────────┐    │
│  │TypeScript│ │  PHP │ │ Go │ │  Python  │ │     Flutter      │    │
│  │   SDK    │ │  SDK │ │SDK │ │   SDK    │ │      SDK         │    │
│  └──────────┘ └──────┘ └────┘ └──────────┘ └──────────────────┘    │
│                                                                     │
│  INFRASTRUCTURE LAYER                                               │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Rust Core · Go APIs · PostgreSQL · Redis · Grafana          │    │
│  │  OpenTelemetry · Prometheus · Cloudflare · Docker            │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 15.2 The developer platform

Banzami's developer platform is the infrastructure through which Angola's application builders access instant payments. It includes:

- **API documentation** — comprehensive reference for every endpoint
- **SDK documentation** — integration guides for every official SDK
- **Sandbox environment** — test without limits, without risk
- **Webhook testing tools** — inspect and replay webhook events
- **API key management** — generate, rotate, and revoke credentials
- **Integration examples** — reference implementations for common use cases

### 15.3 The plugin ecosystem

Beyond SDKs, Banzami provides pre-built integrations for common platforms:

| Plugin | Platform | Description |
|--------|----------|-------------|
| WooCommerce | WordPress | Payment gateway for WooCommerce stores |
| Shopify (future) | Shopify | Embedded Banzami checkout for Shopify merchants |
| PrestaShop (future) | PrestaShop | Payment module for PrestaShop stores |

Plugins use the SDK internally — they are not raw HTTP integrations. This ensures they inherit all SDK guarantees: idempotency, retry handling, and webhook verification.

### 15.4 Webhooks and real-time events

The Banzami webhook system delivers real-time notifications for every significant event in the platform. Applications can subscribe to specific event types and receive a signed HTTP POST to their endpoint within seconds of the triggering event.

Key event types:

| Event | Trigger |
|-------|---------|
| `transaction.completed` | A payment is settled successfully |
| `transaction.failed` | A payment attempt fails |
| `payout.completed` | A bank withdrawal is settled |
| `refund.created` | A refund is initiated |
| `refund.completed` | A refund is settled |
| `dispute.opened` | A consumer opens a dispute |
| `dispute.resolved` | A dispute is resolved |
| `payment_request.paid` | A consumer pays a payment request |
| `payment_request.declined` | A consumer declines a payment request |

---

## 16. Roadmap & Future

Banzami is in active development. The following areas represent the platform's forward direction.

### Near-term (Tier 2)

| Feature | Description |
|---------|-------------|
| **Python SDK** | Async-first SDK with Pydantic v2 models; Django and FastAPI integrations |
| **Merchant profile management** | Dashboard UI for creating and editing the public merchant profile |
| **Payment request notifications (FCM)** | Push notifications on mobile for incoming payment requests |
| **Webhook event catalogue expansion** | Events for refunds, disputes, and payment requests |

### Medium-term

| Feature | Description |
|---------|-------------|
| **Consumer mobile app** | Native Flutter app: wallet, QR scanner, P2P transfers, transaction history |
| **Recurring payments** | Scheduled payment requests for subscriptions, school fees, and memberships |
| **Split payments** | Group bills split automatically between multiple consumers |
| **Merchant discovery** | In-app merchant directory; consumer can find and pay local merchants |
| **Offline QR** | Static QR payments that queue and settle when connectivity is restored |

### Long-term

| Feature | Description |
|---------|-------------|
| **Marketplace payments** | Multi-merchant settlement in a single consumer purchase |
| **Card wallet top-up** | Consumers can fund their Banzami wallet using a debit card (card is a funding rail only — not the payment network) |
| **Financial interoperability** | Deeper EMIS integration; compatibility with wider Angolan banking infrastructure |
| **Geographic expansion** | After achieving network density in Angola: application of the same model to neighbouring markets |
| **Business accounts** | Multi-user merchant accounts with role-based permissions and accounting integrations |

### Geographic expansion philosophy

Geographic expansion is a deliberate *future* milestone, not a current objective.

A payment network needs density to be valuable. A network present in 10 countries with 100 merchants each is worth less — to every participant — than a network present in one country with 10,000 merchants. Banzami achieves network density in Angola first, then expands.

When expansion happens, it uses the same wallet-native, QR-first, SDK-first model. The architecture is designed for it. But it does not happen before Angola is served well.

---

## 17. Final Vision Statement

### What we are building

Angola's digital economy deserves infrastructure that matches its potential.

Not infrastructure copied from a Western card-processing model that was never designed for Angola. Not infrastructure dependent on foreign approval, foreign rails, or foreign pricing. Infrastructure built for Angola — for Kwanza, for Angolan merchants, for Angolan consumers, for developers building Angolan applications.

Banzami is that infrastructure.

### The transformation

**Today:**
- A merchant in Luanda cannot accept digital payments without expensive hardware.
- A consumer must photograph bank transfers and send them on WhatsApp to complete a purchase.
- A developer building an Angolan app has no SDK, no payment API, no infrastructure built for their market.
- A taxi app cannot close the payment loop inside its product.
- A cantina has no choice but cash.

**With Banzami:**
- A merchant prints a QR and accepts instant payments from any customer with a smartphone.
- A consumer scans, confirms, and pays in under 3 seconds — with a digital receipt.
- A developer integrates a typed, production-ready SDK and ships a payment feature in hours.
- A taxi app closes the ride with instant in-app settlement.
- A cantina has a digital wallet, a payment history, and the ability to grow.

### The promise

Every engineering decision, every product choice, and every design in Banzami reflects one commitment:

**Digital payments in Angola should be instant, accessible, integrated, modern, and usable by everyone.**

Not for some merchants. Not for some consumers. Not for some applications.

For every cantina. For every taxi app. For every school, market stall, ecommerce site, delivery platform, freelancer, and family.

For Angola.

```
SCAN  →  CONFIRM  →  PAID INSTANTLY
```

This is what Banzami is building. This is why Banzami exists.

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
