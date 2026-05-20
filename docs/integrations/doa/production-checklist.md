# Doa × Banzami — Production Checklist

Complete checklist for going live with the Banzami payment method. Work through each section in order.

---

## 1. Credentials and Environment

- [ ] **Replace sandbox key with live key**
  - `BANZAMI_API_KEY=bz_live_...`
  - Verify the prefix starts with `bz_live_` — not `bz_test_`

- [ ] **Point to live gateway**
  - `BANZAMI_GATEWAY_URL=https://api.banzami.org`
  - Previously: `https://sandbox-api.banzami.org`

- [ ] **Set production merchant and wallet IDs**
  - `BANZAMI_MERCHANT_ID=mer_...` (your live merchant UUID)
  - `BANZAMI_WALLET_ID=wlt_...` (your live AOA wallet UUID)

- [ ] **Verify pay page base URL**
  - `BANZAMI_PAY_BASE_URL=https://pay.banzami.org`
  - This is the same domain for both environments — verify the value is set

- [ ] **Enable Banzami in method list**
  - `PAYMENT_PROVIDERS=stripe,bank-transfer,banzami` (or your current set)

---

## 2. Webhook Setup

- [ ] **Register production webhook endpoint**

  ```bash
  curl -X POST https://api.banzami.org/v1/webhooks/endpoints \
    -H "Authorization: Bearer $LIVE_JWT" \
    -H "Content-Type: application/json" \
    -d '{
      "url":    "https://doadoa.app/api/webhooks/banzami",
      "events": ["payment_link.paid"]
    }'
  ```

  The response contains a `secret` field. **This is returned only once.**

- [ ] **Store the secret**
  - `BANZAMI_WEBHOOK_SECRET=whsec_...`
  - Added to production environment variables (Vercel env, secrets manager, etc.)
  - Never committed to the repository

- [ ] **Verify webhook is active**
  - Check Banzami dashboard → **Webhooks → Endpoints**
  - Status should show as `active`

---

## 3. Security Verification

- [ ] **SANDBOX badge is gone**
  - Open a campaign donation flow
  - Select Banzami as payment method
  - Confirm NO amber "SANDBOX" badge appears in the payment panel
  - If badge appears, `BANZAMI_API_KEY` still starts with `bz_test_`

- [ ] **Webhook signature verification is active**
  - `BANZAMI_WEBHOOK_SECRET` is set in production environment
  - Server has been restarted / redeployed after setting the variable

- [ ] **Credentials are NOT in the repository**
  - `grep -r "bz_live_" .` returns no results outside `.env*` files
  - `grep -r "whsec_" .` returns no results outside `.env*` files

- [ ] **HTTPS enforced**
  - Doa's production URL starts with `https://`
  - The registered webhook URL starts with `https://`

---

## 4. End-to-End Test

Perform a real end-to-end test with a small amount (e.g., 100 AOA = 10,000 centavos) before enabling for all donors.

- [ ] **Create a test donation intent**
  - Go through the full Doa donation flow on the production URL
  - Select Banzami
  - Confirm the QR code renders correctly
  - Confirm the pay URL format is `https://pay.banzami.org/{slug}` (not the sandbox domain)

- [ ] **Complete the payment in the Banzami consumer app**
  - Scan the QR with a real Banzami account
  - Confirm the app shows the correct amount and merchant name ("Banza Business")
  - Complete with PIN or biometrics

- [ ] **Verify confirmation in Doa**
  - Browser shows the success animation within 3 seconds of payment
  - Redirects to the thank-you page
  - Thank-you page shows the correct donation amount

- [ ] **Verify receipt delivery**
  - Donor receives SMS or email receipt (depending on Doa's receipt configuration)
  - Receipt shows the correct amount and campaign

- [ ] **Verify webhook was delivered**
  - Check Banzami dashboard → **Webhooks → Events** for `payment_link.paid`
  - Delivery status should show `success`

- [ ] **Verify database record**
  - `donation_events` contains `payment_initiated` and `payment_confirmed` rows
  - `payment_confirmed.payload.provider_ref` matches the Banzami link ID
  - `payment_confirmed.payload.amount` matches the donation amount in centavos

---

## 5. Observability

- [ ] **Logs contain Banzami events**
  - `banzami_initiate_ok` logged at initiation
  - `api.webhooks.banzami` and `banzami_webhook_ok` logged at confirmation

- [ ] **No `CRITICAL: Banzami sandbox key in production` log line**
  - If the startup check fires, fix the API key before going live

- [ ] **Webhook rejection rate is zero**
  - No `banzami_webhook_rejected` log lines for legitimate payments
  - If rejections appear, verify `BANZAMI_WEBHOOK_SECRET` matches the registered endpoint's secret

---

## 6. Operational Readiness

- [ ] **Sandbox endpoints deactivated (optional)**
  - Deactivate sandbox webhook endpoints in the Banzami dashboard to prevent noise
  - This is optional — sandbox and live webhooks are delivered to separate endpoints

- [ ] **Runbook exists for payment failures**
  - Team knows how to check Banzami dashboard for delivery status
  - Team knows how to manually trigger a webhook re-delivery if needed

- [ ] **Webhook secret rotation procedure documented**
  - Procedure: register new endpoint → deactivate old endpoint → update secret → redeploy

---

## 7. Rollout

- [ ] **Enable Banzami in `PAYMENT_PROVIDERS`** if it was disabled during preparation
- [ ] **Monitor error rates** for the first 30 minutes after enablement
- [ ] **Verify donations are appearing in the Banzami merchant dashboard** with correct amounts
- [ ] **Confirm balance increases in the Banzami wallet** after successful payments

---

## Post-Launch Verification (Day 1)

- [ ] At least one real donation completed end-to-end via Banzami
- [ ] No unexpected webhook failures in Banzami dashboard
- [ ] No `banzami_webhook_rejected` log events (excluding test deliveries)
- [ ] Donation amounts in Doa's database match Banzami dashboard balances
- [ ] Receipt delivery working for Banzami-confirmed donations

---

## Known Production Improvements (Not Blockers)

These items are documented in [qr-payments.md](qr-payments.md) and [payment-flow.md](payment-flow.md) — they improve the UX but are not required for a correct production launch:

- **Expired link handling**: Detect `EXPIRED` status in the poll endpoint and return `{ confirmed: false, expired: true }`. Show a retry UI with a new QR.
- **Browser-closed recovery**: When a donor pays and closes the tab, the confirmation is recorded by webhook but the donor doesn't see the thank-you page. The thank-you page checks intent status server-side on load — verify this flow works in production.
- **Shared JWT cache**: Cache the Banzami JWT (55-minute TTL in Redis) to avoid re-authenticating on every poll tick. Required at scale; acceptable to skip for initial launch.
