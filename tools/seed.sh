#!/usr/bin/env bash
# seed.sh — create a test merchant, API key, and wallet for local development.
#
# Usage:
#   ./tools/seed.sh                           Create new merchant with defaults
#   ./tools/seed.sh "Minha Loja" me@ao.ao     Create new merchant (custom)
#   ./tools/seed.sh --merchant-id <uuid>       Create new API key + wallet for existing merchant
#
# Prerequisite: core-api must be running on http://localhost:8081

set -euo pipefail

CORE_API="${CORE_API_URL:-http://localhost:8081}"
CURRENCY="AOA"

GREEN='\033[1;32m'; YELLOW='\033[1;33m'; RED='\033[1;31m'; CYAN='\033[1;36m'; RESET='\033[0m'
log()  { printf "${GREEN}[seed]${RESET} %s\n" "$1"; }
warn() { printf "${YELLOW}[seed]${RESET} %s\n" "$1"; }
err()  { printf "${RED}[seed]${RESET} %s\n" "$1" >&2; exit 1; }

# ─── check dependencies ───────────────────────────────────────────────────────
for cmd in curl jq; do
  command -v "$cmd" &>/dev/null || err "Missing required tool: $cmd (brew install $cmd)"
done

# ─── wait for core-api ───────────────────────────────────────────────────────
log "Checking core-api at $CORE_API..."
for i in $(seq 1 10); do
  curl -fsS "$CORE_API/health" &>/dev/null && break
  [[ $i -eq 10 ]] && err "core-api is not reachable. Run ./dev.sh first."
  sleep 1
done

# ─── mode: existing merchant or new ───────────────────────────────────────────
if [[ "${1:-}" == "--merchant-id" ]]; then
  # ── existing merchant: just create a new API key + wallet ──────────────────
  [[ -z "${2:-}" ]] && err "Usage: ./tools/seed.sh --merchant-id <uuid>"
  MERCHANT_ID="$2"

  log "Fetching merchant $MERCHANT_ID..."
  MERCHANT=$(curl -fsS "$CORE_API/internal/v1/merchants/$MERCHANT_ID") \
    || err "Merchant not found: $MERCHANT_ID"
  NAME=$(echo "$MERCHANT" | jq -r '.name')
  EMAIL=$(echo "$MERCHANT" | jq -r '.email')
  [[ -z "$NAME" || "$NAME" == "null" ]] && err "Could not fetch merchant. Check the ID."
  log "Found merchant: '$NAME' <$EMAIL>"

else
  # ── new merchant ────────────────────────────────────────────────────────────
  NAME="${1:-Loja Teste}"
  EMAIL="${2:-loja@banzami.com}"

  log "Creating merchant: '$NAME' <$EMAIL>..."
  RESP=$(curl -fsS -w '\n%{http_code}' -X POST "$CORE_API/internal/v1/merchants" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$NAME\",\"email\":\"$EMAIL\"}")

  HTTP_CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | head -1)

  if [[ "$HTTP_CODE" == "409" ]]; then
    err "Email '$EMAIL' already registered. Use a different email or run:
       ./tools/seed.sh --merchant-id <uuid>"
  elif [[ "$HTTP_CODE" != "201" ]]; then
    err "Failed to create merchant (HTTP $HTTP_CODE): $BODY"
  fi

  MERCHANT_ID=$(echo "$BODY" | jq -r '.id')
  [[ -z "$MERCHANT_ID" || "$MERCHANT_ID" == "null" ]] && err "Unexpected response: $BODY"
  log "Merchant created: $MERCHANT_ID"
fi

# ─── create API key ───────────────────────────────────────────────────────────
log "Creating API key..."
KEY_RESPONSE=$(curl -fsS -X POST "$CORE_API/internal/v1/merchants/$MERCHANT_ID/api-keys" \
  -H "Content-Type: application/json" \
  -d '{"name":"dev"}')

RAW_KEY=$(echo "$KEY_RESPONSE" | jq -r '.secret')
[[ -z "$RAW_KEY" || "$RAW_KEY" == "null" ]] && err "Failed to get secret. Response: $KEY_RESPONSE"
log "API key created."

# ─── create wallet (skip if already exists) ───────────────────────────────────
log "Creating $CURRENCY wallet..."
WALLET_RESP=$(curl -fsS -w '\n%{http_code}' -X POST "$CORE_API/internal/v1/wallets" \
  -H "Content-Type: application/json" \
  -d "{\"merchant_id\":\"$MERCHANT_ID\",\"currency\":\"$CURRENCY\"}")

WALLET_CODE=$(echo "$WALLET_RESP" | tail -1)
WALLET_BODY=$(echo "$WALLET_RESP" | head -1)

if [[ "$WALLET_CODE" == "201" ]]; then
  WALLET_ID=$(echo "$WALLET_BODY" | jq -r '.id')
  log "Wallet created: $WALLET_ID"
elif [[ "$WALLET_CODE" == "409" ]]; then
  # Wallet already exists — fetch it
  WALLET_BODY=$(curl -fsS "$CORE_API/internal/v1/wallets?merchant_id=$MERCHANT_ID&currency=$CURRENCY")
  WALLET_ID=$(echo "$WALLET_BODY" | jq -r '.id')
  warn "Wallet already exists: $WALLET_ID"
else
  err "Failed to create wallet (HTTP $WALLET_CODE): $WALLET_BODY"
fi

[[ -z "$WALLET_ID" || "$WALLET_ID" == "null" ]] && WALLET_ID="(não criada)"

# ─── print credentials ────────────────────────────────────────────────────────
printf "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
printf "${CYAN}  Banzami Dev Credentials${RESET}\n"
printf "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n"
printf "  Merchant          %s\n" "$NAME"
printf "  Email             %s\n" "$EMAIL"
printf "  Currency          %s\n\n" "$CURRENCY"
printf "  ${GREEN}Merchant ID${RESET}       %s\n" "$MERCHANT_ID"
printf "  ${GREEN}API Key${RESET}           %s\n" "$RAW_KEY"
printf "  ${GREEN}Wallet ID${RESET}         %s\n\n" "$WALLET_ID"
printf "  Dashboard (merchant)\n"
printf "    URL             http://localhost:3010/login\n"
printf "    Gateway URL     http://localhost:8080\n"
printf "    API Key         %s\n" "$RAW_KEY"
printf "    Merchant ID     %s\n" "$MERCHANT_ID"
printf "    Wallet ID       %s  (opcional)\n\n" "$WALLET_ID"
printf "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
printf "  ${YELLOW}Guarda a API Key — não volta a ser mostrada.${RESET}\n"
printf "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n"
