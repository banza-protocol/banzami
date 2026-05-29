# Doa × Banza — Webhooks

Complete reference for Banza webhook integration, including signature verification, payload examples, retry handling, and safe event processing.

---

## Overview

Banza webhooks deliver signed HTTP POST requests to a merchant-registered endpoint when domain events occur. For Doa, the only event type currently handled is `payment_link.paid`, which fires when a donor completes payment in the Banzami app.

Doa's webhook endpoint: `POST /api/webhooks/banzami`

**Relationship to polling**: Webhooks and the browser polling loop (`GET /api/donations/banzami-status`) are complementary, not exclusive. Both paths converge on the same idempotent `applyPaymentEvent()` function. Enabling webhooks eliminates the up-to-3-second polling lag without any risk of double-billing.

---

## Endpoint Registration

Register your endpoint using the Banza API:

```bash
curl -X POST https://api.banzami.org/v1/webhooks/endpoints \
  -H "Authorization: Bearer $BANZAMI_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "url":    "https://doadoa.app/api/webhooks/banzami",
    "events": ["payment_link.paid"]
  }'
```

**Response**:

```json
{
  "id":          "wep_01jqx...",
  "merchant_id": "mer_01jqx...",
  "url":         "https://doadoa.app/api/webhooks/banzami",
  "events":      ["payment_link.paid"],
  "active":      true,
  "secret":      "whsec_ABC...XYZ",
  "created_at":  "2026-05-18T14:30:00.000Z"
}
```

Save `secret` as `BANZAMI_WEBHOOK_SECRET` in your environment. **It is returned only once.** Banza stores only the hash of the secret.

---

## Signature Header

Every Banza webhook includes a `Banza-Signature` header:

```
Banza-Signature: t=1716033007,v1=a1b2c3d4e5f6...
```

| Component | Value | Description |
|-----------|-------|-------------|
| `t` | Unix timestamp (seconds) | Time the signature was computed — used for replay detection |
| `v1` | Hex-encoded HMAC-SHA256 | Signature over `"<t>.<raw_body>"` using the endpoint secret |

**HMAC input format**:

```
"1716033007." + raw_body_bytes
```

The timestamp prefix makes the signature unique per delivery — the same payload sent 10 minutes later produces a different `v1`, preventing replay attacks even if an attacker captures a valid delivery.

---

## Verification Algorithm

```
function verifySignature(secret, header, rawBody):

  1. Parse header:
     t  = int(header.split('t=')[1].split(',')[0])
     v1 = header.split('v1=')[1]

  2. Replay check:
     age = |now_unix - t|
     if age > 300: reject (5-minute window)

  3. Compute expected:
     mac = HMAC-SHA256(key=secret, data="{t}.{rawBody}")
     expected = hex(mac)

  4. Constant-time compare:
     if not timingSafeEqual(expected, v1): reject

  5. Accept
```

**Why constant-time comparison?** Variable-time string comparison (e.g. `===`) leaks timing information that an attacker can use to learn the expected signature one byte at a time. `crypto.timingSafeEqual` runs in constant time regardless of where strings differ.

**Doa implementation** (`app/api/webhooks/banzami/route.ts`):

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

