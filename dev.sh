#!/usr/bin/env bash
# dev.sh — launch the full Banzami stack in a tmux session.
#
# Usage:
#   ./dev.sh           Start everything (tmux session: banzami)
#   ./dev.sh stop      Kill all services and the tmux session
#
# Prerequisites: docker, sqlx-cli, cargo, go, node, npm, tmux
# Install tmux:  brew install tmux  (macOS)  |  sudo apt install tmux  (Debian/Ubuntu)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION="banzami"

# ─── colours ──────────────────────────────────────────────────────────────────
GREEN='\033[1;32m'; YELLOW='\033[1;33m'; RED='\033[1;31m'; RESET='\033[0m'
log()  { printf "${GREEN}[dev]${RESET} %s\n" "$1"; }
warn() { printf "${YELLOW}[dev]${RESET} %s\n" "$1"; }
err()  { printf "${RED}[dev]${RESET} %s\n" "$1" >&2; }

# ─── stop subcommand ──────────────────────────────────────────────────────────
if [[ "${1:-}" == "stop" ]]; then
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux kill-session -t "$SESSION"
    log "tmux session '$SESSION' killed."
  else
    warn "No active session '$SESSION'."
  fi
  log "Infrastructure (PostgreSQL + Redis) still running. To stop: make dev-down"
  exit 0
fi

# ─── preflight checks ─────────────────────────────────────────────────────────
missing=()
for cmd in docker sqlx cargo go node npm tmux; do
  command -v "$cmd" &>/dev/null || missing+=("$cmd")
done

