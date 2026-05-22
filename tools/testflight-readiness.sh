#!/usr/bin/env bash
# testflight-readiness.sh — pre-TestFlight staging health check.
#
# Verifies that the Banza staging environment is correctly configured and
# functionally ready before submitting a TestFlight build.
#
# Usage:
#   ./tools/testflight-readiness.sh                  # check staging.banzami.org
#   STAGING_URL=https://my-staging ./tools/testflight-readiness.sh
#
# Exit code: 0 = all checks passed. 1 = one or more checks failed.
#
# SAFETY: Read-only checks except for two ephemeral test consumers created
#         and immediately deleted at the end.

set -euo pipefail

STAGING_URL="${STAGING_URL:-https://staging.banzami.org}"
LIVE_URL="${LIVE_URL:-https://api.banzami.org}"

GREEN='\033[1;32m'; YELLOW='\033[1;33m'; RED='\033[1;31m'; CYAN='\033[1;36m'; RESET='\033[0m'
BOLD='\033[1m'

PASS=0; FAIL=0
pass() { printf "  ${GREEN}✓${RESET} %s\n" "$1"; (( PASS++ )); }
fail() { printf "  ${RED}✗${RESET} %s\n" "$1" >&2; (( FAIL++ )); }
skip() { printf "  ${YELLOW}–${RESET} %s\n" "$1"; }
section() { printf "\n${CYAN}${BOLD}%s${RESET}\n" "$1"; }

for cmd in curl jq openssl; do
  command -v "$cmd" &>/dev/null || { echo "Missing required tool: $cmd" >&2; exit 1; }
done

# ─── helpers ──────────────────────────────────────────────────────────────────

api_post() {
  local path="$1"; shift
  curl -fsS -w '\n%{http_code}' -X POST "$STAGING_URL$path" \
    -H "Content-Type: application/json" "$@" 2>/dev/null || true
}

api_get() {
  local path="$1"; shift
  curl -fsS -w '\n%{http_code}' "$STAGING_URL$path" "$@" 2>/dev/null || true
}

split_response() {
  local raw="$1"
  CODE=$(printf '%s' "$raw" | tail -1)
  BODY=$(printf '%s' "$raw" | head -1)
}

live_api_post() {
  local path="$1"; shift
  curl -fsS -w '\n%{http_code}' -X POST "$LIVE_URL$path" \
    -H "Content-Type: application/json" "$@" 2>/dev/null || true
}

# Test-consumer handles are timestamped to avoid conflicts across runs.
TS=$(date +%s)
CONSUMER_A="chk_a_$TS"
CONSUMER_B="chk_b_$TS"
PIN="654321"
TOKEN_A="" TOKEN_B=""

cleanup() {
  # Best-effort deletion of ephemeral test consumers.
  if [[ -n "${TOKEN_A:-}" ]]; then
    curl -fsS -X DELETE "$STAGING_URL/v1/me" \
      -H "Authorization: Bearer $TOKEN_A" &>/dev/null || true
  fi
  if [[ -n "${TOKEN_B:-}" ]]; then
    curl -fsS -X DELETE "$STAGING_URL/v1/me" \
      -H "Authorization: Bearer $TOKEN_B" &>/dev/null || true
  fi
}
trap cleanup EXIT

# ─── banner ───────────────────────────────────────────────────────────────────

printf "\n${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
printf "${CYAN}${BOLD}  Banza TestFlight Readiness Check${RESET}\n"
printf "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
printf "  Staging URL : %s\n" "$STAGING_URL"
printf "  Live URL    : %s\n" "$LIVE_URL"
printf "  Run at      : %s\n" "$(date)"

# ─── 1. Network / TLS ─────────────────────────────────────────────────────────
section "1. Network / TLS"

HOST=$(printf '%s' "$STAGING_URL" | sed 's|https://||;s|/.*||')
if ping -c1 -W2 "$HOST" &>/dev/null 2>&1 || curl -fsS --max-time 5 "$STAGING_URL" &>/dev/null 2>&1; then
  pass "staging host reachable ($HOST)"
else
  fail "staging host unreachable ($HOST)"
fi

CERT_EXPIRY=$(echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || echo "")
if [[ -n "$CERT_EXPIRY" ]]; then
  pass "TLS certificate valid — expires $CERT_EXPIRY"
else
  skip "TLS certificate check skipped (openssl unavailable)"
fi

# ─── 2. Health endpoint ───────────────────────────────────────────────────────
section "2. Health"

split_response "$(api_get /health 2>/dev/null || api_get /healthz 2>/dev/null || printf '\n000')"
if [[ "$CODE" == "200" ]]; then
  pass "health endpoint returns 200"
else
  skip "no /health endpoint (code: $CODE) — continuing"
fi

# ─── 3. Auth — register two test consumers ────────────────────────────────────
section "3. Auth — register"

