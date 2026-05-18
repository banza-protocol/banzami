#!/usr/bin/env bash
# deploy.sh — Build and deploy Banzami services to production
#
# Usage:
#   ./deploy.sh                          # deploy all services
#   ./deploy.sh core-api                 # deploy one service
#   ./deploy.sh admin-api admin-frontend # deploy multiple services
#   ./deploy.sh --no-cache core-api      # force full rebuild (no Docker layer cache)
#
# Available services:
#   core-api           Rust financial core
#   admin-api          Go admin service
#   api-gateway        Go public API gateway
#   public-api         Go public REST API
#   admin-frontend     Next.js admin panel
#   dashboard-frontend Next.js merchant dashboard
#   pay-frontend       Next.js pay page (pay.banzami.org)
#   checkout-frontend  Next.js checkout page
#   docs-frontend      Next.js public website (banzami.org)

set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────────

REMOTE="root@217.160.9.248"
REMOTE_COMPOSE_DIR="/srv/banzami"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

ALL_SERVICES=(core-api admin-api api-gateway public-api admin-frontend dashboard-frontend pay-frontend checkout-frontend docs-frontend)

# ─── Colour helpers ───────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

step()    { printf "\n${BOLD}${CYAN}[%s]${NC} %s\n" "$1" "$2"; }
ok()      { printf "  ${GREEN}✓${NC} %s\n" "$*"; }
warn()    { printf "  ${YELLOW}⚠${NC}  %s\n" "$*"; }
die()     { printf "\n  ${RED}✗ %s${NC}\n\n" "$*"; exit 1; }
info()    { printf "  %s\n" "$*"; }

# ─── Argument parsing ─────────────────────────────────────────────────────────

NO_CACHE=""
SERVICES=()

for arg in "$@"; do
  case "$arg" in
    --no-cache) NO_CACHE="--no-cache" ;;
    --*)        die "Unknown flag: $arg" ;;
    *)          SERVICES+=("$arg") ;;
  esac
done

