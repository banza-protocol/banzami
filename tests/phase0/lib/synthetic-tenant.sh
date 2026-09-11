#!/usr/bin/env bash
# A tenant of its own for one harness run: a Workspace, a Project with a key, a
# Business with a @banza and a Wallet, bound to the Project — built the way the
# Console's Financial Setup builds them, through the same internal routes.
#
# WHY
#
# Generic harnesses used to borrow DOA's Project and Business: a key on DOA's
# Project, sessions on DOA's wallet, accounts opened in DOA's name. DOA is a
# tenant, not a fixture — every run left demo accounts in its wallet (28 of
# them by 2026-09-11) and made DOA the one tenant every test depended on. A
# harness proving a generic capability now proves it on a tenant nobody else
# uses, which is also the stronger proof: nothing about it can be special.
#
# Everything created is owned by the run (tests/phase0/lib/e2e-run.sh): the key
# is revoked, the project retired, the Business's value retired and its
# accounts closed, and the Business suspended when the run ends.
#
# USE (after e2e_begin)
#
#   . "$(dirname "$0")/lib/synthetic-tenant.sh"
#   synthetic_tenant refund '["refunds:write","payments:read"]' sandbox-default
#   # → ST_PROJECT ST_KEY ST_KEY_ID ST_MERCHANT ST_WALLET ST_PRIMARY ST_HANDLE
#
# The pricing profile is optional; without it the Business has none, exactly
# like a Business an operator has not priced yet.
#
# Secrets are read into memory and never printed.

ST_ACTOR="${ST_ACTOR:-11111111-2222-4333-8444-555555555555}"

# One HTTP call inside a container. Sets ST_CODE and ST_BODY.
st_call() { # container port method path body [header]
  local a=(curl -s -w $'\n%{http_code}' -X "$3" "http://localhost:$2$4")
  [ -n "${6:-}" ] && a+=(-H "$6")
  local r
  if [ "$5" = "-" ]; then r=$(docker exec "$1" "${a[@]}" 2>/dev/null)
  else a+=(-H "Content-Type: application/json" --data @-); r=$(printf '%s' "$5" | docker exec -i "$1" "${a[@]}" 2>/dev/null); fi
  ST_CODE=$(printf '%s' "$r" | tail -n1); ST_BODY=$(printf '%s' "$r" | sed '$d')
}
st_get() { printf '%s' "$ST_BODY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s)[process.argv[1]];process.stdout.write(v==null?"":String(v))}catch(e){}})' "$1"; }
st_fail() { echo "  synthetic_tenant: $1 (HTTP ${ST_CODE:-none}) $(printf '%s' "$ST_BODY" | head -c 160)" >&2; return 1; }

synthetic_tenant() { # label scopes-json [pricing-profile]
  local label="$1" scopes="$2" profile="${3:-}" name root mjwt
  name="e2e-$label-$E2E_SHORT"

  st_call "$E2E_DEV" 8086 POST /internal/v1/fixture-projects \
    "{\"name\":\"$name\",\"created_by\":\"$ST_ACTOR\"}" "X-Internal-Key: $E2E_INTKEY"
  ST_PROJECT=$(st_get project_id); [ -n "$ST_PROJECT" ] || { st_fail "fixture project"; return 1; }
  e2e_own fixture_project "$ST_PROJECT"

  st_call "$E2E_DEV" 8086 POST "/internal/v1/projects/$ST_PROJECT/fixture-keys" \
    "{\"name\":\"$name\",\"scopes\":$scopes,\"created_by\":\"$ST_ACTOR\"}" "X-Internal-Key: $E2E_INTKEY"
  ST_KEY=$(st_get secret); ST_KEY_ID=$(st_get id); [ -n "$ST_KEY" ] || { st_fail "fixture key"; return 1; }
  e2e_own fixture_key "$ST_KEY_ID"

  # The Business, as Financial Setup creates it: its own name and an address at
  # a test domain nobody receives mail on.
  root=$(e2e_jwt merchant_id 00000000-0000-0000-0000-000000000001)
  st_call "$E2E_GW" 8080 POST /v1/merchants \
    "{\"name\":\"Sandbox · $name\",\"email\":\"$name@synthetic.test\"}" "Authorization: Bearer $root"
  ST_MERCHANT=$(st_get id); [ -n "$ST_MERCHANT" ] || { st_fail "business"; return 1; }
  e2e_own merchant "$ST_MERCHANT"
  mjwt=$(e2e_jwt merchant_id "$ST_MERCHANT")
  st_call "$E2E_GW" 8080 POST /v1/wallets '{"currency":"AOA"}' "Authorization: Bearer $mjwt"
  ST_WALLET=$(st_get id); [ -n "$ST_WALLET" ] || { st_fail "wallet"; return 1; }
  ST_PRIMARY=$(e2e_sql "select id from wallet_accounts where wallet_id = '$ST_WALLET' and purpose = 'PRIMARY'")

  # A @banza derived from the project, never chosen, and KYB for Sandbox.
  ST_HANDLE="e2e$(printf '%s' "$ST_PROJECT" | tr -d '-' | cut -c1-10)"
  st_call "$E2E_CORE" 8081 POST /internal/v1/sandbox/business-readiness \
    "{\"merchant_id\":\"$ST_MERCHANT\",\"handle\":\"$ST_HANDLE\"}"
  case "$ST_CODE" in 2*) ;; *) st_fail "business readiness"; return 1 ;; esac
  if [ -n "$profile" ]; then
    st_call "$E2E_CORE" 8081 PUT "/internal/v1/merchants/$ST_MERCHANT/pricing-profile" "{\"profile_code\":\"$profile\"}"
    case "$ST_CODE" in 2*) ;; *) st_fail "pricing profile $profile"; return 1 ;; esac
  fi

  st_call "$E2E_DEV" 8086 POST "/internal/v1/projects/$ST_PROJECT/binding" \
    "{\"merchant_id\":\"$ST_MERCHANT\",\"wallet_id\":\"$ST_WALLET\",\"wallet_account_id\":\"$ST_PRIMARY\",\"actor_user_id\":\"$ST_ACTOR\"}" \
    "X-Internal-Key: $E2E_INTKEY"
  case "$ST_CODE" in 2*) ;; *) st_fail "binding"; return 1 ;; esac
  echo "  synthetic tenant $name: project, key, Business @$ST_HANDLE, wallet — bound"
}