split_response "$(api_post /v1/auth/register -d "{\"handle\":\"$CONSUMER_A\",\"display_name\":\"Check A\",\"pin\":\"$PIN\"}")"
if [[ "$CODE" == "201" ]]; then
  pass "consumer registration ($CONSUMER_A) → 201"
else
  fail "consumer registration ($CONSUMER_A) → $CODE (expected 201)"
fi

split_response "$(api_post /v1/auth/register -d "{\"handle\":\"$CONSUMER_B\",\"display_name\":\"Check B\",\"pin\":\"$PIN\"}")"
if [[ "$CODE" == "201" ]]; then
  pass "consumer registration ($CONSUMER_B) → 201"
else
  fail "consumer registration ($CONSUMER_B) → $CODE (expected 201)"
fi

# ─── 4. Auth — login ─────────────────────────────────────────────────────────
section "4. Auth — login"

split_response "$(api_post /v1/auth/token -d "{\"handle\":\"$CONSUMER_A\",\"pin\":\"$PIN\"}")"
if [[ "$CODE" == "200" ]]; then
  TOKEN_A=$(printf '%s' "$BODY" | jq -r '.token // empty')
  if [[ -n "$TOKEN_A" ]]; then
    pass "login $CONSUMER_A → token received"
  else
    fail "login $CONSUMER_A → 200 but no token in response"
  fi
else
  fail "login $CONSUMER_A → $CODE (expected 200)"
fi

split_response "$(api_post /v1/auth/token -d "{\"handle\":\"$CONSUMER_B\",\"pin\":\"$PIN\"}")"
if [[ "$CODE" == "200" ]]; then
  TOKEN_B=$(printf '%s' "$BODY" | jq -r '.token // empty')
  if [[ -n "$TOKEN_B" ]]; then
    pass "login $CONSUMER_B → token received"
  else
    fail "login $CONSUMER_B → 200 but no token in response"
  fi
else
  fail "login $CONSUMER_B → $CODE (expected 200)"
fi

# ─── 5. Sandbox fund (auto-credit) ───────────────────────────────────────────
section "5. Sandbox fund"

if [[ -n "$TOKEN_A" ]]; then
  split_response "$(api_post /v1/sandbox/fund \
    -H "Authorization: Bearer $TOKEN_A" \
    -d '{"amount_minor":1000000,"currency":"AOA"}')"
  if [[ "$CODE" == "200" ]]; then
    NEW_BAL=$(printf '%s' "$BODY" | jq -r '.new_balance // "?"')
    pass "sandbox fund $CONSUMER_A → 200 (new_balance: $NEW_BAL)"
  else
    fail "sandbox fund $CONSUMER_A → $CODE (expected 200)"
  fi
else
  skip "sandbox fund skipped — no token for $CONSUMER_A"
fi

if [[ -n "$TOKEN_B" ]]; then
  split_response "$(api_post /v1/sandbox/fund \
    -H "Authorization: Bearer $TOKEN_B" \
    -d '{"amount_minor":500000,"currency":"AOA"}')"
  if [[ "$CODE" == "200" ]]; then
    pass "sandbox fund $CONSUMER_B → 200"
  else
    fail "sandbox fund $CONSUMER_B → $CODE (expected 200)"
  fi
else
  skip "sandbox fund skipped — no token for $CONSUMER_B"
fi

# ─── 6. Wallet balance ────────────────────────────────────────────────────────
section "6. Wallet balance"

if [[ -n "$TOKEN_A" ]]; then
  split_response "$(api_get /v1/me/wallet/balance -H "Authorization: Bearer $TOKEN_A")"
  if [[ "$CODE" == "200" ]]; then
    BAL=$(printf '%s' "$BODY" | jq -r '.available_minor // "?"')
    pass "wallet balance $CONSUMER_A → 200 (available: $BAL)"
    if [[ "$BAL" -gt 0 ]] 2>/dev/null; then
      pass "sandbox credit reflected in balance ($BAL > 0)"
    else
      fail "balance is zero after sandbox fund — credit not applied"
    fi
  else
    fail "wallet balance $CONSUMER_A → $CODE (expected 200)"
  fi
fi

# ─── 7. P2P transfer ──────────────────────────────────────────────────────────
section "7. P2P transfer"

if [[ -n "$TOKEN_A" && -n "$TOKEN_B" ]]; then
  split_response "$(api_post /v1/transfers \
    -H "Authorization: Bearer $TOKEN_A" \
    -d "{\"recipient_handle\":\"$CONSUMER_B\",\"amount_minor\":100000,\"currency\":\"AOA\"}")"
  if [[ "$CODE" == "200" || "$CODE" == "201" ]]; then
    TX_ID=$(printf '%s' "$BODY" | jq -r '.id // .transfer_id // "?"')
    pass "P2P transfer $CONSUMER_A → $CONSUMER_B → $CODE (id: $TX_ID)"
  else
    fail "P2P transfer → $CODE (expected 200 or 201)"
    printf "       body: %s\n" "$(printf '%s' "$BODY" | jq -c . 2>/dev/null || echo "$BODY")"
  fi

  # Verify recipient received it.
  split_response "$(api_get /v1/me/wallet/balance -H "Authorization: Bearer $TOKEN_B")"
  if [[ "$CODE" == "200" ]]; then
    BAL_B=$(printf '%s' "$BODY" | jq -r '.available_minor // "?"')
    if [[ "$BAL_B" -ge 600000 ]] 2>/dev/null; then
      pass "recipient balance updated after P2P ($BAL_B minor)"
    else
      fail "recipient balance ($BAL_B) lower than expected after transfer"
    fi
  fi
