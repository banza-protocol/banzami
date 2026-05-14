#!/usr/bin/env bash
# dev.sh — launch the full Banzami stack locally in one command.
#
# Usage:
#   ./dev.sh           Start everything
#   ./dev.sh stop      Kill all background services
#   ./dev.sh logs      Tail all background logs (non-tmux mode)
#
# Requires: docker, sqlx-cli, cargo, go, node
# Optional: tmux  (gives a session with one window per service)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$REPO_ROOT/.dev-logs"
PID_DIR="$LOG_DIR"

# ─── colours ──────────────────────────────────────────────────────────────────
GREEN='\033[1;32m'; YELLOW='\033[1;33m'; RED='\033[1;31m'; RESET='\033[0m'
log()  { printf "${GREEN}[dev]${RESET} %s\n" "$1"; }
warn() { printf "${YELLOW}[dev]${RESET} %s\n" "$1"; }
err()  { printf "${RED}[dev]${RESET} %s\n" "$1" >&2; }

# ─── stop subcommand ──────────────────────────────────────────────────────────
if [[ "${1:-}" == "stop" ]]; then
  if command -v tmux &>/dev/null && tmux has-session -t banzami 2>/dev/null; then
    tmux kill-session -t banzami
    log "tmux session 'banzami' killed."
  fi
  for pid_file in "$PID_DIR"/*.pid; do
    [[ -f "$pid_file" ]] || continue
    pid=$(cat "$pid_file")
    name=$(basename "$pid_file" .pid)
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" && log "Stopped $name (PID $pid)"
    fi
    rm -f "$pid_file"
  done
  log "Infrastructure still running. To stop it: make dev-down"
  exit 0
fi

# ─── logs subcommand ──────────────────────────────────────────────────────────
if [[ "${1:-}" == "logs" ]]; then
  [[ -d "$LOG_DIR" ]] || { err "No logs yet — run ./dev.sh first."; exit 1; }
  exec tail -f "$LOG_DIR"/*.log
fi

# ─── preflight ────────────────────────────────────────────────────────────────
[[ -f "$REPO_ROOT/.env" ]] || {
  err ".env not found. Run:  cp .env.example .env  and fill in the required values."
  exit 1
}

for cmd in docker sqlx cargo go node npm; do
  command -v "$cmd" &>/dev/null || { err "Required tool not found: $cmd"; exit 1; }
done

# Load .env so we can validate required vars
set -a; source "$REPO_ROOT/.env"; set +a

: "${JWT_SECRET:?JWT_SECRET is not set in .env}"
: "${ADMIN_API_KEY:?ADMIN_API_KEY is not set in .env}"
: "${TRANSIT_ACCOUNT_ID:?TRANSIT_ACCOUNT_ID is not set in .env}"
: "${BANK_ACCOUNT_ID:?BANK_ACCOUNT_ID is not set in .env}"

mkdir -p "$LOG_DIR"

# ─── infrastructure ───────────────────────────────────────────────────────────
log "Starting PostgreSQL and Redis..."
make -C "$REPO_ROOT" dev-up

log "Applying migrations..."
make -C "$REPO_ROOT" db-migrate

# ─── npm install (if needed) ──────────────────────────────────────────────────
for app in dashboard admin pay; do
  app_dir="$REPO_ROOT/apps/$app"
  if [[ -f "$app_dir/package.json" && ! -d "$app_dir/node_modules" ]]; then
    log "Installing npm dependencies for apps/$app..."
    (cd "$app_dir" && npm install --silent)
  fi
done

# ─── tmux mode ────────────────────────────────────────────────────────────────
if command -v tmux &>/dev/null; then
  SESSION="banzami"
  tmux kill-session -t "$SESSION" 2>/dev/null || true

  # Window 1: core-api (Rust — starts first; others wait for its health check)
  tmux new-session  -d -s "$SESSION" -n "core-api"    \
    "cd '$REPO_ROOT/core'                    && cargo run --bin core-api;   read -p '[press enter]'"

  log "Waiting for core-api to be ready (may take a minute on first compile)..."
  for i in $(seq 1 90); do
    curl -fsS http://localhost:8081/health &>/dev/null && break
    [[ $i -eq 90 ]] && { err "core-api did not start. Check the core-api window for errors."; exit 1; }
    sleep 2
  done
  log "core-api ready."

  # Window 2-4: Go services
  tmux new-window -t "$SESSION" -n "api-gateway"  \
    "cd '$REPO_ROOT/services/api-gateway'    && go run ./cmd/gateway;       read -p '[press enter]'"
  tmux new-window -t "$SESSION" -n "admin-api"    \
    "cd '$REPO_ROOT/services/admin-api'      && go run ./cmd/admin;         read -p '[press enter]'"
  tmux new-window -t "$SESSION" -n "public-api"   \
    "cd '$REPO_ROOT/services/public-api'     && go run ./cmd/public-api;    read -p '[press enter]'"

  # Window 5-7: Next.js apps
  tmux new-window -t "$SESSION" -n "dashboard"    \
    "cd '$REPO_ROOT/apps/dashboard'          && npm run dev;                 read -p '[press enter]'"
  tmux new-window -t "$SESSION" -n "admin-app"    \
    "cd '$REPO_ROOT/apps/admin'              && npm run dev;                 read -p '[press enter]'"
  tmux new-window -t "$SESSION" -n "pay"          \
    "cd '$REPO_ROOT/apps/pay'                && npm run dev;                 read -p '[press enter]'"

  tmux select-window -t "$SESSION:core-api"

  printf "\n"
  log "tmux session 'banzami' ready. Attaching...\n"
  printf "  Switch windows:  Ctrl-b  then  n / p  (next / previous)\n"
  printf "  Detach:          Ctrl-b  then  d\n"
  printf "  Stop everything: ./dev.sh stop\n\n"

  tmux attach-session -t "$SESSION"
  exit 0
fi

# ─── background mode (no tmux) ────────────────────────────────────────────────
warn "tmux not found — running all services in background."
warn "Logs: .dev-logs/    PIDs: .dev-logs/*.pid"

# core-api first
log "Starting core-api..."
(cd "$REPO_ROOT/core" && cargo run --bin core-api) >"$LOG_DIR/core-api.log" 2>&1 &
echo $! >"$PID_DIR/core-api.pid"

log "Waiting for core-api to be ready (may take a minute on first compile)..."
for i in $(seq 1 90); do
  curl -fsS http://localhost:8081/health &>/dev/null && break
  [[ $i -eq 90 ]] && { err "core-api did not start. See .dev-logs/core-api.log"; exit 1; }
  sleep 2
done
log "core-api ready."

# Go services
declare -A GO_SERVICES=(
  [api-gateway]="services/api-gateway:./cmd/gateway"
  [admin-api]="services/admin-api:./cmd/admin"
  [public-api]="services/public-api:./cmd/public-api"
)
for svc in api-gateway admin-api public-api; do
  spec="${GO_SERVICES[$svc]}"
  dir="${spec%%:*}"
  entrypoint="${spec##*:}"
  log "Starting $svc..."
  (cd "$REPO_ROOT/$dir" && go run "$entrypoint") >"$LOG_DIR/$svc.log" 2>&1 &
  echo $! >"$PID_DIR/$svc.pid"
done

# Next.js apps
for app in dashboard admin pay; do
  log "Starting apps/$app..."
  (cd "$REPO_ROOT/apps/$app" && npm run dev) >"$LOG_DIR/app-$app.log" 2>&1 &
  echo $! >"$PID_DIR/app-$app.pid"
done

printf "\n"
log "All services started."
printf "\n"
printf "  core-api     →  http://localhost:8081\n"
printf "  api-gateway  →  http://localhost:8080\n"
printf "  admin-api    →  http://localhost:8082\n"
printf "  public-api   →  http://localhost:8083\n"
printf "  dashboard    →  http://localhost:3001\n"
printf "  admin-app    →  http://localhost:3002\n"
printf "  pay          →  http://localhost:3003\n"
printf "\n"
printf "  Tail logs:       ./dev.sh logs\n"
printf "  Stop everything: ./dev.sh stop\n\n"
