# BANZA — First Builder Journey

**Mission:** BANZA-FIRST-100-BUILDERS-001  
**Scope:** The complete journey of a technical builder from first discovery to first shipped project  
**Date:** 2026-05-30  
**Status:** Official

---

## Purpose of This Document

This document defines the *intended experience* of a developer discovering and building on BANZA. It serves two functions:

1. **Design target** — every touchpoint in the builder experience should be designed to match this journey, not contradict it.
2. **Friction audit baseline** — if a real developer's journey deviates from this at any step, that deviation is adoption friction to be eliminated.

---

## The Builder We Are Designing For

**Primary persona: The Angolan product engineer**

- Builds mobile apps, web services, or automation tools
- Has 1–5 years of professional development experience
- Works in TypeScript, Flutter, PHP, or Python
- Builds products that handle money today (e-commerce, service booking, delivery, schools, cooperatives)
- Currently integrates with a bank API via a brittle direct HTTP integration, or accepts cash
- Is not a protocol expert, not a fintech specialist, not a DBA
- Has a weekend free and a problem to solve

**Secondary persona: The hackathon builder**

- Student or early-career developer
- Wants to win a prize or ship something impressive in 48 hours
- Needs immediate feedback loops — no waiting for approvals
- Will share what they build on Twitter, GitHub, or Instagram

**What both personas have in common:**

They do not want to learn a new protocol. They want to solve a specific problem. BANZA must meet them at their problem, not ask them to study infrastructure first.

---

## The Journey — Step by Step

### Monday: Discovery

**The event:** A developer encounters BANZA.

The discovery channel matters less than what they see in the first 30 seconds. The builder lands on a README, a Twitter post, a GitHub repo, or a reference in another developer's code. The first 30 seconds answers one question:

> "Can I use this for my thing?"

**What they see now:** The BANZA/Banzami README is thorough and correct. It describes the protocol architecture, the ecosystem, the financial invariants, the certification model. For an operator or investor, this is the right content.

**What the builder needs in 30 seconds:**

```
Accept instant Kwanza payments in your app.
No bank negotiations. No terminal. QR-native.

npm install @banza/sdk
```

The protocol can come later. The first 30 seconds is a single sentence and a single command.

**Friction point:** The current README opens with the ecosystem architecture. A builder does not know what an "operator" is and does not need to. The builder hook must come before the protocol explanation.

---

### Monday: The README Hook (30 seconds → 5 minutes)

After the hook, the builder wants to know: "Is this real? Does it work?"

The README must answer this with a working code sample — not a description of a working code sample, but actual runnable code that produces a visible result:

```typescript
import { BanzaClient } from '@banza/sdk';

const banza = new BanzaClient({
  apiKey: 'bz_test_REPLACE_ME',
  environment: 'sandbox',
});

// Create a merchant wallet
const merchant = await banza.merchants.get('mch_sandbox_demo');
const balance = await banza.getWalletBalance(merchant.wallet_id);

console.log(`Merchant balance: ${balance.available_minor} minor units`);

// Generate a QR code for payment
const qr = await banza.createDynamicQr({
  ownerId:     merchant.wallet_id,
  amountMinor: 5000, // 50 Kz
  reference:   'demo-order-001',
});

console.log('QR payload:', qr.qr_code.payload);
// → banzami://pay/qr_xxxxxxxxxx
```

This sample has a property the builder is checking for: it looks like real code they would write. Not over-engineered. No 15-line configuration block. Three API calls. One visible result.

**What the builder asks next:** "How do I get `bz_test_REPLACE_ME`?"

This question must be answered in the next paragraph with a single link that works.

---

### Monday: Sandbox Key (5 minutes → 10 minutes)

The builder follows the link and gets a sandbox API key.

**The experience they expect:** Sign up (email + password), receive key immediately, no human approval, no waiting for an email from a sales team, no KYC at this stage.

