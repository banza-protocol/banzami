# Doa × Banzami — Complete Payment Flow

Every state, every API call, every failure mode documented end-to-end.

---

## Prerequisites

Before reaching the Banzami payment stage, the donor has:

1. Selected a campaign and amount (Step 1 — client-only state)
2. Entered their identity and contact (Step 2 — client-only state)
3. Created a `donation_intent` with OTP issued (Step 3 — server write)
4. Completed OTP verification (Step 3 — server write: `otp_verified = true`)
5. Selected Banzami as the payment method (Step 4)

The `donation_intent` at this point has:
- `id` — UUID, primary key
- `campaign_id` — the campaign being funded
- `amount` — integer minor units (centavos of AOA)
- `otp_verified = true`
- `payment_status = 'pending'`

---

## Full Sequence

```
Donor browser                    Doa server                     Banzami API
    │                                │                               │
    │  POST /api/donations/           │                               │
    │    initiate-payment            │                               │
    │  {                             │                               │
    │    intent_id: UUID,            │                               │
    │    provider_id: 'banzami',     │                               │
    │    return_url: '...',          │                               │
    │    cancel_url: '...'           │                               │
    │  }                             │                               │
    │ ──────────────────────────────▶│                               │
    │                                │                               │
    │                                │  [validate intent exists,     │
    │                                │   otp_verified, not terminal] │
    │                                │                               │
    │                                │  [check donation_events for   │
    │                                │   existing payment_initiated  │
    │                                │   with provider=banzami →     │
    │                                │   return replay if found]     │
    │                                │                               │
    │                                │  POST /v1/payment-links       │
    │                                │  Authorization: Bearer bz_... │
    │                                │  {                            │
    │                                │    merchant_id: MERCHANT_ID,  │
    │                                │    wallet_id: WALLET_ID,      │
    │                                │    amount_minor: 150000,      │
    │                                │    currency: 'AOA',           │
    │                                │    description: 'DOA-A1B2C3D4'│
    │                                │  }                            │
    │                                │ ─────────────────────────────▶│
    │                                │                               │
    │                                │  HTTP 201                     │
    │                                │  {                            │
    │                                │    id: 'lnk_01jqx...',        │
    │                                │    slug: 'abc123def',          │
    │                                │    merchant_id: '...',         │
    │                                │    wallet_id: '...',           │
    │                                │    amount_minor: 150000,       │
    │                                │    currency: 'AOA',            │
    │                                │    status: 'ACTIVE',           │
    │                                │    expires_at: null,           │
    │                                │    paid_at: null,              │
    │                                │    created_at: '...',          │
    │                                │    updated_at: '...'           │
    │                                │  }                            │
    │                                │ ◀─────────────────────────────│
    │                                │                               │
    │                                │  INSERT donation_events:      │
    │                                │  {                            │
    │                                │    intent_id: UUID,           │
    │                                │    event_type: 'payment_init..│
    │                                │    payload: {                 │
    │                                │      provider: 'banzami',     │
    │                                │      provider_ref: 'lnk_01...'│
    │                                │      initiate: {              │
    │                                │        kind: 'inline',        │
    │                                │        token: payUrl,         │
    │                                │        provider_ref: linkId   │
    │                                │      }                        │
    │                                │    }                          │
    │                                │  }                            │
    │                                │                               │
    │  HTTP 200                      │                               │
    │  {                             │                               │
    │    result: {                   │                               │
    │      kind: 'inline',           │                               │
    │      token: 'https://pay.b...',│                               │
    │      provider_ref: 'lnk_01...' │                               │
    │    }                           │                               │
    │  }                             │                               │
    │ ◀──────────────────────────────│                               │
    │                                │                               │
    │  [stage → 'banzami']           │                               │
    │  [BanzamiPanel mounts]         │                               │
    │  [QR generated from token]     │                               │
    │  [poll loop starts]            │                               │
    │                                │                               │
    │  ┌─────────────── every 3 s ─────────────────────────────────┐ │
    │  │                             │                               │ │
    │  │  GET /api/donations/        │                               │ │
    │  │    banzami-status           │                               │ │
    │  │    ?intent_id=UUID          │                               │ │
    │  │    &link_id=lnk_01...      │                               │ │
    │  │ ───────────────────────────▶│                               │ │
    │  │                             │  GET /v1/payment-links/       │ │
    │  │                             │    lnk_01...                 │ │
    │  │                             │  Authorization: Bearer bz_... │ │
    │  │                             │ ─────────────────────────────▶│ │
    │  │                             │                               │ │
    │  │                             │  { ..., status: 'ACTIVE' }    │ │
    │  │                             │ ◀─────────────────────────────│ │
    │  │                             │                               │ │
    │  │  { confirmed: false }       │                               │ │
    │  │ ◀───────────────────────────│                               │ │
    │  └───────────────────────────────────────────────────────────┘ │
    │                                │                               │
    │  [Donor scans QR with Banza app and confirms payment]        │
    │                                │               Donor pays ────▶│
    │                                │               link → USED     │
    │                                │                               │
    │  GET /api/donations/           │                               │
    │    banzami-status              │                               │
    │ ───────────────────────────────▶│                               │
    │                                │  GET /v1/payment-links/       │
    │                                │    lnk_01...                 │
    │                                │ ─────────────────────────────▶│
    │                                │                               │
    │                                │  {                            │
    │                                │    status: 'USED',            │
    │                                │    amount_minor: 150000,      │
    │                                │    currency: 'AOA',           │
    │                                │    paid_at: '2026-05-18T...',  │
    │                                │    updated_at: '...'          │
    │                                │  }                            │
    │                                │ ◀─────────────────────────────│
    │                                │                               │
    │                                │  applyPaymentEvent({          │
    │                                │    kind: 'confirmed',         │
    │                                │    provider_ref: 'lnk_01...' │
    │                                │    intent_id: UUID,           │
    │                                │    amount: 150000n,           │
    │                                │    currency: 'AOA',           │
    │                                │    paid_at: Date              │
    │                                │  })                           │
    │                                │                               │
    │                                │  INSERT donation_events:      │
    │                                │  event_type: 'payment_confirm'│
    │                                │  payload: { provider_ref,     │
    │                                │    amount, currency, paid_at }│
    │                                │                               │
    │                                │  generateAndDeliverReceipt()  │
    │                                │  revalidatePath('/c/{slug}')  │
    │                                │                               │
    │  { confirmed: true }           │                               │
    │ ◀──────────────────────────────│                               │
    │                                │                               │
    │  [poll loop cleared]           │                               │
    │  [success animation shown]     │                               │
    │  [after 1.2 s: redirect to     │                               │
    │   /c/{slug}/doar/obrigado]     │                               │
```

