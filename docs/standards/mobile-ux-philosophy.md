# Banza Mobile UX Philosophy

**Status:** Active  
**Date:** 2026-05-19  
**Applies to:** Consumer app, merchant app, Flutter SDK, in-app payment flows, QR surfaces  

---

## The Core Principle

> **SCAN → CONFIRM → PAID INSTANTLY**

This is not a tagline. It is the product contract with every Angolan user.

Every mobile payment interaction Banza ships must respect this sequence. If a flow deviates — adds friction, introduces waiting, or requires manual confirmation — it must be justified against this standard and treated as a defect to be resolved.

---

## Why Mobile UX Is a First-Class Engineering Concern

Banza's primary market is Angola. In Angola:

- The majority of digital commerce happens on smartphones, not desktop browsers.
- Mobile data is expensive and not always fast. Screens must load fast on 3G; flows must survive network interruption.
- A significant portion of target users are first-time digital payment users. Cognitive load must be minimal.
- The competitor is cash — which is frictionless, instant, and requires no app. Banza must be *easier* than cash.
- Merchant hardware is minimal. Most small merchants have one phone, not a POS terminal. The merchant experience must work on a mid-range Android with no accessories.

If the UX is slow, confusing, or unreliable, users return to cash and WhatsApp. There is no margin for "good enough."

---

## Reference Models

These platforms set the standard for what Banza's UX must feel like. They are reference for interaction quality and user expectation — not competitors.

| Platform | What Banza learns from it |
|----------|----------------------------|
| **Pix (Brazil)** | QR scan → immediate confirmation → no waiting; zero cognitive load for merchants; every Brazilian bank must support it |
| **UPI / PhonePe (India)** | @handle as primary payment address; instant push notification on receipt; clean confirmation screen |
| **WeChat Pay (China)** | QR is the dominant consumer habit; speed and reliability make QR preferable to cash even for tiny transactions |
| **M-Pesa (Kenya/Tanzania)** | Mobile money that works on basic phones; trust through simplicity; offline-tolerant design |

These platforms did not succeed by being "good enough." They succeeded by being obviously, demonstrably better than the alternative. Banza must do the same for Angola.

---

## The Canonical Payment Flow

### Merchant side (QR payment)

```
Merchant opens app
        ↓
QR displayed immediately (static QR: stored locally, no network call)
        ↓
Push notification: "Pagamento recebido — 2.500 Kz de @joao.silva"
        ↓
Balance updated in real time on dashboard
```

The merchant should not have to touch the screen after displaying the QR. The notification and balance update are automatic and instant.

### Consumer side (QR payment)

```
Consumer opens camera or Banza app
        ↓
QR scanned
        ↓
Payment confirmation screen: shows merchant name, amount, wallet balance
        ↓
Consumer confirms (one tap — biometric or PIN)
        ↓
Success screen: "Pago! 2.500 Kz para @cantina.luanda"
        ↓
Push notification to merchant
```

Total time from scan to confirmed success: **under 3 seconds on a 4G connection**.

### Acceptable latency bounds

| Step | Target | Maximum acceptable |
|------|--------|--------------------|
| QR decode → confirmation screen | < 500ms | 1s |
| Confirmation screen → payment complete | < 1.5s | 3s |
| End-to-end (scan to success screen) | < 2s | 5s |
| Merchant push notification after payment | < 1s | 3s |

If any step exceeds these bounds, it is treated as a performance regression, not an acceptable state.

---

## UX Rules (Binding)

### 1. Never ask for a card number

Users must never be asked for:
- card numbers,
- CVV codes,
- expiry dates,
- billing addresses.

Banza is a wallet-native network. The consumer pays from their Banza wallet. Card top-up (future feature) happens in a separate, clearly framed "add funds" flow — never inside a merchant payment confirmation.

### 2. One-tap confirmation for known merchants

If the consumer has paid this merchant before and the amount is within normal range, the confirmation screen should require only one tap (biometric preferred, PIN fallback). No secondary confirmation dialogs. No "are you sure?" popups.

### 3. Offline-tolerant QR

Static QR codes must work when the merchant has no internet. The static QR encodes the merchant's wallet reference and handle. The consumer's app connects to the network to complete the transfer. The merchant's notification arrives when connectivity resumes.

For dynamic QR (fixed amount, time-limited), the consumer app fetches the QR details online. If the merchant's connection is unstable, dynamic QR should fall back gracefully to static QR.

### 4. Data-aware design

Angola's mobile data reality:
- images must be compressed aggressively (WebP, lazy-load),
- no background polling — use push notifications and WebSocket for live events,
- screens must render fully on 3G within 2 seconds,
- offline states must be handled explicitly (no spinner that runs forever; show a clear message and retry button),
- the app must cache wallet balance and recent transactions so it is usable without connectivity for read operations.

### 5. Portuguese-first

All consumer and merchant UI text is in European Portuguese adapted for Angola (`pt-AO`). This includes:
- currency formatting: `2.500 Kz` (not `AOA 2,500.00` or `2500 AOA`),
- date formatting: `19 de maio de 2026` (not `2026-05-19`),
- error messages in natural Portuguese (not translated English strings),
- push notification copy in Portuguese.