**What currently exists:** Key issuance requires the dashboard (Settings → API Keys). The dashboard requires a merchant account. Merchant registration requires a KYB flow (business verification; the legal representative does personal KYC separately).

**The gap:** KYC at sandbox entry is a hard stop. A developer who just wants to test a payment flow does not have a business registered and does not want to submit business documents before they have validated that the tool is worth their time.

**Required experience:**

```
→ Go to sandbox.banzami.com
→ Enter email address
→ Receive email with:
     bz_test_<24-char-key>
     Sandbox merchant ID: mch_sandbox_<id>
     Sandbox wallet ID: wlt_sandbox_<id>
→ Paste into code
→ First API call works
```

Zero friction between "I want to try this" and "I have a working key." KYC belongs at the point of going live — not at the point of first exploration.

---

### Monday: First API Call (10 minutes → 20 minutes)

The builder runs the quickstart code. They see a result. This is the most important moment in the entire journey: **the first successful API call.**

If this call returns:

```json
{
  "available_minor": 100000,
  "reserved_minor": 0,
  "balance_minor": 100000,
  "currency": "AOA"
}
```

The builder understands two things immediately:
1. The API works
2. Integer minor units — `100000` is 1000 Kz (because 1 AOA = 100 minor units)

The integer-minor-units model is a key BANZA concept. It is also the most common source of initial confusion. The quickstart must introduce it naturally at this moment — not before it, not as a prerequisite.

---

### Tuesday: Exploration (Day 2)

The builder now has a working API call. They explore.

**What they do on Day 2 depends on their problem:**

| Builder's problem | What they explore next |
|-------------------|----------------------|
| Build a payment flow for a delivery app | Dynamic QR → transfer flow → webhook confirmation |
| Build a tip/donation feature | Payment links → `getPublicPaymentLink` → poll for status |
| Build a P2P transfer feature | `sendTransfer` → @handle lookup → balance check |
| Build a merchant dashboard | `listTransactions` → pagination → webhook events |
| Build a wallet top-up flow | Consumer wallet → funding → balance |

**What they need available on Day 2:**

1. **API reference** — a complete, searchable list of every method on `BanzaClient`, with parameter types and return types. Currently: the TypeScript types are in `src/types.ts` and the README covers the major flows. A hosted API reference (auto-generated from types or OpenAPI) is missing.

2. **Sandbox funded wallets** — out of the box, the sandbox environment should come with:
   - One merchant account with a funded wallet (100,000 Kz in virtual funds)
   - One consumer account with a funded wallet (50,000 Kz in virtual funds)
   - One pre-generated static QR for the merchant
   - Ready to use with no setup

3. **Error messages that explain themselves** — when a builder makes a mistake (wrong wallet ID, insufficient funds, expired QR), the error should tell them exactly what happened. `BanzaApiError` has `isInsufficientFunds`, `isWalletNotFound`, `isWalletNotActive` — this is the right approach. More error types needed for QR expiry, duplicate idempotency keys, and rate limits.

---

### Wednesday: The First Build (Day 3)

By Day 3, the builder has their own project. They are integrating BANZA into something real (or simulated).

**The "one weekend" build targets** (see FIRST_100_BUILDERS_ROADMAP.md for full list):

- **Payment link for a food delivery bot** — creates a payment link, sends via Telegram or WhatsApp, polls for confirmation
- **QR payment screen for a Flutter merchant app** — generates a dynamic QR, shows it on screen, listens via webhook for payment confirmation
- **Webhook receiver in Next.js** — handles `payment_link.paid` and `transaction.completed` events, updates order status
- **P2P transfer in a Node.js script** — sends Kz from one @handle to another with balance checks
- **Settlement tracker** — polls transaction history, aggregates daily volume, exports CSV

These are all achievable with what exists today in `@banza/sdk`. The SDK surface is sufficient for all five.

**What blocks builders on Day 3:**

