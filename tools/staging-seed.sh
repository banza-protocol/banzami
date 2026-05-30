#!/usr/bin/env bash
# staging-seed.sh — seed test consumers on the staging / TestFlight sandbox.
#
# Usage:
#   ./tools/staging-seed.sh                      # seed default testers
#   ./tools/staging-seed.sh --reset              # wipe all staging consumers first
#   ./tools/staging-seed.sh --fund @handle       # add 10,000 Kz to an existing account
#   ./tools/staging-seed.sh --list               # list all staging consumers
#   ./tools/staging-seed.sh --delete @handle     # delete a single staging consumer
#   ./tools/staging-seed.sh --inspect @handle    # show transfers for a consumer
#
# Endpoint: https://staging.banzami.com  (or override STAGING_URL)
#
# SAFETY: This script is hardcoded to connect only to banzami_staging.
#         It MUST NEVER run against the production database.

set -euo pipefail

STAGING_URL="${STAGING_URL:-https://staging.banzami.com}"
DEFAULT_PIN="123456"

GREEN='\033[1;32m'; YELLOW='\033[1;33m'; RED='\033[1;31m'; CYAN='\033[1;36m'; RESET='\033[0m'
log()  { printf "${GREEN}[staging]${RESET} %s\n" "$1"; }
warn() { printf "${YELLOW}[staging]${RESET} %s\n" "$1"; }
err()  { printf "${RED}[staging]${RESET} %s\n" "$1" >&2; exit 1; }

for cmd in curl jq; do
  command -v "$cmd" &>/dev/null || err "Missing required tool: $cmd"
done

# ─── register ─────────────────────────────────────────────────────────────────
register_tester() {
  local handle="$1"
  local display_name="$2"

  log "Registering @$handle ($display_name)..."
  local resp
  resp=$(curl -fsS -w '\n%{http_code}' -X POST "$STAGING_URL/v1/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"handle\":\"$handle\",\"display_name\":\"$display_name\",\"pin\":\"$DEFAULT_PIN\"}" 2>&1) || true

  local code body
  code=$(printf '%s' "$resp" | tail -1)
  body=$(printf '%s' "$resp" | head -1)

  if [[ "$code" == "201" ]]; then
    local bal
    bal=$(printf '%s' "$body" | jq -r '.consumer.id // "?"' 2>/dev/null || echo "?")
    log "  Created: @$handle (PIN: $DEFAULT_PIN) — id=$bal"
    log "  Sandbox auto-credit: 10,000 Kz applied on registration"
  elif [[ "$code" == "409" ]]; then
    warn "  @$handle already exists — skipping"
  else
    warn "  @$handle registration returned HTTP $code: $body"
  fi
}

# ─── fund ─────────────────────────────────────────────────────────────────────
fund_tester() {
  local handle="${1#@}"
  log "Funding @$handle with 10,000 Kz..."

  # Login to get token
  local login_resp token
  login_resp=$(curl -fsS -X POST "$STAGING_URL/v1/auth/token" \
    -H "Content-Type: application/json" \
    -d "{\"handle\":\"$handle\",\"pin\":\"$DEFAULT_PIN\"}") || err "Login failed for @$handle"
  token=$(printf '%s' "$login_resp" | jq -r '.token') || err "Could not parse token"

  # Fund
  local fund_resp
  fund_resp=$(curl -fsS -X POST "$STAGING_URL/v1/sandbox/fund" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    -d '{"amount_minor":1000000,"currency":"AOA"}') || err "Fund request failed"

  local new_bal
  new_bal=$(printf '%s' "$fund_resp" | jq -r '.new_balance // "?"')
  log "  New balance: ${new_bal} AOA minor ($(( new_bal / 100 )) Kz)"
}

# ─── list ─────────────────────────────────────────────────────────────────────
list_testers() {
  log "Listing staging consumers..."
  ssh root@217.160.9.248 "docker exec banzami-postgres-1 psql -U banzami -d banzami_staging \
    -c \"SELECT handle, display_name, status, created_at FROM consumers ORDER BY created_at;\"" 2>&1
}

# ─── delete ───────────────────────────────────────────────────────────────────
delete_tester() {
  local handle="${1#@}"
  warn "Deleting @$handle from staging..."
  ssh root@217.160.9.248 "docker exec banzami-postgres-1 psql -U banzami -d banzami_staging -c \"
    DELETE FROM public_api_credentials WHERE consumer_id IN (
      SELECT id FROM consumers WHERE handle = '$handle'
    );
    DELETE FROM consumer_wallets WHERE consumer_id IN (
      SELECT id FROM consumers WHERE handle = '$handle'
    );
    DELETE FROM consumers WHERE handle = '$handle';
  \"" 2>&1
  log "@$handle deleted."
}

# ─── inspect ──────────────────────────────────────────────────────────────────
inspect_tester() {
  local handle="${1#@}"
  log "Inspecting @$handle transfers on staging..."
  ssh root@217.160.9.248 "docker exec banzami-postgres-1 psql -U banzami -d banzami_staging -c \"
    SELECT t.id, t.direction, t.amount_minor, t.currency, t.status, t.created_at,
           s.handle AS sender, r.handle AS recipient
    FROM transfers t
    JOIN consumers s ON s.id = t.sender_id
    JOIN consumers r ON r.id = t.recipient_id
    WHERE s.handle = '$handle' OR r.handle = '$handle'
    ORDER BY t.created_at DESC
    LIMIT 20;
  \"" 2>&1
}

# ─── reset ────────────────────────────────────────────────────────────────────
reset_staging() {
  warn "This will DELETE all staging consumers and wallets. Ctrl+C to cancel."
  sleep 4
  ssh root@217.160.9.248 "docker exec banzami-postgres-1 psql -U banzami -d banzami_staging \
    -c \"TRUNCATE TABLE public_api_credentials, consumer_wallets, consumers RESTART IDENTITY CASCADE;\"" 2>&1
  log "Staging consumers cleared."
}

# ─── main ─────────────────────────────────────────────────────────────────────
case "${1:-seed}" in
  --reset)
    reset_staging
    ;;
  --fund)
    [[ -z "${2:-}" ]] && err "Usage: $0 --fund @handle"
    fund_tester "$2"
    ;;
  --list)
    list_testers
    ;;
  --delete)
    [[ -z "${2:-}" ]] && err "Usage: $0 --delete @handle"
    delete_tester "$2"
    ;;
  --inspect)
    [[ -z "${2:-}" ]] && err "Usage: $0 --inspect @handle"
    inspect_tester "$2"
    ;;
  seed|"")
    printf "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
    printf "${CYAN}  Banzami Staging Seed — TestFlight testers${RESET}\n"
    printf "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n"

    register_tester "fm65"       "Fidel Monteiro"
    register_tester "testuser1"  "Tester Um"
    register_tester "ana"        "Ana"
    register_tester "joao"       "João"
    register_tester "merchant01" "Merchant Teste"

    printf "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
    printf "  Endpoint  %s\n" "$STAGING_URL"
    printf "  PIN       %s  (all testers)\n" "$DEFAULT_PIN"
    printf "  Balance   10,000 Kz each (sandbox — not real money)\n"
    printf "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n"
    ;;
  *)
    err "Unknown command: $1. Use: seed | --reset | --fund @handle | --list | --delete @handle | --inspect @handle"
    ;;
esac