English is only used in developer-facing tooling and SDK documentation.

### 6. Error states must be actionable

If a payment fails, the user must know:
1. **What happened** — "Saldo insuficiente" not "Error code 4023"
2. **What to do** — "Adicione fundos para continuar" with a direct CTA
3. **That the money did not leave their wallet** — confirmation that the transaction was not partially processed

Ambiguous failure states (spinner that freezes, silent errors, no feedback after a tap) are defects.

### 7. Confirmation is final

Once the success screen is shown, the payment is confirmed. There is no "processing" limbo state visible to the user. The system guarantees this by not showing the success screen until the ledger write is committed and the wallet balances are updated.

---

## Merchant-Specific UX

### Small merchant (cantina, kiosk)

The merchant's primary surface is a printed static QR. The app is opened to:
- see that a payment arrived (notification → tap → payment detail),
- check the current balance,
- request a payout.

The merchant app must work on a low-end Android (2GB RAM, 5-year-old chipset) without degradation. Heavy animations, large images, or background processes are prohibited in the merchant home screen.

### App-integrated merchant (taxi, delivery)

The payment UI is embedded inside the merchant's own app via the Banza Flutter SDK. The SDK provides:
- a pre-built payment confirmation sheet (bottom sheet or full-screen),
- configurable branding (merchant colors, logo),
- real-time payment status via WebSocket,
- success/failure callbacks for the host app to handle.

The SDK must not require the consumer to leave the host app. The entire flow — wallet authentication, payment confirmation, receipt — happens inside the sheet.

### Biometric authentication

Payment confirmation via biometrics (fingerprint, Face ID) is supported and preferred. PIN is the fallback. Passwords are never used for payment confirmation.

Biometric auth is scoped to payment confirmation only. App access uses standard mobile auth (optional biometric or PIN for app unlock).

---

## SDK UX Contract (Flutter SDK)

The Flutter SDK must expose:

```dart
// Trigger payment confirmation sheet from merchant app
final result = await BanzaPay.confirm(
  context: context,
  merchantId: 'mch_...',
  amountMinor: 2500,        // 2 500 Kz
  reference: 'Corrida #42',
  currency: 'AOA',
);

if (result.status == PaymentStatus.completed) {
  // Proceed — payment confirmed
}
```

The sheet handles everything: consumer authentication, wallet lookup, confirmation UX, success/failure display, and callbacks. The merchant app receives a typed result.

The SDK must NOT:
- require the consumer to leave the host app,
- open a browser or WebView for the payment flow,
- require the merchant app to implement its own polling or state management for payment status.

---

## Consumer App Navigation Philosophy

The consumer app is organized around three actions:
1. **Pay** — scan a QR or enter a @handle
2. **Receive** — show my QR for someone to scan
3. **History** — recent transactions

Everything else (balance, settings, add funds) is secondary. The primary screen defaults to the pay/receive surface, not a dashboard of statistics.

Minimal navigation depth: the most common action (pay) must be reachable in one tap from the home screen.

---

## Push Notifications

Push notifications are the real-time confirmation channel. They must be:
- delivered within 3 seconds of transaction commit,
- actionable (tap to open transaction detail),
- Portuguese,
- unambiguous about direction (received vs. sent),
- silent for system events (account updates, KYC status) — only payment events use sound/vibration.

Format:
- Received: "💰 Recebeu 2.500 Kz de @joao.silva"
- Sent: "✅ Pagou 2.500 Kz a @cantina.luanda"
- Failed: "❌ Pagamento não concluído — saldo insuficiente"

(Emoji is permitted in push notification copy only — not in in-app UI unless explicitly approved.)

---

## Anti-Patterns (Do Not Ship)

| Anti-pattern | Why it is prohibited |
|--------------|----------------------|
| Payment confirmation spinner > 3s with no feedback | Looks like failure; creates double-tap risk |
| "Are you sure?" confirmation dialog after the confirm tap | Adds friction; users already confirmed |
| Requiring card details at payment time | Wrong network model; kills the wallet-native UX |
| Balance shown as "updating..." after payment | Wallet balances are strongly consistent; show the new balance immediately |
| Generic error messages ("Something went wrong") | Users cannot act on them; creates support load |
| Opening a browser for the payment flow | Users expect in-app; breaks UX flow; kills conversion |
| Full-page loading skeleton on repeat visits | Cache the data; render stale-while-revalidate |
| English strings in consumer UI | pt-AO is mandatory; English is for developers only |

---

## References

- [ADR-013 — Wallet-Native Payment Network Identity](../adr/ADR-013-wallet-native-identity.md)
- [ADR-014 — Angola-First National Mission and Market Positioning](../adr/ADR-014-angola-national-mission.md)
- [CLAUDE.md §2.6 — Instant Payments as a Core Architectural Principle](../../CLAUDE.md)
- [CLAUDE.md §2.7 — Wallet-Native Identity](../../CLAUDE.md)
- [Product Strategy](../product/strategy.md)
- Pix UX guidelines (Banco Central do Brasil)
- Material Design 3 — for Flutter SDK component baseline
