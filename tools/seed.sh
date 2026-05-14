#!/usr/bin/env bash
# seed.sh — create a test merchant, API key, and wallet for local development.
#
# Usage:
#   ./tools/seed.sh                        Create with defaults
#   ./tools/seed.sh "Minha Loja" me@ao.ao  Custom name and email
#
# Prerequisite: core-api must be running on http://localhost:8081

set -euo pipefail

CORE_API="${CORE_API_URL:-http://localhost:8081}"
NAME="${1:-Loja Teste}"
EMAIL="${2:-loja@banzami.ao}"
CURRENCY="${3:-AOA}"

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

# ─── create merchant ─────────────────────────────────────────────────────────
log "Creating merchant: '$NAME' <$EMAIL>..."
MERCHANT=$(curl -fsS -X POST "$CORE_API/internal/v1/merchants" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$NAME\",\"email\":\"$EMAIL\"}" \
  2>&1) || err "Failed to create merchant. Already exists? Try a different email."

MERCHANT_ID=$(echo "$MERCHANT" | jq -r '.id')
[[ -z "$MERCHANT_ID" || "$MERCHANT_ID" == "null" ]] && err "Unexpected response: $MERCHANT"
log "Merchant created: $MERCHANT_ID"

# ─── create API key ───────────────────────────────────────────────────────────
log "Creating API key..."
KEY_RESPONSE=$(curl -fsS -X POST "$CORE_API/internal/v1/merchants/$MERCHANT_ID/api-keys" \
  -H "Content-Type: application/json" \
  -d '{"name":"dev"}')

RAW_KEY=$(echo "$KEY_RESPONSE" | jq -r '.raw_key')
[[ -z "$RAW_KEY" || "$RAW_KEY" == "null" ]] && err "Failed to get raw_key. Response: $KEY_RESPONSE"
log "API key created."

# ─── create wallet ────────────────────────────────────────────────────────────
log "Creating $CURRENCY wallet..."
WALLET=$(curl -fsS -X POST "$CORE_API/internal/v1/wallets" \
  -H "Content-Type: application/json" \
  -d "{\"merchant_id\":\"$MERCHANT_ID\",\"currency\":\"$CURRENCY\"}")

WALLET_ID=$(echo "$WALLET" | jq -r '.id')
[[ -z "$WALLET_ID" || "$WALLET_ID" == "null" ]] && err "Failed to create wallet. Response: $WALLET"
log "Wallet created: $WALLET_ID"

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