function verifySignature(
  header: string,
  rawBody: string,
): { ok: true } | { ok: false; reason: string } {
  if (!WEBHOOK_SECRET) return { ok: false, reason: 'secret not configured' };

  let ts = 0;
  let v1 = '';
  for (const part of header.split(',')) {
    const eq = part.trim().indexOf('=');
    if (eq === -1) continue;
    const k = part.trim().slice(0, eq);
    const v = part.trim().slice(eq + 1);
    if (k === 't') ts = parseInt(v, 10);
    if (k === 'v1') v1 = v;
  }
  if (!ts || !v1) return { ok: false, reason: 'malformed header' };

  const age = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (age > 300) return { ok: false, reason: 'timestamp outside tolerance window' };

  const mac = createHmac('sha256', WEBHOOK_SECRET);
  mac.update(`${ts}.`);
  mac.update(rawBody);
  const expected = mac.digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(v1, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'signature mismatch' };
  }
  return { ok: true };
}
```

**Critical**: Read the body as raw text before verification:

```typescript
const raw = await req.text();  // ← must be text, NOT req.json()
const verification = verifySignature(sigHeader, raw);
```

Parsing to JSON and re-serializing changes the byte sequence, invalidating the HMAC.

---

## Event Envelope

All Banza webhook payloads follow the same envelope structure:

```json
{
  "id":         "evt_01jqxyzabc123",
  "type":       "payment_link.paid",
  "created_at": "2026-05-18T14:32:07.000Z",
  "data":       { ... }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique event ID — use for deduplication if needed |
| `type` | string | Event type — route based on this |
| `created_at` | ISO 8601 | When Banza generated this event |
| `data` | object | Domain-specific payload (varies by event type) |

---

## `payment_link.paid` Event

Fired when a payment link transitions from `ACTIVE` to `USED`.

**Full payload**:

```json
{
  "id":         "evt_01jqxyzabc123",
  "type":       "payment_link.paid",
  "created_at": "2026-05-18T14:32:07.000Z",
  "data": {
    "id":           "lnk_01jqxyzabc123",
    "slug":         "abc123def",
    "merchant_id":  "mer_01jqx...",
    "wallet_id":    "wlt_01jqx...",
    "amount_minor": 150000,
    "currency":     "AOA",
    "description":  "DOA-A1B2C3D4",
    "status":       "USED",
    "paid_at":      "2026-05-18T14:32:07.000Z",
    "updated_at":   "2026-05-18T14:32:07.000Z"
  }
}
```

**Doa processes this as**:

```typescript
const link = envelope.data;

// Resolve intent_id from the provider_ref stored at checkout
const { data: rows } = await supabase
  .from('donation_events')
  .select('intent_id')
  .eq('event_type', 'payment_initiated')
  .filter('payload->>provider_ref', 'eq', link.id)
  .limit(1);

const intentId = rows?.[0]?.intent_id ?? null;

// Apply to Doa's ledger
await applyPaymentEvent({
  kind:         'confirmed',
  provider_ref: link.id,
  intent_id:    intentId,
  amount:       BigInt(link.amount_minor ?? 0),
  currency:     link.currency,
  paid_at:      new Date(link.paid_at ?? link.updated_at),
});
```

---

## Response Codes

| Status | Banza behavior |
|--------|-----------------|
| `200` | Delivery successful — Banza marks delivery as `success`, no retry |
| `4xx` (except `429`) | Delivery failed — Banza marks as `failed`, retries with backoff |
| `429` | Rate limited — Banza backs off and retries |
| `5xx` | Delivery failed — Banza retries |
| Timeout (>30 s) | Delivery failed — Banza retries |

**Return 200 for unknown event types**: If Doa receives an event type it doesn't handle, return `200 { ok: true, ignored: true }`. Returning a `4xx` for unknown events causes Banza to retry indefinitely.

**Return 5xx to trigger retry**: If `applyPaymentEvent()` fails (database error), Doa returns `500`. Banza will retry. This is correct — it is better to receive the event twice (second call is a no-op) than to lose it.

---

## Retry Policy

Banza retries failed deliveries with exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1 | Immediate |
| 2 | ~30 s |
| 3 | ~5 min |
| 4 | ~30 min |
| 5 | ~2 hours |

After the final attempt, the delivery is marked `failed`. Failed deliveries are visible in the Banza merchant dashboard under **Webhooks → Events → {event_id} → Deliveries**.

**Safe retry handling**: `applyPaymentEvent()` is idempotent on `(intent_id, event_type, provider_ref)`. A second delivery of the same event returns `{ deduped: true }` — no duplicate records, no double receipts, no errors.

---

## Intent Resolution

The webhook payload contains `data.id` (the payment link ID). Doa needs to resolve this to a `donation_intent.id` to call `applyPaymentEvent()`.

**How the mapping is stored at initiation time**:

At checkout, `initiatePayment()` inserts:

```json
{
  "intent_id":  "di_01jqx...",
  "event_type": "payment_initiated",
  "payload": {
    "provider":     "banzami",
    "provider_ref": "lnk_01jqxyzabc123",
    "initiate": { "kind": "inline", "token": "...", "provider_ref": "..." }
  }
}
```

**How Doa resolves it at webhook time**:

```sql
SELECT intent_id
FROM donation_events
WHERE event_type = 'payment_initiated'
  AND payload->>'provider_ref' = 'lnk_01jqxyzabc123'
LIMIT 1;
```

This JSONB filter lookup is efficient because `donation_events.payload` is a JSONB column — PostgreSQL can use a GIN index on the `provider_ref` key for fast lookups in high-volume deployments.

**If no match found**: Return `200 { ok: true, ignored: true }`. The link may have been created outside the Doa donation flow (e.g., directly via the Banza dashboard or a different application using the same merchant account). Returning `4xx` would cause unnecessary retries.

---

## Delivery Tracking

The Banza API lets you inspect delivery history:

```bash
# List events for a merchant
curl "https://api.banzami.org/v1/webhooks/events?merchant_id=mer_01jqx..." \
  -H "Authorization: Bearer $BANZAMI_JWT"

# Inspect delivery attempts for a specific event
curl "https://api.banzami.org/v1/webhooks/events/evt_01jqx.../deliveries" \
  -H "Authorization: Bearer $BANZAMI_JWT"
```

**Delivery statuses**: `pending`, `success`, `failed`.

---

## Local Webhook Testing

Banza cannot reach `localhost`. Use a tunnel:

```bash
# ngrok
ngrok http 3000
# → Forwarding: https://abc.ngrok.io → http://localhost:3000

# cloudflared
cloudflared tunnel --url http://localhost:3000
# → https://xxx.trycloudflare.com → http://localhost:3000
```

Register the tunnel URL as your webhook endpoint:

```bash
curl -X POST https://sandbox-api.banzami.org/v1/webhooks/endpoints \
  -H "Authorization: Bearer $SANDBOX_JWT" \
  -d '{ "url": "https://abc.ngrok.io/api/webhooks/banzami",
         "events": ["payment_link.paid"] }'
```

Save the returned `secret` as `BANZAMI_WEBHOOK_SECRET=whsec_...` in `.env.local` and restart the dev server.

---

## Verifying Your Integration

Manual test sequence:

```bash
# 1. Create a payment link
curl -X POST https://sandbox-api.banzami.org/v1/payment-links \
  -H "Authorization: Bearer $SANDBOX_JWT" \
  -d '{
    "merchant_id":  "...",
    "wallet_id":    "...",
    "amount_minor": 10000,
    "currency":     "AOA"
  }'
# → Note the link id

# 2. Simulate payment (marks link as USED + fires webhook)
curl -X POST https://sandbox-api.banzami.org/v1/payment-links/{id}/mark-used \
  -H "Authorization: Bearer $SANDBOX_JWT"

# 3. Inspect your server logs for:
#    banzami_webhook_received  { type: 'payment_link.paid' }
#    banzami_webhook_ok        { intent_id: '...', deduped: false }
```
