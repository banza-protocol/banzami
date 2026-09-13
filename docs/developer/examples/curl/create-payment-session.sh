#!/usr/bin/env sh
# DIAGNOSTIC / PROTOCOL REFERENCE EXAMPLE — not the recommended integration
# path. Banzami is SDK-first; direct HTTP is secondary (diagnostics, audits,
# controlled testing, advanced integrators).
# Banzami Sandbox — create a payment session (placeholders only).
# Idempotency-Key lets you retry safely: the original response is replayed
# for the same key for 24 hours; concurrent same-key requests get 409
# IDEMPOTENCY_CONFLICT, and the same key with a different body 409 IDEMPOTENCY_KEY_REUSED.
curl -X POST https://sandbox-api.banzami.com/v1/payment-sessions \
  -H "Authorization: Bearer bz_test_sk_XXXX" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem_xxx" \
  -d @../fixtures/create-payment-session.request.json
