# BANZA — 15-Minute Quickstart Specification

**Mission:** BANZA-FIRST-100-BUILDERS-001  
**Scope:** Precise specification of what the 15-minute quickstart experience must do, cover, and produce  
**Date:** 2026-05-30  
**Status:** Official

---

## Purpose of This Document

This is a *specification*, not a tutorial. It defines:

- What the quickstart must accomplish
- The exact time budget per step
- What knowledge is required vs. explicitly waived
- What "done" looks like
- What the quickstart must NOT do
- Acceptance criteria for the quickstart as shipped

The person who writes the actual tutorial content follows this spec. The person who reviews it validates against these acceptance criteria.

---

## Non-Negotiable Constraints

**Time budget:** 15 minutes wall-clock for a developer with no prior BANZA knowledge. Timed against a person who:
- Reads at average technical reading speed
- Types at average typing speed
- Has Node.js 18+ already installed
- Has a code editor already open
- Has a terminal already open

**No prior knowledge required of:**
- The BANZA protocol
- How QR payments work
- Angola's payment landscape
- Financial invariants or double-entry accounting
- What an operator is
- What certification levels are
- The difference between BANZA, BanzAI, and Banzami

**One prerequisite, stated explicitly:** Node.js 18 or higher. (`node --version` must return `v18.x.x` or higher.)

**What "done" means:** By the end of 15 minutes, the developer has:
1. A running Node.js script that has made a real API call to the BANZA sandbox
2. A dynamic QR code payload (a string beginning with `banzami://pay/`)
3. A simulated payment confirmation from the sandbox
4. Their terminal showing a successful payment event

This is not a "hello world." It is a complete, functional payment flow — end to end. The developer has seen money move (virtually) from a consumer wallet to a merchant wallet.

---

## Time Budget

| Minute | Activity | Output |
|--------|----------|--------|
| 0:00 – 1:00 | Read the intro (what they will build) | Mental model of the payment flow |
| 1:00 – 2:00 | Get sandbox credentials (self-service) | `bz_test_*` key, sandbox merchant ID, sandbox wallet ID |
| 2:00 – 3:30 | Install the SDK | `node_modules/@banza/sdk` present |
| 3:30 – 7:00 | Write the payment flow code (copy-paste + 2 edits) | `payment.ts` with 4 API calls |
| 7:00 – 9:00 | Run and see wallet balance + QR payload | Terminal output with balance and QR |
| 9:00 – 12:00 | Simulate a payment (one endpoint call or sandbox button) | Payment confirmation in terminal |
| 12:00 – 14:00 | Set up a webhook receiver (optional fast path) | Webhook event logged to terminal |
| 14:00 – 15:00 | Read "What next?" — 3 choices | Developer chooses their next path |

The optional step (12:00–14:00) uses a pre-built minimal webhook receiver in the SDK examples. The developer runs a second terminal with the example. If they skip this step, they still complete the quickstart — the webhook receiver is a bonus, not a requirement.

---

## Exact Code the Quickstart Must Produce

The developer writes this code by following the quickstart. They are allowed to copy-paste it from the page. They edit **exactly two lines**: their API key and their sandbox merchant wallet ID (both provided at sign-up).

```typescript
// payment.ts
// Requires: Node.js >= 18, @banza/sdk installed

import { BanzaClient, formatMinor } from '@banza/sdk';

const banza = new BanzaClient({
  apiKey: 'bz_test_REPLACE_WITH_YOUR_KEY',  // ← edit this
  environment: 'sandbox',
});

// Step 1: Check merchant wallet balance
const WALLET_ID = 'wlt_sandbox_REPLACE_WITH_YOUR_WALLET'; // ← edit this

const balance = await banza.getWalletBalance(WALLET_ID);
console.log('Merchant balance:', formatMinor(balance.available_minor, 'AOA'));

// Step 2: Generate a QR code (50 Kz, valid for 10 minutes)
const qr = await banza.createDynamicQr({
  ownerId:     WALLET_ID,
  amountMinor: 5000,
  reference:   `demo-order-${Date.now()}`,
  expiresAt:   new Date(Date.now() + 10 * 60 * 1000),
});

console.log('QR payload:', qr.qr_code.payload);
console.log('QR ID:', qr.qr_code.id);

// Step 3: Simulate a consumer paying the QR (sandbox only)
const payment = await banza.sandbox.simulateQrPayment({
  qrId:            qr.qr_code.id,
  consumerWalletId: 'wlt_sandbox_consumer_demo', // pre-seeded in every sandbox
});

console.log('Payment result:', payment.status);

// Step 4: Check merchant balance again (should have increased)
const updatedBalance = await banza.getWalletBalance(WALLET_ID);
console.log('New balance:', formatMinor(updatedBalance.available_minor, 'AOA'));
console.log('Received:', formatMinor(
  updatedBalance.available_minor - balance.available_minor, 'AOA'
));
```

