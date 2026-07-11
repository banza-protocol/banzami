#!/usr/bin/env sh
# Banzami Sandbox — create a payment session (placeholders only).
# Idempotency-Key lets you retry safely: the original response is replayed
# for the same key for 24 hours; concurrent same-key requests get 409 CONFLICT.
curl -X POST https://sandbox-api.banzami.com/v1/business/payment-sessions \
  -H "Authorization: Bearer bz_test_sk_XXXX" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem_xxx" \
  -d @../fixtures/create-payment-session.request.json
