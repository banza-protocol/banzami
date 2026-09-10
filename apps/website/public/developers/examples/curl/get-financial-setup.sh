#!/usr/bin/env sh
# DIAGNOSTIC / PROTOCOL REFERENCE EXAMPLE — not the recommended integration
# path. Banzami is SDK-first (getFinancialSetup()); direct HTTP is secondary.
# Banzami Sandbox — can this Project settle, and if not, what is missing?
# The key is the authority: nothing in the request names a Project or account.
# Placeholder key only: replace bz_test_sk_XXXX with YOUR Sandbox test key.
curl https://sandbox-api.banzami.com/v1/financial-setup \
  -H "Authorization: Bearer bz_test_sk_XXXX"
