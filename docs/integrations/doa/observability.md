# Doa × Banzami — Observability

Structured logs, payment tracing, webhook monitoring, and diagnostics for the Banzami integration.

---

## Log Reference

All Banzami-related log events use structured JSON output. Events are keyed by an `action` field for filtering.

### Webhook Events

| Action | Level | When emitted |
|--------|-------|-------------|
| `api.webhooks.banzami` | info | Every inbound webhook request (after routing) |
| `banzami_webhook_rejected` | warn | Signature verification failure |
| `banzami_webhook_ok` | info | Successful processing |
| `banzami_webhook_ignored` | info | Unknown event type or unresolved intent |
| `banzami_webhook_error` | error | `applyPaymentEvent()` threw (DB error) |

### Poll Events

| Action | Level | When emitted |
|--------|-------|-------------|
| `banzami_status_checked` | debug | Each poll tick (high volume — consider sampling) |
| `banzami_status_confirmed` | info | Status changed to USED, `applyPaymentEvent()` called |
| `banzami_status_error` | warn | Banzami API returned non-200 on status check |

### Initiation Events

| Action | Level | When emitted |
|--------|-------|-------------|
| `banzami_initiate_ok` | info | Payment link created successfully |
| `banzami_initiate_replay` | info | Existing link returned (idempotency replay) |
| `banzami_initiate_error` | error | Banzami API call failed |

---

## Structured Log Format

```typescript
// Webhook received
console.log(JSON.stringify({
  action:   'api.webhooks.banzami',
  type:     payload.type,
  event_id: payload.id,
}));

// Webhook OK
console.log(JSON.stringify({
  action:    'banzami_webhook_ok',
  intent_id: intentId,
  deduped:   result.deduped,
  event_id:  payload.id,
}));

// Webhook rejected
console.warn(JSON.stringify({
  action: 'banzami_webhook_rejected',
  reason: verification.reason,
}));

// Status confirmed
console.log(JSON.stringify({
  action:      'banzami_status_confirmed',
  intent_id:   intentId,
  link_id:     linkId,
  deduped:     result.deduped,
}));

// Initiation error
console.error(JSON.stringify({
  action:    'banzami_initiate_error',
  intent_id: input.intent_id,
  error:     err instanceof Error ? err.message : String(err),
}));
```

---

## Correlation Fields

Every log event should include at minimum:

| Field | Type | Purpose |
|-------|------|---------|
| `action` | string | Log event identifier for filtering |
| `intent_id` | string \| null | Doa donation intent — primary correlation key |
| `event_id` | string \| null | Banzami event ID — for cross-system correlation |
| `deduped` | boolean \| null | Whether `applyPaymentEvent()` was a no-op |

Do **not** log:
- API keys or secrets
- Full webhook payloads (contain wallet IDs and amounts — log only fields you need)
- Donor PII (name, phone, email) — use `intent_id` for correlation

---

## Payment Lifecycle Tracing

A successful Banzami payment produces this log sequence:

```
1. banzami_initiate_ok          { intent_id, link_id, sandbox }
2. (poll ticks)                 no log or debug-level only
3. api.webhooks.banzami         { type: 'payment_link.paid', event_id }  ← webhook arrives
4. banzami_webhook_ok           { intent_id, deduped: false }
5. banzami_status_confirmed     { intent_id, deduped: true }             ← poll fires after webhook
```

Or, when polling confirms before webhook:

```
1. banzami_initiate_ok          { intent_id, link_id, sandbox }
2. banzami_status_confirmed     { intent_id, deduped: false }
3. api.webhooks.banzami         { type: 'payment_link.paid', event_id }  ← webhook arrives later
4. banzami_webhook_ok           { intent_id, deduped: true }             ← no-op
```

In both sequences, exactly one `deduped: false` event appears — this is the write that recorded the confirmation. All others are `deduped: true`.

---

## Diagnosing a Payment

Given an `intent_id`, trace the full payment lifecycle:

```sql
-- All events for an intent, newest first
SELECT event_type, created_at, payload
FROM donation_events
WHERE intent_id = 'di_01jqx...'
ORDER BY created_at DESC;
```

Expected rows for a completed Banzami payment:

| event_type | payload highlights |
|------------|--------------------|
| `payment_confirmed` | `provider_ref: "lnk_..."`, `amount`, `paid_at` |
| `payment_initiated` | `provider: "banzami"`, `provider_ref: "lnk_..."` |

Given a Banzami link ID (`lnk_...`):

```sql
-- Resolve intent from provider_ref
SELECT intent_id
FROM donation_events
WHERE event_type = 'payment_initiated'
  AND payload->>'provider_ref' = 'lnk_01jqxyzabc123';
```

---

## Webhook Delivery Inspection

Check Banzami's delivery history for a specific event:

```bash
# List recent webhook events for the merchant
curl "https://api.banzami.org/v1/webhooks/events?merchant_id=mer_01jqx..." \
  -H "Authorization: Bearer $BANZAMI_JWT"

# Inspect delivery attempts for a specific event
curl "https://api.banzami.org/v1/webhooks/events/evt_01jqx.../deliveries" \
  -H "Authorization: Bearer $BANZAMI_JWT"
```

Delivery statuses: `pending`, `success`, `failed`.

A `failed` delivery means Doa returned a non-200 response or timed out. Check Doa's logs for `banzami_webhook_rejected` or `banzami_webhook_error` around the delivery timestamp.

---

## Key Metrics to Track

If Doa has application metrics (e.g., via Prometheus or a hosted APM), instrument these:

| Metric | Type | Labels |
|--------|------|--------|
| `banzami_payment_initiations_total` | Counter | `outcome` (ok, replay, error) |
| `banzami_payment_confirmations_total` | Counter | `path` (poll, webhook), `deduped` (true, false) |
| `banzami_webhook_requests_total` | Counter | `outcome` (ok, rejected, ignored, error) |
| `banzami_poll_latency_seconds` | Histogram | — |
| `banzami_initiation_latency_seconds` | Histogram | — |

**Most important alert**: `banzami_webhook_requests_total{outcome="rejected"}` — if this rises, the webhook secret may be misconfigured or rotated.

---

## Sandbox vs. Production Observability

In sandbox, expect:
- Higher error rates (testing error scenarios)
- `banzami_initiate_ok` with `sandbox: true` in the log

In production:
- `sandbox: true` in any log is a misconfiguration alarm
- A `bz_test_` API key in production causes all payment initiations to fail (`403 SANDBOX_KEY_REJECTED` from Banzami)

Add a startup check:

```typescript
// lib/payments/providers/banzami.ts
if (process.env.NODE_ENV === 'production' && IS_SANDBOX) {
  console.error('CRITICAL: Banzami sandbox key in production environment');
  // Optionally: throw to fail startup
}
```

---

## Local Development Diagnostics

When testing locally with ngrok:

```bash
# 1. Start dev server
pnpm dev

# 2. Start ngrok tunnel
ngrok http 3000

# 3. Watch Doa logs for webhook events
# In the pnpm dev terminal, look for:
# { action: 'api.webhooks.banzami', ... }
# { action: 'banzami_webhook_ok', ... }

# 4. Trigger a test payment
curl -X POST https://sandbox-api.banzami.org/v1/payment-links/{id}/mark-used \
  -H "Authorization: Bearer $SANDBOX_JWT"

# 5. Within seconds, logs should show the webhook
```

If no webhook log appears:
1. Verify the ngrok URL matches the registered endpoint (check Banzami dashboard under **Webhooks → Endpoints**)
2. Verify `BANZAMI_WEBHOOK_SECRET` matches the secret returned at endpoint registration
3. Check the Banzami dashboard under **Webhooks → Events → {event_id} → Deliveries** for delivery status

---

## Request ID Correlation

If Doa assigns request IDs (e.g., via middleware), include the request ID in webhook logs. This allows correlation between the webhook delivery and the ngrok/Vercel access log entry:

```typescript
const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

console.log(JSON.stringify({
  action:     'api.webhooks.banzami',
  request_id: requestId,
  type:       payload.type,
  event_id:   payload.id,
}));
```

Banzami does not currently set a `X-Request-Id` header on webhook deliveries, but the Banzami `id` field (`evt_...`) on the event payload serves as a stable correlation key across Doa logs and the Banzami dashboard.