---

## API Call Reference

### POST /v1/payment-links

Creates a payment link the donor will pay via QR.

**Request**

```
POST https://api.banzami.org/v1/payment-links
Authorization: Bearer <JWT>
Content-Type: application/json
Idempotency-Key: banzami:<intent_id>

{
  "merchant_id":  "mer_01jqx...",
  "wallet_id":    "wlt_01jqx...",
  "amount_minor": 150000,
  "currency":     "AOA",
  "description":  "DOA-A1B2C3D4"
}
```

**Fields**

| Field | Type | Description |
|-------|------|-------------|
| `merchant_id` | string UUID | The Doa merchant account ID |
| `wallet_id` | string UUID | The AOA wallet that will receive funds |
| `amount_minor` | integer | Amount in centavos (150000 = 1,500.00 AOA) |
| `currency` | string | Must be `"AOA"` — Banzami only supports Angolan Kwanza |
| `description` | string | Human-readable label visible in Banzami dashboard; `DOA-{8-char prefix}` embeds a reconciliation key |

**Response — 201 Created**

```json
{
  "id":           "lnk_01jqxyzabc123",
  "slug":         "abc123def",
  "merchant_id":  "mer_01jqx...",
  "wallet_id":    "wlt_01jqx...",
  "amount_minor": 150000,
  "currency":     "AOA",
  "description":  "DOA-A1B2C3D4",
  "status":       "ACTIVE",
  "expires_at":   null,
  "paid_at":      null,
  "created_at":   "2026-05-18T14:30:00.000Z",
  "updated_at":   "2026-05-18T14:30:00.000Z"
}
```

**Key fields**

| Field | Usage in Doa |
|-------|-------------|
| `id` | Stored as `provider_ref` in `donation_events.payment_initiated`; used for all subsequent status checks |
| `slug` | Appended to `BANZAMI_PAY_BASE_URL` to form the QR target URL |
| `status` | `ACTIVE` → link is payable; `USED` → paid; `CANCELLED` → voided; `EXPIRED` → TTL elapsed |

---

