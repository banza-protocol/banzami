#!/usr/bin/env bash
# Correct a Developer project's Sandbox payee binding — runs ON the Sandbox VM.
#
# A project resolves its payee through its ACTIVE binding (ADR-047). Binding was
# a one-way door until now: the create path conflicts on the one-ACTIVE-per-
# project index and nothing ever disabled a binding, so a project bound to the
# wrong merchant stayed bound to it. DOA sat in that state, resolving an E2E
# fixture instead of @doa.
#
# This calls the supported internal route with supersede=true. It is NOT a
# bypass: Core still validates the new payee, and a SEALED binding (one with a
# payment artifact under it) is refused — correcting a mistake before money
# moved is not the same as reattributing money that already did.
#
#   PROJECT_ID=… MERCHANT_ID=… WALLET_ID=… WALLET_ACCOUNT_ID=… \
#     bash tools/ops/rebind-sandbox-project.sh
#
#   ACTOR   — the operator user id recorded in the audit event.
set -uo pipefail
: "${PROJECT_ID:?PROJECT_ID required}"
: "${MERCHANT_ID:?MERCHANT_ID required}"
: "${WALLET_ID:?WALLET_ID required}"
: "${WALLET_ACCOUNT_ID:?WALLET_ACCOUNT_ID required}"
ACTOR="${ACTOR:-11111111-2222-4333-8444-555555555555}"

DEV=$(docker ps --format '{{.Names}}' | grep developer-api | head -1)
[ -n "$DEV" ] || { echo "developer-api container not found"; exit 1; }
DEVINT=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key 2>/dev/null')
[ -n "$DEVINT" ] || { echo "internal key unavailable"; exit 1; }

printf '%s' "{\"merchant_id\":\"$MERCHANT_ID\",\"wallet_id\":\"$WALLET_ID\",\"wallet_account_id\":\"$WALLET_ACCOUNT_ID\",\"actor_user_id\":\"$ACTOR\",\"supersede\":true}" \
  | docker exec -i "$DEV" curl -s -w $'\n%{http_code}' -X POST \
      "http://localhost:8086/internal/v1/projects/$PROJECT_ID/binding" \
      -H "X-Internal-Key: $DEVINT" -H 'Content-Type: application/json' --data @-
