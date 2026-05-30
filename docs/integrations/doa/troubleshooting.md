# Doa × Banza — Troubleshooting

Diagnostic guide for common integration problems. Each section describes symptoms, root cause, and resolution steps.

---

## Webhook Issues

### `banzami_webhook_rejected: signature mismatch`

**Symptom**: Webhook requests arrive but all return 401. Banza dashboard shows deliveries with `failed` status. Doa logs contain `banzami_webhook_rejected { reason: 'signature mismatch' }`.

**Root causes**:

1. **Wrong secret**: `BANZAMI_WEBHOOK_SECRET` does not match the secret returned when the endpoint was registered. The secret is returned only once — if lost, a new endpoint must be registered.

2. **Parsed body instead of raw body**: The webhook handler is reading `req.json()` before verification rather than `req.text()`. JSON parsing changes the byte sequence.

3. **Body read twice**: A middleware is consuming the request body before the webhook handler reads it, leaving an empty string for HMAC computation.

**Resolution**:

```bash
# Verify secret is set in the production environment
echo $BANZAMI_WEBHOOK_SECRET  # should start with whsec_

# If secret is wrong or lost, register a new endpoint
curl -X POST https://api.banzami.com/v1/webhooks/endpoints \
  -H "Authorization: Bearer $BANZAMI_JWT" \
  -d '{ "url": "https://doadoa.app/api/webhooks/banzami", "events": ["payment_link.paid"] }'
# Deactivate old endpoint in Banzami dashboard
# Update BANZAMI_WEBHOOK_SECRET with new value
# Redeploy
```

---

### `banzami_webhook_rejected: timestamp outside tolerance window`

**Symptom**: Some webhooks fail with `reason: 'timestamp outside tolerance window'`. Doa logs show `age` > 300 seconds.

**Root causes**:

1. **Server clock skew**: Doa's server clock is significantly out of sync with real time. NTP sync may have failed.

2. **Replay attempt**: An attacker (or a misconfigured test script) is replaying captured webhook payloads.

3. **Banza retry delivered late**: Unlikely — Banza retries use fresh signatures, not the original timestamp.

**Resolution**:

```bash
# Check server time
date -u  # should be within a few seconds of actual UTC

# Sync NTP (Linux)
timedatectl status
timedatectl set-ntp true
```

For Vercel or hosted environments, clock sync is managed by the platform — contact support if time drift is observed.

---

### `banzami_webhook_rejected: secret not configured`

**Symptom**: All webhook requests return 500. Doa logs contain `banzami_webhook_rejected { reason: 'secret not configured' }`. Banza treats 500 as a failed delivery and retries.

**Root cause**: `BANZAMI_WEBHOOK_SECRET` is not set in the server environment, or the environment variable was not loaded after being added.

**Resolution**:

1. Set `BANZAMI_WEBHOOK_SECRET=whsec_...` in the environment
2. Restart or redeploy the server
3. Verify with a test delivery from the Banza dashboard

---

### Webhooks arrive but intent is not resolved (`banzami_webhook_ignored`)

**Symptom**: Webhook processing succeeds (returns 200) but logs show `banzami_webhook_ignored`. No `payment_confirmed` event in `donation_events`.

**Root cause**: The `donation_events` table has no `payment_initiated` row where `payload->>'provider_ref' = link.id`. The webhook is for a payment link not created through the Doa donation flow.

**Possible causes**:
- Payment link was created directly via the Banza API or dashboard (not through Doa)
- The Doa server is in sandbox mode but the webhook is from a live payment, or vice versa
- The `payment_initiated` event was never written (Banza API call succeeded but the Doa DB write failed before the row was committed)

**Diagnosis**:

```sql
-- Check if the link is in donation_events
SELECT * FROM donation_events
WHERE payload->>'provider_ref' = 'lnk_01jqxyzabc123';

-- If no rows: check if the intent was created at all
SELECT * FROM donation_intents
WHERE id = 'di_01jqx...';
```

**Resolution**: If the `payment_initiated` row is missing, the donation intent is in a broken state. The donor should retry the payment — a new `initiatePayment()` call will create a new payment link and write the corresponding event.

---

### Webhook delivered but payment not confirmed in UI

**Symptom**: Banza dashboard shows webhook delivery as `success`. No `payment_confirmed` event in Doa's database. The donor's browser still shows the waiting state.

**Root cause**: `applyPaymentEvent()` threw an error after webhook verification. Doa returned 500, causing Banza to show the delivery as failed — but if you see `success`, the handler returned 200 without writing the event.

**Diagnosis**: Check Doa logs for `banzami_webhook_error` with a stack trace. Common cause: database connection error or constraint violation.

**Resolution**: Fix the underlying error. If the delivery is already marked `success` by Banza, trigger a manual status check via the poll endpoint or use the Banza dashboard to re-deliver the event (if available).

---

## QR and Payment Issues

### QR code doesn't appear (infinite spinner)

**Symptom**: `BanzamiPanel` renders but the QR image never appears — only the spinner.

**Root causes**:

1. **`qrcode` dynamic import failed**: Network error loading the npm package (unlikely in production, possible in restricted environments).

2. **`payUrl` is empty or malformed**: `QRCode.toDataURL('')` or an invalid URL causes the promise to reject silently.

3. **JavaScript error in `useEffect`**: An unhandled error in the effect prevents `setQrSrc` from being called.

**Diagnosis**:

```typescript
// Check browser console for errors
// Check that payUrl is set correctly:
console.log('payUrl:', payUrl);  // should be https://pay.banzami.com/{slug}
```

**Resolution**: Verify `BANZAMI_PAY_BASE_URL` and that the payment link response includes a `slug`. The external link ("Ou abre o link de pagamento") is always present as a fallback — donors can complete payment even without the QR.