1. **Webhook delivery in sandbox** — builders testing webhook flows need webhooks to actually arrive in their local environment. This requires a tunnel (ngrok, cloudflare tunnel, localtunnel). The quickstart should show this setup explicitly, since most builders have not done it before.

2. **Understanding idempotency keys** — the SDK handles idempotency automatically for most operations, but builders who construct raw requests or use the SDK in non-obvious ways will encounter duplicate key errors. A one-paragraph explanation of idempotency in the context of payment APIs is needed.

3. **The "confirmed payment" moment** — a builder building a QR payment flow needs to understand the full loop: QR generated → consumer pays → webhook fires → order marked paid. Without a consumer-side simulator in the sandbox (a button that says "simulate payment on this QR"), they must build a second script to simulate the consumer side. This is the biggest Day 3 friction point.

---

### Thursday: Sharing (Day 4)

By Day 4, a builder who has had a successful experience will share it. This is the viral loop.

**What they share depends on what they built:**

- A screenshot of a payment confirmation
- A 60-second demo video
- A GitHub repo with a README saying "BANZA payment integration for [use case]"
- A Twitter/X thread about "how I built X with BANZA in one weekend"

**What makes something shareable:**

1. It does something visually interesting — a QR code appearing, a payment notification arriving, a balance updating in real time
2. It is small enough to understand in 5 minutes
3. It has a clear Angolan context — not a generic payment demo, but something recognizably Angolan (a cantina, a mototaxi, a festival ticket)

**What BANZA needs to support sharing:**

- A "built with BANZA" badge/icon for GitHub READMEs
- A Twitter/X thread template (what to say when you share your first build)
- A Discord or Telegram channel where builders share their builds and get reactions

---

### Friday: Production (Day 5)

The Friday criterion from the mission: *"By Friday they have built a payment flow, a merchant integration, a wallet integration, or a protocol tool — without contacting the BANZA team."*

Meeting this criterion requires that the following work without any team contact:

| Requirement | Current state | Gap |
|-------------|--------------|-----|
| Sandbox API key, self-service | Manual (requires dashboard + merchant registration) | Needs instant sandbox sign-up |
| SDK installation | `npm install @banza/sdk` (not yet on npm) | Needs npm publish |
| First API call works | Works if SDK is installed and key exists | Blocked by above two |
| QR payment flow end-to-end | Requires two clients (payer + merchant) | Needs consumer simulator |
| Webhook delivery locally | Requires ngrok setup | Quickstart must cover this |
| Error messages are clear | `BanzaApiError` covers major cases | Needs QR-expiry and rate-limit errors |
| Going live | Requires KYC and merchant approval | Acceptable friction at this stage |

**The minimal definition of "built by Friday":**

A developer who discovers BANZA on Monday, installs the SDK, gets a sandbox key, builds a complete payment flow (generate QR → simulate payment → receive webhook → confirm order), and deploys a working demo to a public URL — having never sent a message to the BANZA team.

Everything on that path must work without human intervention. Today, steps 2 and 3 (SDK install + sandbox key) block all others.

---

## Journey Anti-Patterns to Eliminate

| Anti-pattern | What it blocks |
|-------------|---------------|
| "Contact sales for API access" | Everything. Nobody will. |
| Requiring business registration before sandbox access | First call |
| SDK not on npm | Installation |
| No consumer simulator in sandbox | QR payment end-to-end |
| No API reference (browsable) | Day 2 exploration |
| Protocol-first documentation | First 30 seconds |
| No "what can I build in a weekend?" page | Day 1 motivation |
| No builder community channel | Day 4 sharing |

---

*Part of BANZA-FIRST-100-BUILDERS-001 — 2026-05-30*  
*Related: [15_MINUTE_QUICKSTART_SPEC.md](15_MINUTE_QUICKSTART_SPEC.md) · [SANDBOX_REQUIREMENTS.md](SANDBOX_REQUIREMENTS.md) · [SDK_ADOPTION_PLAN.md](SDK_ADOPTION_PLAN.md)*
