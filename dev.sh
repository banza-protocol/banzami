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
  # Kill any service processes still holding the ports (cargo/go survive tmux kill).
  for port in 8081 8080 8082 8083 3001 3002 3003; do
    pid=$(lsof -ti:"$port" 2>/dev/null || true)
    if [[ -n "$pid" ]]; then
      kill -9 $pid 2>/dev/null || true
      log "Killed process on port $port (PID $pid)."
    fi
  done
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
sleep 0.5

# ── Window 0: split layout ──────────────────────────────────────────────────
# Load project tmux config (enables mouse, scrollback, styling).
TMUX_CONF="$REPO_ROOT/.tmux.conf"
# Left column  : status pane (full height)
# Right column : 4 backend service panes stacked vertically
#
#  ┌──────────────┬──────────────────┐
#  │              │    core-api      │
#  │   STATUS     ├──────────────────┤
#  │              │    api-gateway   │
#  │              ├──────────────────┤
#  │              │    admin-api     │
#  │              ├──────────────────┤
#  │              │    public-api    │
#  └──────────────┴──────────────────┘

tmux -f "$TMUX_CONF" new-session -d -s "$SESSION" -n "banzami"

# Capture the status pane ID (left column, full height)
STATUS=$(tmux display-message -p -t "$SESSION:banzami" '#{pane_id}')

# Split right column at 65% width — core-api top pane
tmux split-window -t "${STATUS}" -h -p 65
CORE=$(tmux display-message -p -t "$SESSION:banzami" '#{pane_id}')

# Split core pane down — api-gateway (core keeps top 25%)
tmux split-window -t "${CORE}" -v -p 75
GATEWAY=$(tmux display-message -p -t "$SESSION:banzami" '#{pane_id}')

# Split gateway pane down — admin-api (gateway keeps 33% of remaining)
tmux split-window -t "${GATEWAY}" -v -p 67
ADMIN=$(tmux display-message -p -t "$SESSION:banzami" '#{pane_id}')

# Split admin pane down — public-api (equal halves)
tmux split-window -t "${ADMIN}" -v -p 50
PUBLIC=$(tmux display-message -p -t "$SESSION:banzami" '#{pane_id}')

# ── Windows 1-3: Next.js apps ────────────────────────────────────────────────
tmux new-window -t "$SESSION:1" -n "dashboard" \
  "cd '$REPO_ROOT/apps/dashboard' && npm run dev; exec $SHELL"
tmux new-window -t "$SESSION:2" -n "admin-app" \
  "cd '$REPO_ROOT/apps/admin' && npm run dev; exec $SHELL"
tmux new-window -t "$SESSION:3" -n "pay" \
  "cd '$REPO_ROOT/apps/pay' && npm run dev; exec $SHELL"

# Go back to main window before starting services
tmux select-window -t "$SESSION:banzami"

# ── Start core-api and wait for health ───────────────────────────────────────
tmux send-keys -t "${CORE}" "cd '$REPO_ROOT/core' && cargo run --bin core-api" Enter

log "Waiting for core-api (first compile may take ~2 min)..."
for i in $(seq 1 90); do
  curl -fsS http://localhost:8081/health &>/dev/null && break
  [[ $i -eq 90 ]] && {
    err "core-api did not become healthy. Check the top-right pane for errors."
    tmux select-pane -t "${CORE}"
    tmux attach-session -t "$SESSION"
    exit 1
  }
  sleep 2
done
log "core-api ready."

# ── Start Go services ─────────────────────────────────────────────────────────
tmux send-keys -t "${GATEWAY}" "cd '$REPO_ROOT/services/api-gateway' && go run ./cmd/gateway" Enter
tmux send-keys -t "${ADMIN}"   "cd '$REPO_ROOT/services/admin-api'   && go run ./cmd/admin"   Enter
tmux send-keys -t "${PUBLIC}"  "cd '$REPO_ROOT/services/public-api'  && go run ./cmd/public-api" Enter

# ── Populate status pane (left column) ───────────────────────────────────────
# Write the status content to a temp file — avoids send-keys heredoc/escape issues.
STATUS_FILE=$(mktemp /tmp/banzami-status-XXXXX)
cat > "$STATUS_FILE" << 'EOF'

  Banzami Dev Session
  ─────────────────────────────────────
  Backend (right panes)
  core-api     →  http://localhost:8081
  api-gateway  →  http://localhost:8080
  admin-api    →  http://localhost:8082
  public-api   →  http://localhost:8083

  Apps (windows 1-3)
  dashboard    →  http://localhost:3001
  admin-app    →  http://localhost:3002
  pay          →  http://localhost:3003

  Navigate
  Ctrl-b 0       this window
  Ctrl-b 1/2/3   dashboard / admin / pay
  Ctrl-b ← →     switch panes
  Ctrl-b d       detach (keeps running)
  ./dev.sh stop  kill everything
  ─────────────────────────────────────

EOF
tmux send-keys -t "${STATUS}" "clear && cat '$STATUS_FILE'" Enter

tmux select-pane -t "${STATUS}"
tmux select-window -t "$SESSION:banzami"

log "Session '$SESSION' ready — attaching."
tmux attach-session -t "$SESSION"