---

### SANDBOX badge visible in production

**Symptom**: The amber "SANDBOX" badge appears on the Banza panel in the production environment.

**Root cause**: `BANZAMI_API_KEY` starts with `bz_test_` in the production environment.

**Resolution**:

1. Confirm which API key is set: check the environment variable (do not log it — check it in the secrets manager or via a startup log that only shows the first few characters)
2. Replace with the live key (`bz_live_...`)
3. Restart or redeploy

No payments made with a `bz_test_` key in production are real — they go to sandbox. The Banza live gateway rejects `bz_test_` keys outright (`403 SANDBOX_KEY_REJECTED`), so payment initiation fails.

---

### Donor pays but poll never detects USED

**Symptom**: The Banza consumer app shows payment as successful. The Doa waiting screen never advances. No `payment_confirmed` event in the database.

**Root causes**:

1. **Webhooks not configured**: Without `BANZAMI_WEBHOOK_SECRET`, the push confirmation path is inactive. The poll path should still work — if it doesn't, check the poll endpoint.

2. **Poll endpoint returning errors**: The status check route is returning non-200, causing the browser to silently skip ticks.

3. **Banza link ID mismatch**: The `link_id` passed to the poll endpoint doesn't match the link that was paid.

**Diagnosis**:

```bash
# Test the poll endpoint manually
curl "https://doadoa.app/api/donations/banzami-status?intent_id=di_01jqx...&link_id=lnk_01jqx..."
# Expected after payment: { "confirmed": true }
# Expected before payment: { "confirmed": false }
```

```bash
# Verify the link status in Banzami directly
curl "https://api.banzami.com/v1/payment-links/lnk_01jqx..." \
  -H "Authorization: Bearer $BANZAMI_JWT"
# Look for: "status": "USED"
```

**Resolution**: If the link is `USED` in Banza but the poll returns `{ confirmed: false }`, the status check route is likely broken. Check logs for errors in `banzami-status/route.ts`.

---

### `applyPaymentEvent()` creates duplicate records

**Symptom**: Multiple `payment_confirmed` rows in `donation_events` for the same `intent_id`.

**Root cause**: The dedup check is failing. This would be a bug in `applyPaymentEvent()` — most likely, the dedup query is checking against the wrong `provider_ref`.

**Diagnosis**:

```sql
SELECT id, created_at, payload
FROM donation_events
WHERE intent_id = 'di_01jqx...'
  AND event_type = 'payment_confirmed'
ORDER BY created_at;
```

If multiple rows exist with the same `payload->>'provider_ref'`, the dedup logic is broken. If rows exist with different `provider_ref` values, multiple payment links were paid (unusual but possible if the same intent was initiated twice under different link IDs).

---

## Configuration Issues

### Payment initiation fails with `provider_failed`

**Symptom**: Donor selects Banza, clicks pay, gets an error message. `initiate-payment` route returns 500. Doa logs show `banzami_initiate_error`.

**Common causes**:

| Error from Banza | Likely cause |
|--------------------|-------------|
| `401 Unauthorized` | Wrong API key or expired JWT |
| `403 SANDBOX_KEY_REJECTED` | `bz_test_` key used against live gateway |
| `403 LIVE_ONLY` | `bz_live_` key used against sandbox gateway |
| `422 Unprocessable` | Invalid `merchant_id`, `wallet_id`, or `amount_minor` |
| `Network error` | `BANZAMI_GATEWAY_URL` is not set or unreachable |

**Diagnosis**:

```bash
# Verify environment variables are set
echo $BANZAMI_GATEWAY_URL
echo $BANZAMI_MERCHANT_ID
echo $BANZAMI_WALLET_ID
# Do NOT echo BANZAMI_API_KEY in logs — just check it exists

# Test authentication manually
curl -X POST $BANZAMI_GATEWAY_URL/v1/auth/token \
  -H "Content-Type: application/json" \
  -d "{\"api_key\": \"$BANZAMI_API_KEY\"}"
```

---

### Banza method not appearing in payment method picker

**Symptom**: The donor's method picker does not show Banza as an option.

**Root causes**:

1. `banzami` not in `PAYMENT_PROVIDERS` environment variable
2. `BanzamiProvider.available` is `false` — one or more required env vars is missing
3. `BANZAMI_API_KEY` is empty or unset

**Diagnosis**: `available` is `false` when any of `GATEWAY_URL`, `API_KEY`, `MERCHANT_ID`, or `WALLET_ID` is missing. Check all four variables are set.

---

## Sandbox/Live Environment Mismatch

### Banzami app shows payment but Doa doesn't confirm

**Symptom**: The Banza consumer app shows the payment was completed. Doa's polling loop never advances. The link appears as `ACTIVE` in Banza's API.

**Root cause**: The donor paid with a Banzami app connected to the live network, but the QR encodes a sandbox pay URL, or vice versa. Environment-isolated links can only be paid from the matching environment.

**Resolution**: Ensure the Banzami app environment matches the API key:
- `bz_test_` key → only sandbox Banzami apps can pay the link
- `bz_live_` key → only live Banzami apps can pay the link

This should never happen in production (all keys are live). It's common during development when testing with a live Banza account against sandbox links.

---

## Getting Further Help

For integration issues not covered here:

1. **Check Banza dashboard** → Webhooks → Events for delivery status and response codes
2. **Check Doa server logs** for structured log events with `action: 'banzami_*'`
3. **Query `donation_events`** directly to inspect the event sequence for an intent
4. **Verify environment variables** match the expected prefix (`bz_test_` vs `bz_live_`)

For Banza API issues (authentication errors, 5xx responses from Banza, incorrect link behavior), contact Banza support with the relevant `event_id` from the Banza dashboard.