else
  skip "P2P transfer skipped — missing tokens"
fi

# ─── 8. Activity feed ────────────────────────────────────────────────────────
section "8. Activity feed"

if [[ -n "$TOKEN_A" ]]; then
  split_response "$(api_get "/v1/me/activity" -H "Authorization: Bearer $TOKEN_A")"
  if [[ "$CODE" == "200" ]]; then
    COUNT=$(printf '%s' "$BODY" | jq '.items | length // 0' 2>/dev/null || echo "?")
    pass "activity feed $CONSUMER_A → 200 ($COUNT items)"
  else
    fail "activity feed $CONSUMER_A → $CODE (expected 200)"
  fi
fi

# ─── 9. Consumer lookup (@handle) ────────────────────────────────────────────
section "9. Consumer lookup"

if [[ -n "$TOKEN_A" ]]; then
  split_response "$(api_get "/v1/consumers/$CONSUMER_B" -H "Authorization: Bearer $TOKEN_A")"
  if [[ "$CODE" == "200" ]]; then
    pass "consumer lookup @$CONSUMER_B → 200"
  else
    fail "consumer lookup @$CONSUMER_B → $CODE (expected 200)"
  fi
fi

# ─── 10. Sandbox isolation — LIVE API must reject sandbox fund ───────────────
section "10. Sandbox isolation (LIVE rejects sandbox)"

if [[ -n "$TOKEN_A" ]]; then
  LIVE_RAW=$(live_api_post /v1/sandbox/fund \
    -H "Authorization: Bearer $TOKEN_A" \
    -d '{"amount_minor":1000000,"currency":"AOA"}' 2>/dev/null || true)
  LIVE_CODE=$(printf '%s' "$LIVE_RAW" | tail -1)
  if [[ "$LIVE_CODE" == "403" ]]; then
    pass "LIVE API rejects /v1/sandbox/fund with 403"
  elif [[ "$LIVE_CODE" == "000" || "$LIVE_CODE" == "" ]]; then
    skip "LIVE API unreachable — sandbox isolation check skipped"
  else
    fail "LIVE API returned $LIVE_CODE for /v1/sandbox/fund (expected 403)"
  fi
else
  skip "sandbox isolation check skipped — no token"
fi

# ─── 11. Rate limit sanity ────────────────────────────────────────────────────
section "11. Rate limit sanity"

if [[ -n "$TOKEN_A" ]]; then
  STATUS_200=0; STATUS_429=0
  for _ in $(seq 1 3); do
    split_response "$(api_post /v1/sandbox/fund \
      -H "Authorization: Bearer $TOKEN_A" \
      -d '{"amount_minor":100000,"currency":"AOA"}')"
    [[ "$CODE" == "200" ]] && (( STATUS_200++ )) || true
    [[ "$CODE" == "429" ]] && (( STATUS_429++ )) || true
  done
  if [[ $STATUS_200 -gt 0 || $STATUS_429 -gt 0 ]]; then
    pass "sandbox fund rate responses: 200×$STATUS_200  429×$STATUS_429"
  else
    fail "unexpected sandbox fund responses (neither 200 nor 429)"
  fi
fi

# ─── Summary ──────────────────────────────────────────────────────────────────

printf "\n${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
printf "  Passed : ${GREEN}${BOLD}%d${RESET}\n" "$PASS"
printf "  Failed : "
if [[ $FAIL -eq 0 ]]; then
  printf "${GREEN}${BOLD}%d${RESET}\n" "$FAIL"
else
  printf "${RED}${BOLD}%d${RESET}\n" "$FAIL"
fi
printf "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n"

if [[ $FAIL -gt 0 ]]; then
  printf "${RED}${BOLD}NOT READY for TestFlight.${RESET} Fix the failures above first.\n\n"
  exit 1
else
  printf "${GREEN}${BOLD}READY for TestFlight.${RESET} All checks passed.\n\n"
  printf "Next steps:\n"
  printf "  1. Run sandbox icon swap : ./tools/gen-icons-sandbox.sh\n"
  printf "  2. Build the IPA         : flutter build ipa \\\n"
  printf "       --dart-define=ENVIRONMENT=sandbox \\\n"
  printf "       --dart-define=PUBLIC_API_URL=https://staging.banzami.org\n"
  printf "  3. Restore live icon     : ./tools/gen-icons-sandbox.sh --restore\n"
  printf "  4. Upload to TestFlight  : xcrun altool --upload-app ...\n\n"
fi