**Expected terminal output:**

```
Merchant balance: 1.000,00 Kz
QR payload: banzami://pay/qr_a1b2c3d4e5f6g7h8
QR ID: qr_a1b2c3d4e5f6g7h8
Payment result: COMPLETED
New balance: 1.050,00 Kz
Received: 50,00 Kz
```

---

## API Methods Required

The quickstart requires these four SDK methods to exist and work in sandbox:

| Method | Description | Notes |
|--------|-------------|-------|
| `banza.getWalletBalance(walletId)` | Returns `{ available_minor, reserved_minor, balance_minor, currency }` | Already exists |
| `banza.createDynamicQr({ ownerId, amountMinor, reference, expiresAt })` | Returns `{ qr_code: { id, payload, type, amount_minor } }` | Already exists |
| `banza.sandbox.simulateQrPayment({ qrId, consumerWalletId })` | Returns `{ status: 'COMPLETED' }` | **MISSING — must be added** |
| `formatMinor(amount, currency)` | Returns human-readable amount string (e.g. `"1.050,00 Kz"`) | Already exists |

The one missing method — `banza.sandbox.simulateQrPayment` — is the critical gap. Without it, a developer cannot complete a full payment flow without building a second script to simulate the consumer side. This single method eliminates the Day 3 friction identified in FIRST_BUILDER_JOURNEY.md.

---

## Sandbox Pre-Seeded Resources

Every sandbox account must come with these resources pre-created, requiring no setup by the developer:

| Resource | ID pattern | Details |
|----------|-----------|---------|
| Consumer wallet | `wlt_sandbox_consumer_demo` | Funded with 50,000 minor units (500 Kz). Never goes below 10,000 minor units (auto-topped up). |
| Merchant account | Provided at sign-up | Basic merchant with a wallet |
| Merchant wallet | `wlt_sandbox_<unique>` | Funded with 100,000 minor units (1,000 Kz). Shown in the onboarding email. |
| Static QR for merchant | `qr_sandbox_static_demo` | Pre-generated. Not required for quickstart but useful for Day 2 exploration. |

The consumer demo wallet (`wlt_sandbox_consumer_demo`) is shared across all sandbox accounts — it is a sandbox fixture, not a real wallet. It always has sufficient funds. The developer does not need to fund it or create it.

---

## What the Quickstart Must NOT Do

These are common mistakes in developer quickstarts that this one must explicitly avoid:

| Prohibited | Why |
|------------|-----|
| Require understanding of double-entry accounting | The kernel handles this. Builders do not need to know. |
| Require understanding of the BANZA certification levels | Irrelevant for SDK integration. |
| Require reading the BANZA_REFERENCE.md before starting | 40-section document. Not a prerequisite for a QR payment. |
| Explain what a "ledger" is before showing a balance | Show the balance first. The ledger is an implementation detail. |
| Use terms like "operator," "invariant," or "conformance" | Protocol vocabulary. Not builder vocabulary. |
| Require registering a legal business entity | KYC is for going live. Exploration is free. |
| Show more than one way to do the same thing | One canonical path per quickstart. Alternatives go in the reference. |
| Link away from the quickstart page before completion | Every external link is a drop-off risk. |
| Promise the quickstart takes 5 minutes when it takes 20 | The stated time must be accurate. Under-promising is fine; over-promising loses trust. |
| Use `console.log(JSON.stringify(response, null, 2))` for output | Builders do not want to read raw JSON. Use `formatMinor` and named logs. |

---

## Quickstart Page Structure

The quickstart page (document or web page) follows this exact structure:

```
H1: Accept your first payment in 15 minutes
    [One sentence: what this builds]

H2: Prerequisites
    [Single item: Node.js >= 18]

H2: 1. Get your sandbox key     [1 min]
    [Direct link to sandbox.banzami.com/signup]
    [Screenshot: what the email looks like with keys]

H2: 2. Install the SDK           [1.5 min]
    npm install @banza/sdk
    [Single line. No other dependencies.]

H2: 3. Write the payment flow    [3.5 min]
    [Code block: the exact 40-line payment.ts above]
    [Exactly two highlighted lines the developer must edit]

H2: 4. Run it                    [2 min]
    npx ts-node --esm payment.ts
    [Expected output block — exact match]

H2: 5. You just moved money      [1 min]
    [One paragraph: what just happened]
    [Explain minor units in one sentence: "5000 = 50 Kz (100 minor per 1 Kz)"]
    [One sentence about the QR payload format]

H2: (Optional) Add a webhook     [2 min]
    [Link to node-webhook example in SDK]
    [5 lines of setup code]

H2: What to build next           [1 min]
    [3 cards, each linking to a deeper guide:]
    → Payment link (for online commerce)
    → QR screen (for Flutter merchant app)
    → Webhook handler (for order automation)
```

Total page length: under 800 words, excluding code blocks. If it is longer than 800 words, content must be moved to linked deeper guides.

---

## Acceptance Criteria

The quickstart is considered ready to ship when:

| Criterion | Verification method |
|-----------|-------------------|
| `@banza/sdk` is published on npm | `npm install @banza/sdk` succeeds with no errors |
| `banza.sandbox.simulateQrPayment` method exists and works | Running the payment.ts produces `Payment result: COMPLETED` |
| Sandbox sign-up issues a key in < 60 seconds, no human required | Tested with a new email address by someone who has never used BANZA |
| Pre-seeded `wlt_sandbox_consumer_demo` exists in every new sandbox | Verified by new account creation |
| Running `payment.ts` produces exact expected output | Terminal output matches the spec above |
| Wall-clock time for a first-time developer is ≤ 15 minutes | Timed with one external developer who has not seen BANZA before |
| Zero mentions of "operator," "certification," "invariant," or "ledger" | Text search on the quickstart page |
| Page length ≤ 800 words (excluding code) | Word count tool |
| Quickstart works on macOS, Linux, and Windows (WSL) | Tested on all three |

---

## Failure Mode Catalogue

The quickstart writer must handle these failure modes explicitly in the text — not by hiding them, but by telling the developer exactly what to do:

| Failure | Message | Resolution |
|---------|---------|------------|
| `Cannot find module '@banza/sdk'` | SDK not installed | `npm install @banza/sdk` |
| `BanzaApiError: 401 Unauthorized` | Key not valid or copied incorrectly | Check you copied the full key including `bz_test_` prefix |
| `BanzaApiError: Wallet not found` | Wallet ID is wrong | Use the wallet ID from your onboarding email exactly |
| `BanzaApiError: QR has expired` | QR was not used within the expiry window | Increase `expiresAt` to 30 minutes; re-run from Step 3 |
| `BanzaApiError: Insufficient funds` | Consumer wallet has zero balance | Use `wlt_sandbox_consumer_demo` (not your merchant wallet) |
| `SyntaxError: Cannot use import statement` | TypeScript/ESM issue | Run with `--esm` flag or use the `.mjs` version |

Each failure message block is a collapsed/expandable section at the bottom of the quickstart — visible but not interrupting the happy path.

---

## The Sandbox Sign-Up Page Specification

The sandbox sign-up page (`sandbox.banzami.com/signup`) must:

1. Accept **email address only** (no password at this stage — deliver a magic link)
2. Send a response email within 30 seconds containing:
   - API key: `bz_test_<24-char-random>`
   - Merchant ID: `mch_sandbox_<8-char-random>`
   - Wallet ID: `wlt_sandbox_<8-char-random>`
   - Link to the quickstart
3. **No KYC, no business registration, no phone number**
4. The email subject: **"Your BANZA sandbox is ready"**

The developer does not need to log in, set a password, or navigate a dashboard to get their key. The key arrives in their inbox and works immediately.

This is the single most important infrastructure change required for builder adoption. Until it exists, the quickstart cannot reach its 15-minute target.

---

*Part of BANZA-FIRST-100-BUILDERS-001 — 2026-05-30*  
*Related: [FIRST_BUILDER_JOURNEY.md](FIRST_BUILDER_JOURNEY.md) · [SANDBOX_REQUIREMENTS.md](SANDBOX_REQUIREMENTS.md) · [SDK_ADOPTION_PLAN.md](SDK_ADOPTION_PLAN.md)*