### GET /v1/payment-links/{id}

Fetches current link state. Called on every poll tick.

**Request**

```
GET https://api.banzami.org/v1/payment-links/lnk_01jqxyzabc123
Authorization: Bearer <JWT>
```

**Response — while pending**

```json
{
  "id":           "lnk_01jqxyzabc123",
  "slug":         "abc123def",
  "status":       "ACTIVE",
  "amount_minor": 150000,
  "currency":     "AOA",
  "paid_at":      null,
  "updated_at":   "2026-05-18T14:30:00.000Z"
}
```

**Response — after payment**

```json
{
  "id":           "lnk_01jqxyzabc123",
  "slug":         "abc123def",
  "status":       "USED",
  "amount_minor": 150000,
  "currency":     "AOA",
  "paid_at":      "2026-05-18T14:32:07.000Z",
  "updated_at":   "2026-05-18T14:32:07.000Z"
}
```

---

## Failure Modes

### Payment link creation fails (Banzami API error)

**Cause**: Network error, invalid credentials, Banzami API outage.

**Doa behavior**: `BanzamiProvider.initiate()` throws `banzami_api_error:{status}`. `initiatePayment()` returns `{ ok: false, code: 'provider_failed' }`. The API route returns a 500 with `humanError()` converting this to a Portuguese user-facing message. No `donation_events` entry is written.

**Retry**: The donor can retry the payment — idempotency check in `initiatePayment()` will find no existing `payment_initiated` event and try again.

### Poll returns non-200 from Banzami

**Cause**: Transient network error, Banzami API outage.

**Doa behavior**: The poll tick's `fetch()` throws. The `catch` block discards the error silently. The next tick runs 3 seconds later. The link remains valid — Banzami's TTL is independent of poll failures.

### Link expires before payment

**Cause**: Donor leaves the QR panel open for too long without paying; the link's `expires_at` elapses.

**Doa behavior**: The next poll returns `{ status: 'EXPIRED' }`. The poll loop currently treats non-`USED` statuses as `confirmed: false` — the UI stays in the waiting state. **Production improvement needed**: detect `EXPIRED` status and show an explicit error with a "Try again" option that triggers `initiate-payment` again (idempotency key must be fresh for a new link).

### Donor pays and browser is closed

**Cause**: Donor pays in the Banza app but closes the Doa tab before the poll fires.

**Doa behavior**: The poll never runs. If `BANZAMI_WEBHOOK_SECRET` is configured, the webhook fires independently and records `payment_confirmed`. If not, the payment is confirmed in Banzami's system but Doa's ledger has no record.

**Mitigation**: Always configure `BANZAMI_WEBHOOK_SECRET`. The donor can also reload the thank-you page (`/c/{slug}/doar/obrigado?intent={intentId}`) which checks the intent status server-side.

---

## Idempotency Details

### Payment initiation idempotency

Before calling Banzami's API, `initiatePayment()` queries `donation_events` for an existing `payment_initiated` event with `provider = 'banzami'`:

```typescript
const { data: prior } = await supabase
  .from('donation_events')
  .select('payload')
  .eq('intent_id', input.intent_id)
  .eq('event_type', 'payment_initiated')
  .order('created_at', { ascending: false })
  .limit(5);

const replayPayload = (prior ?? []).find((row) => {
  const p = row.payload as { provider?: string; initiate?: PaymentInitiateResult } | null;
  return p?.provider === providerId && p?.initiate;
});

if (replayPayload) {
  return { ok: true, result: p.initiate, replay: true, provider_id: providerId };
}
```

If a replay is found, the existing pay URL and link ID are returned without creating a new Banzami payment link. This means if a donor refreshes the page after seeing the QR, they get the same QR — not a new link with a new charge.

### Confirmation idempotency

`applyPaymentEvent()` runs a dedup query before inserting:

```typescript
const { data: prior } = await supabase
  .from('donation_events')
  .select('id, payload')
  .eq('intent_id', evt.intent_id)
  .eq('event_type', 'payment_confirmed');

const dup = (prior ?? []).some((r) => {
  const p = r.payload as { provider_ref?: string } | null;
  return p?.provider_ref === evt.provider_ref;
});

if (dup) return { ok: true, deduped: true, recorded: evt.kind };
```

The poll loop can fire 50 times against a `USED` link — only the first call writes the event. All others return `{ deduped: true }`, and the UI treats both `confirmed: true` responses identically.