if [ ${#SERVICES[@]} -eq 0 ]; then
  SERVICES=("${ALL_SERVICES[@]}")
fi

# Validate service names
for svc in "${SERVICES[@]}"; do
  valid=false
  for s in "${ALL_SERVICES[@]}"; do [[ "$s" == "$svc" ]] && valid=true && break; done
  $valid || die "Unknown service: '$svc'. Valid: ${ALL_SERVICES[*]}"
done

# ─── Per-service deploy functions ─────────────────────────────────────────────

deploy_core_api() {
  step "core-api" "Rust financial core"

  info "Syncing source to server..."
  rsync -az --delete \
    --exclude='.git' \
    --exclude='target/' \
    "$REPO_ROOT/core/" \
    "$REMOTE:/srv/banzami/src/core/"
  ok "Sync complete"

  info "Building Docker image on server..."
  # shellcheck disable=SC2029
  ssh "$REMOTE" "cd /srv/banzami/src/core && docker build $NO_CACHE -f Dockerfile -t banzami/core-api:latest . 2>&1" \
    | grep -E "^(#[0-9]+ DONE|#[0-9]+ ERROR|error|Step|Successfully)" || true
  ok "Image built"

  info "Recreating container..."
  ssh "$REMOTE" "cd $REMOTE_COMPOSE_DIR && docker compose up -d core-api 2>&1"
  _wait_healthy "banzami-core-api-1"
}

deploy_admin_api() {
  step "admin-api" "Go admin service"

  info "Syncing source to server..."
  # admin-api has its own build directory (Dockerfile context is the service dir)
  rsync -az --delete \
    --exclude='.git' \
    "$REPO_ROOT/services/admin-api/" \
    "$REMOTE:/srv/banzami/admin-api-build/"
  ok "Sync complete"

  info "Building Docker image on server..."
  ssh "$REMOTE" "cd /srv/banzami/admin-api-build && docker build $NO_CACHE -t banzami/admin-api:latest . 2>&1" \
    | grep -E "^(#[0-9]+ DONE|#[0-9]+ ERROR|error|Step|Successfully)" || true
  ok "Image built"

  info "Recreating container..."
  ssh "$REMOTE" "cd $REMOTE_COMPOSE_DIR && docker compose up -d admin-api 2>&1"
  _wait_healthy "banzami-admin-api-1"
}

deploy_api_gateway() {
  step "api-gateway" "Go public API gateway"

  info "Syncing source to server..."
  rsync -az --delete \
    --exclude='.git' \
    "$REPO_ROOT/services/api-gateway/" \
    "$REMOTE:/srv/banzami/api-gateway-build/"
  ok "Sync complete"

  info "Building Docker image on server..."
  ssh "$REMOTE" "cd /srv/banzami/api-gateway-build && docker build $NO_CACHE -t banzami/api-gateway:latest . 2>&1" \
    | grep -E "^(#[0-9]+ DONE|#[0-9]+ ERROR|error|Step|Successfully)" || true
  ok "Image built"

  info "Recreating container..."
  ssh "$REMOTE" "cd $REMOTE_COMPOSE_DIR && docker compose up -d api-gateway 2>&1"
  _wait_healthy "banzami-api-gateway-1"
}

deploy_public_api() {
  step "public-api" "Go public REST API"

  info "Syncing source to server..."
  rsync -az --delete \
    --exclude='.git' \
    "$REPO_ROOT/services/public-api/" \
    "$REMOTE:/srv/banzami/public-api-build/"
  ok "Sync complete"

  info "Building Docker image on server..."
  ssh "$REMOTE" "cd /srv/banzami/public-api-build && docker build $NO_CACHE -t banzami/public-api:latest . 2>&1" \
    | grep -E "^(#[0-9]+ DONE|#[0-9]+ ERROR|error|Step|Successfully)" || true
  ok "Image built"

  info "Recreating container..."
  ssh "$REMOTE" "cd $REMOTE_COMPOSE_DIR && docker compose up -d public-api 2>&1"
  _wait_healthy "banzami-public-api-1"
}

deploy_admin_frontend() {
  step "admin-frontend" "Next.js admin panel"
  _deploy_frontend "admin" "admin-frontend" "banzami/admin-frontend:latest" "banzami-admin-frontend-1"
}

deploy_dashboard_frontend() {
  step "dashboard-frontend" "Next.js merchant dashboard"
  _deploy_frontend "dashboard" "dashboard-frontend" "banzami/dashboard-frontend:latest" "banzami-dashboard-frontend-1"
}

deploy_pay_frontend() {
  step "pay-frontend" "Next.js pay page (pay.banzami.org)"
  _deploy_frontend "pay" "pay-frontend" "banzami/pay-frontend:latest" "banzami-pay-frontend-1"
}

deploy_checkout_frontend() {
  step "checkout-frontend" "Next.js checkout page"
  _deploy_frontend "checkout" "checkout-frontend" "banzami/checkout-frontend:latest" "banzami-checkout-frontend-1"
}

deploy_docs_frontend() {
  step "docs-frontend" "Next.js public website (banzami.org)"

  info "Syncing app source to server..."
  rsync -az --delete \
    --exclude='.git' \
    --exclude='node_modules/' \
    --exclude='.next/' \
    "$REPO_ROOT/apps/docs/" \
    "$REMOTE:/srv/banzami/src/apps/docs/"
  ok "App sync complete"

  info "Syncing BANZAMI_REFERENCE.md (build-time content source)..."
  # The Dockerfile builds with repo root as context so it can COPY both
  # apps/docs/ and docs/BANZAMI_REFERENCE.md into the image (ADR-015).
  ssh "$REMOTE" "mkdir -p /srv/banzami/src/docs"
  rsync -az \
    "$REPO_ROOT/docs/BANZAMI_REFERENCE.md" \
    "$REMOTE:/srv/banzami/src/docs/BANZAMI_REFERENCE.md"
  ok "Reference doc synced"

  info "Building Docker image on server (context = repo root)..."
  ssh "$REMOTE" "docker build $NO_CACHE \
    -f /srv/banzami/src/apps/docs/Dockerfile \
    -t banzami/docs-frontend:latest \
    /srv/banzami/src/ 2>&1" \
    | grep -E "^(#[0-9]+ DONE|#[0-9]+ ERROR|error|Step|Successfully)" || true
  ok "Image built"

  info "Recreating container..."
  ssh "$REMOTE" "docker rm -f banzami-docs-frontend-1 2>/dev/null || true; cd $REMOTE_COMPOSE_DIR && docker compose up -d docs-frontend 2>&1"
  ok "Container started"
}

# Shared frontend deploy (Next.js apps all follow the same pattern)
_deploy_frontend() {
  local app_name="$1"       # e.g. "admin"
  local compose_svc="$2"    # e.g. "admin-frontend"
  local image_tag="$3"      # e.g. "banzami/admin-frontend:latest"
  local container="$4"      # e.g. "banzami-admin-frontend-1"

  info "Syncing source to server..."
  rsync -az --delete \
    --exclude='.git' \
    --exclude='node_modules/' \
    --exclude='.next/' \
    "$REPO_ROOT/apps/$app_name/" \
    "$REMOTE:/srv/banzami/src/apps/$app_name/"
  ok "Sync complete"

  info "Building Docker image on server..."
  ssh "$REMOTE" "cd /srv/banzami/src/apps/$app_name && docker build $NO_CACHE -t $image_tag . 2>&1" \
    | grep -E "^(#[0-9]+ DONE|#[0-9]+ ERROR|error|Step|Successfully)" || true
  ok "Image built"

  info "Recreating container..."
  # Frontends sometimes have stale container state; force remove before up
  ssh "$REMOTE" "docker rm -f $container 2>/dev/null || true; cd $REMOTE_COMPOSE_DIR && docker compose up -d $compose_svc 2>&1"
  ok "Container started"
}

# Wait for a container to reach healthy/running state (up to 60s)
_wait_healthy() {
  local container="$1"
  local max=12  # 12 × 5s = 60s
  local i=0
  printf "  Waiting for %s " "$container"
  while [ $i -lt $max ]; do
    status=$(ssh "$REMOTE" "docker inspect --format '{{.State.Health.Status}}' $container 2>/dev/null || echo 'running'")
    state=$(ssh "$REMOTE" "docker inspect --format '{{.State.Status}}' $container 2>/dev/null || echo 'unknown'")
    if [[ "$status" == "healthy" || ("$state" == "running" && "$status" == "running") ]]; then
      printf "\n"
      ok "$container is healthy"
      return 0
    fi
    if [[ "$state" == "exited" || "$state" == "dead" ]]; then
      printf "\n"
      die "$container exited unexpectedly — check: ssh $REMOTE docker logs $container"
    fi
    printf "."
    sleep 5
    i=$((i + 1))
  done
  printf "\n"
  warn "$container health check timed out (may still be starting)"
}

# ─── Main ─────────────────────────────────────────────────────────────────────

printf "\n${BOLD}Banzami deploy${NC} → ${CYAN}%s${NC}\n" "$REMOTE"
printf "Services: ${BOLD}%s${NC}\n" "${SERVICES[*]}"
[[ -n "$NO_CACHE" ]] && printf "${YELLOW}Mode: --no-cache (full rebuild)${NC}\n"

START=$(date +%s)

for svc in "${SERVICES[@]}"; do
  case "$svc" in
    core-api)           deploy_core_api ;;
    admin-api)          deploy_admin_api ;;
    api-gateway)        deploy_api_gateway ;;
    public-api)         deploy_public_api ;;
    admin-frontend)     deploy_admin_frontend ;;
    dashboard-frontend) deploy_dashboard_frontend ;;
    pay-frontend)       deploy_pay_frontend ;;
    checkout-frontend)  deploy_checkout_frontend ;;
    docs-frontend)      deploy_docs_frontend ;;
  esac
done

END=$(date +%s)
ELAPSED=$((END - START))

printf "\n${GREEN}${BOLD}Deploy complete${NC} — %dm%ds\n\n" $((ELAPSED / 60)) $((ELAPSED % 60))
