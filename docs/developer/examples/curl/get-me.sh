#!/usr/bin/env sh
# Banzami Sandbox — first successful call (no SDK required).
# Placeholder key only: replace bz_test_sk_XXXX with YOUR Sandbox test key.
# Sandbox-only: no real money ever moves.
curl https://sandbox-api.banzami.com/v1/me \
  -H "Authorization: Bearer bz_test_sk_XXXX"