if [[ ${#missing[@]} -gt 0 ]]; then
  err "Missing required tools: ${missing[*]}"
  printf "\n  Install tmux:\n"
  printf "    macOS:          brew install tmux\n"
  printf "    Debian/Ubuntu:  sudo apt install tmux\n"
  printf "    Arch:           sudo pacman -S tmux\n\n"
  exit 1
fi

# ─── .env bootstrap ───────────────────────────────────────────────────────────
if [[ ! -f "$REPO_ROOT/.env" ]]; then
  warn ".env not found — copying from .env.example..."
  cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
fi

# Load current .env
set -a; source "$REPO_ROOT/.env"; set +a

# Auto-generate any missing secrets so the developer never has to do this by hand.
_env_set() {
  local key="$1" value="$2"
  # Update the key in-place whether the line exists (empty or missing value) or not.
  if grep -q "^${key}=" "$REPO_ROOT/.env"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$REPO_ROOT/.env" && rm -f "$REPO_ROOT/.env.bak"
  else
    printf "\n%s=%s\n" "$key" "$value" >> "$REPO_ROOT/.env"
  fi
  # Export into current shell so the rest of the script can use it immediately.
  export "${key}=${value}"
}

generated=()

if [[ -z "${JWT_SECRET:-}" ]]; then
  _env_set JWT_SECRET "$(openssl rand -hex 32)"
  generated+=("JWT_SECRET")
fi
if [[ -z "${ADMIN_API_KEY:-}" ]]; then
  _env_set ADMIN_API_KEY "$(openssl rand -hex 32)"
  generated+=("ADMIN_API_KEY")
fi
if [[ -z "${TRANSIT_ACCOUNT_ID:-}" ]]; then
  _env_set TRANSIT_ACCOUNT_ID "$(uuidgen | tr '[:upper:]' '[:lower:]')"
  generated+=("TRANSIT_ACCOUNT_ID")
fi
if [[ -z "${BANK_ACCOUNT_ID:-}" ]]; then
  _env_set BANK_ACCOUNT_ID "$(uuidgen | tr '[:upper:]' '[:lower:]')"
  generated+=("BANK_ACCOUNT_ID")
fi

if [[ ${#generated[@]} -gt 0 ]]; then
  warn "Generated and saved to .env: ${generated[*]}"
fi

# ─── infrastructure ───────────────────────────────────────────────────────────
log "Starting PostgreSQL and Redis..."
make -C "$REPO_ROOT" dev-up

log "Applying migrations..."
make -C "$REPO_ROOT" db-migrate

# ─── npm install (if node_modules missing) ────────────────────────────────────
for app in dashboard admin pay; do
  app_dir="$REPO_ROOT/apps/$app"
  if [[ -f "$app_dir/package.json" && ! -d "$app_dir/node_modules" ]]; then
    log "Installing npm dependencies for apps/$app..."
    (cd "$app_dir" && npm install --silent)
  fi
done

# ─── tmux session ─────────────────────────────────────────────────────────────
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Window 1 — core-api (Rust)
# Starts first; other Go services are launched only after its health check passes.
tmux new-session -d -s "$SESSION" -n "core-api" \
  "cd '$REPO_ROOT/core' && cargo run --bin core-api; read -rp '[press enter to close]'"

log "Waiting for core-api (first compile may take ~2 min)..."
for i in $(seq 1 90); do
  curl -fsS http://localhost:8081/health &>/dev/null && break
  [[ $i -eq 90 ]] && {
    err "core-api did not become healthy. Switch to the 'core-api' window to see errors."
    tmux attach-session -t "$SESSION"
    exit 1
  }
  sleep 2
done
log "core-api ready."

# Window 2 — api-gateway (Go, :8080)
tmux new-window -t "$SESSION" -n "api-gateway" \
  "cd '$REPO_ROOT/services/api-gateway' && go run ./cmd/gateway; read -rp '[press enter to close]'"

# Window 3 — admin-api (Go, :8082)
tmux new-window -t "$SESSION" -n "admin-api" \
  "cd '$REPO_ROOT/services/admin-api' && go run ./cmd/admin; read -rp '[press enter to close]'"

# Window 4 — public-api (Go, :8083)
tmux new-window -t "$SESSION" -n "public-api" \
  "cd '$REPO_ROOT/services/public-api' && go run ./cmd/public-api; read -rp '[press enter to close]'"

# Window 5 — dashboard (Next.js, :3001)
tmux new-window -t "$SESSION" -n "dashboard" \
  "cd '$REPO_ROOT/apps/dashboard' && npm run dev; read -rp '[press enter to close]'"

# Window 6 — admin app (Next.js, :3002)
tmux new-window -t "$SESSION" -n "admin-app" \
  "cd '$REPO_ROOT/apps/admin' && npm run dev; read -rp '[press enter to close]'"

# Window 7 — pay page (Next.js, :3003)
tmux new-window -t "$SESSION" -n "pay" \
  "cd '$REPO_ROOT/apps/pay' && npm run dev; read -rp '[press enter to close]'"

# Focus on core-api window before attaching
tmux select-window -t "$SESSION:core-api"

printf "\n"
log "Session '$SESSION' ready — attaching."
printf "\n"
printf "  Windows:       core-api  api-gateway  admin-api  public-api\n"
printf "                 dashboard  admin-app  pay\n"
printf "\n"
printf "  Navigate:      Ctrl-b n   next window\n"
printf "                 Ctrl-b p   previous window\n"
printf "                 Ctrl-b w   window list\n"
printf "  Detach:        Ctrl-b d   (session keeps running)\n"
printf "  Re-attach:     tmux attach -t banzami\n"
printf "  Stop all:      ./dev.sh stop\n"
printf "\n"
printf "  core-api     →  http://localhost:8081\n"
printf "  api-gateway  →  http://localhost:8080\n"
printf "  admin-api    →  http://localhost:8082\n"
printf "  public-api   →  http://localhost:8083\n"
printf "  dashboard    →  http://localhost:3001\n"
printf "  admin-app    →  http://localhost:3002\n"
printf "  pay          →  http://localhost:3003\n"
printf "\n"

tmux attach-session -t "$SESSION"
