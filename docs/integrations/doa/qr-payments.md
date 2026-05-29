# Doa × Banza — QR Payments

QR is the primary payment modality for Angola. This document covers every aspect of how Doa implements the Banzami QR payment experience.

---

## The QR Payment Model

Banza payment links use a **merchant-presented QR** model:

1. The merchant (Doa) creates a payment link and renders its URL as a QR code.
2. The customer (donor) scans with the Banza consumer app.
3. The Banzami app resolves the link, shows the amount and merchant name.
4. The customer confirms with PIN or biometrics.
5. The link transitions from `ACTIVE` to `USED`.
6. The merchant detects confirmation via polling or webhook.

This is distinct from a customer-presented QR (where the merchant scans the customer's wallet QR). Merchant-presented QR suits web-based donation flows because the QR is displayed in the browser.

---

## QR URL Structure

The QR encodes the Banza pay-page URL:

```
https://pay.banzami.org/{slug}
```

Where `{slug}` is the short, URL-safe identifier returned by the payment link API. Example:

```
https://pay.banzami.org/abc123def
```

The Banza consumer app handles this URL natively — opening it in the app directly presents the payment confirmation screen without going through the browser.

**Slug vs ID**: The `slug` is used in URLs and QR codes. The `id` (UUID) is used for API calls and stored as `provider_ref`. They refer to the same payment link but serve different purposes.

---

## QR Generation

Doa generates the QR image **client-side** using the `qrcode` npm package:

```typescript
// Dynamic import — deferred until BanzamiPanel mounts
import('qrcode').then((QRCode) => {
  QRCode.toDataURL(payUrl, {
    width: 260,
    margin: 2,
    color: { dark: '#0f172a', light: '#ffffff' },
  }).then((url) => setQrSrc(url));
});
```

**Output**: A PNG data URL (~5–8 kB) rendered as an `<img>` tag.

**Parameters**:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `width` | 260 px | Large enough to scan reliably at arm's length on mobile |
| `margin` | 2 modules | Minimum quiet zone per QR spec |
| `color.dark` | `#0f172a` | Dark navy — high contrast on white |
| `color.light` | `#ffffff` | White background |

**Why client-side?**

- The QR is only needed conditionally (when the donor reaches the Banza stage).
- The `qrcode` library is ~50 kB; dynamic import defers this cost until needed.
- Server-side generation would either bloat SSR output or require a separate API call.
- The pay URL is already available client-side at the point of rendering — no round-trip needed.

**Error handling**: If QR generation fails (e.g., malformed URL), the panel falls back to a spinner indefinitely. The "Ou abre o link de pagamento" external link is always present as a fallback.

---

## Mobile Fallback

The QR panel always renders an external link:

```tsx
<a
  href={payUrl}
  target="_blank"
  rel="noopener noreferrer"
>
  Ou abre o link de pagamento
</a>
```

This is critical for donors who are already on their phone — they cannot scan a QR displayed on the same device. Tapping this link opens `pay.banzami.org/{slug}` in the browser or, if the Banzami app is installed and handles the URL scheme, directly in the app.

---

## Polling Architecture

While the QR is displayed, the browser polls `GET /api/donations/banzami-status` every 3 seconds:

```typescript
pollRef.current = setInterval(async () => {
  try {
    const params = new URLSearchParams({ intent_id: intentId, link_id: linkId });
    const r = await fetch(`/api/donations/banzami-status?${params}`);
    if (!r.ok) return;  // transient error — try again next tick
    const j = await r.json() as { confirmed: boolean };
    if (j.confirmed) {
      clearInterval(pollRef.current!);
      setConfirmed(true);
      setTimeout(() => { window.location.href = returnUrl; }, 1200);
    }
  } catch { /* ignore — next tick will retry */ }
}, 3000);
```

**Poll endpoint (`GET /api/donations/banzami-status`)**:

1. Validates `intent_id` (UUID) and `link_id` via Zod schema.
2. Calls `GET /v1/payment-links/{link_id}` with Bearer token.
3. If `status = USED`: calls `applyPaymentEvent()`, generates receipt, revalidates cache, returns `{ confirmed: true }`.
4. Otherwise: returns `{ confirmed: false }`.

**Poll lifecycle**:

```
BanzamiPanel mounts → setInterval(3000ms) starts
      │
      ├── Each tick: fetch banzami-status
      │         ├── network error → skip tick, continue
      │         ├── status ACTIVE → { confirmed: false } → continue
      │         └── status USED  → { confirmed: true }
      │                                   │
      │                             clearInterval()
      │                             setConfirmed(true)
      │                             1.2 s delay
      │                             redirect
      │
      └── Component unmounts → clearInterval() cleanup

```

**Why 3 seconds?** Under 3 seconds per tick means a payment confirmed at second 0 is reflected in the UI within 3 seconds — perceived as near-instant. Polling at 1 second would triple the API call volume without meaningfully improving the UX. Polling at 5 seconds would feel noticeably laggy after a fast Banza confirmation.

---

## Instant Confirmation UX

When the poll returns `{ confirmed: true }`, the panel transitions:

```
Waiting state:
  [QR code]
  [Pulsing dot] "A aguardar confirmação — não feches esta página…"

↓ (confirmed = true)

Success state:
  [Green check circle, 20px ring]
  "Pagamento confirmado!"
  "A redirecionar…"

↓ (after 1.2 s)

redirect → /c/{slug}/doar/obrigado?intent={intentId}
```

The 1.2-second delay before redirect gives the donor time to see the confirmation before being taken away. Without it, the transition would feel abrupt.

---

## Payment Link Expiration

Banza payment links expire when:
- `expires_at` is set at creation time and the TTL elapses (Doa does not set `expires_at` — links are open-ended by default)
- The merchant explicitly cancels the link via `DELETE /v1/payment-links/{id}`

An `EXPIRED` link returns `status = 'EXPIRED'` from `GET /v1/payment-links/{id}`. The current poll endpoint treats any non-`USED` status as `{ confirmed: false }`. This means an expired link causes the UI to wait indefinitely.

**Production improvement**: The poll endpoint should detect `EXPIRED` and `CANCELLED` statuses and return `{ confirmed: false, expired: true }`. The frontend should then show an error with a retry button.

---

## QR on Mobile — User Journey

```
Donor is on a mobile phone visiting doadoa.app

Step 1: Amount selection
Step 2: Identity + OTP
Step 3: Method picker → selects Banzami

BanzamiPanel renders:
  ┌─────────────────────────────┐
  │ Paga com o Banzami    SANDBOX│ ← sandbox badge (if test key)
  │                              │
  │ 1 ● Abre a app Banzami      │
  │ 2 ● Toca em Pagar e usa QR  │
  │ 3 ● Confirma o pagamento    │
  │                              │
  │   ┌──────────────────────┐  │
  │   │                      │  │
  │   │   [QR code image]    │  │
  │   │                      │  │
  │   └──────────────────────┘  │
  │                              │
  │   Ou abre o link →           │  ← mobile tap → opens Banza app
  │                              │
  │  ● A aguardar confirmação…   │  ← pulsing dot
  └─────────────────────────────┘

Donor taps "Ou abre o link"
  → Banza app opens at pay.banzami.org/abc123def
  → Shows: "Banza Business — 1,500.00 AOA"
  → Donor enters PIN
  → Banzami confirms

Poll detects USED:
  → Green check: "Pagamento confirmado!"
  → Redirect to /obrigado
```

---

## QR on Desktop — User Journey

```
Donor is on a laptop visiting doadoa.app

BanzamiPanel renders:
  [Same layout — QR code prominent]

Donor opens Banza app on their phone:
  → App → Pagar → QR scanner
  → Points phone camera at laptop screen
  → Banza app opens payment confirmation
  → Donor confirms with PIN

Desktop browser's poll detects USED within 3 s:
  → Success animation
  → Redirect
```

---

## Webhook Acceleration

When `BANZAMI_WEBHOOK_SECRET` is configured, Banza pushes `payment_link.paid` immediately after the link transitions to `USED`. This fires before the next poll tick — the webhook path confirms the payment server-side before the browser even asks.

On the next poll tick, `applyPaymentEvent()` returns `{ deduped: true }` — the event was already recorded by the webhook. The response is still `{ confirmed: true }` and the browser proceeds normally.

**Net effect**: With webhooks enabled, the confirmation latency drops from up to 3 seconds (poll interval) to near-instant (webhook dispatch time + browser poll interval).
