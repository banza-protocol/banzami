#!/usr/bin/env bash
# deploy.sh — Build and deploy Banzami services to production
#
# Usage:
#   ./deploy.sh                          # deploy all services
#   ./deploy.sh core-api                 # deploy one service
#   ./deploy.sh admin-api admin-frontend # deploy multiple services
#   ./deploy.sh --no-cache core-api      # force full rebuild (no Docker layer cache)
#   ./deploy.sh staging                  # deploy staging sandbox (core-api-staging + public-api-staging)
#
# Available services:
#   core-api           Rust financial core
#   admin-api          Go admin service
#   api-gateway        Go public API gateway
#   public-api         Go public REST API
#   admin-frontend     Next.js admin panel
#   dashboard-frontend Next.js merchant dashboard
#   pay-frontend       Next.js pay page (pay.banzami.com)
#   checkout-frontend  Next.js checkout page
#   website-frontend   Next.js official website (banzami.com)
#   staging            Staging sandbox (core-api-staging + public-api-staging)

set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────────

REMOTE="root@217.160.9.248"
REMOTE_COMPOSE_DIR="/srv/banzami"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

# Stamp every image with the source commit so "what commit is live?" is
# answerable from `docker inspect` instead of guessed from build timestamps.
GIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
LABEL_ARGS="--label org.opencontainers.image.revision=$GIT_SHA"

ALL_SERVICES=(core-api admin-api api-gateway public-api sandbox-operator developer-api admin-frontend dashboard-frontend pay-frontend checkout-frontend website-frontend staging)

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

# ─── Financial-core rollout gate (Banzami ADR-034) ────────────────────────────
# Enforced before ANY financial Core deployment: migrate the explicit target DB,
# introspect it, run the authoritative manifest drift detector, and ABORT the
# deploy on drift. There is no silent skip — a core deploy without a reachable,
# labelled target DB is refused. `sqlx migrate run` is the only migration path;
# tools/sqlx-backfill.sh is disabled (it caused the 0090–0095 drift).
_rollout_gate() {
  local target_label="$1"
  step "rollout-gate" "migrate + schema drift detector → '$target_label' (financial Core)"
  [ -n "${BANZAMI_MIGRATE_URL:-}" ] || die \
    "Financial-core deploy requires the rollout gate. Export BANZAMI_MIGRATE_URL (a reachable connection to '$target_label') and re-run. The gate runs tools/migrate-and-verify.sh (migrate → introspect → drift detector) and blocks the deploy on drift."
  DATABASE_URL="$BANZAMI_MIGRATE_URL" BANZAMI_DB_TARGET="$target_label" \
    bash "$REPO_ROOT/tools/migrate-and-verify.sh" \
    || die "Rollout gate FAILED for '$target_label' — deployment BLOCKED (migration error or schema drift)."
  ok "Rollout gate passed for '$target_label' — proceeding with deploy"
}

deploy_core_api() {
  step "core-api" "Rust financial core"

  _rollout_gate "${BANZAMI_DB_TARGET:-banzami_staging}"

  info "Syncing source to server..."
  rsync -az --delete \
    --exclude='.git' --exclude='.env' --exclude='.env.*' \
    --exclude='target/' \
    "$REPO_ROOT/core/" \
    "$REMOTE:/srv/banzami/src/core/"
  ok "Sync complete"

  info "Building Docker image on server..."
  # shellcheck disable=SC2029
  ssh "$REMOTE" "cd /srv/banzami/src/core && docker build $NO_CACHE $LABEL_ARGS -f Dockerfile -t banzami/core-api:latest . 2>&1" \
    | grep -E "^(#[0-9]+ DONE|#[0-9]+ ERROR|error|Step|Successfully)" || true
  ok "Image built"

  info "Recreating container..."
  ssh "$REMOTE" "cd $REMOTE_COMPOSE_DIR && docker compose up -d core-api 2>&1"
  _wait_healthy "banzami-core-api-1"
}

deploy_admin_api() {
  step "admin-api" "Go admin service"

  info "Syncing source to server..."
  # Build context contains common/ + admin-api/ as siblings so the shared
  # Document Engine module (replace ../common/documents) resolves in Docker.
  rsync -az --delete --exclude='.git' --exclude='.env' --exclude='.env.*' \
    "$REPO_ROOT/services/common/" \
    "$REMOTE:/srv/banzami/admin-api-build/common/"
  rsync -az --delete --exclude='.git' --exclude='.env' --exclude='.env.*' \
    "$REPO_ROOT/services/admin-api/" \
    "$REMOTE:/srv/banzami/admin-api-build/admin-api/"
  ok "Sync complete"

  info "Building Docker image on server..."
  ssh "$REMOTE" "cd /srv/banzami/admin-api-build && docker build $NO_CACHE $LABEL_ARGS -f admin-api/Dockerfile -t banzami/admin-api:latest . 2>&1" \
    | grep -E "^(#[0-9]+ DONE|#[0-9]+ ERROR|error|Step|Successfully)" || true
  ok "Image built"

  info "Recreating container..."
  ssh "$REMOTE" "cd $REMOTE_COMPOSE_DIR && docker compose up -d admin-api 2>&1"
  _wait_healthy "banzami-admin-api-1"
}

deploy_api_gateway() {
  step "api-gateway" "Go public API gateway"

  info "Syncing source to server..."
  # Build context contains common/ + api-gateway/ as siblings for the shared
  # Document Engine module (replace ../common/documents).
  rsync -az --delete --exclude='.git' --exclude='.env' --exclude='.env.*' \
    "$REPO_ROOT/services/common/" \
    "$REMOTE:/srv/banzami/api-gateway-build/common/"
  rsync -az --delete --exclude='.git' --exclude='.env' --exclude='.env.*' \
    "$REPO_ROOT/services/api-gateway/" \
    "$REMOTE:/srv/banzami/api-gateway-build/api-gateway/"
  ok "Sync complete"

  info "Building Docker image on server..."
  ssh "$REMOTE" "cd /srv/banzami/api-gateway-build && docker build $NO_CACHE $LABEL_ARGS -f api-gateway/Dockerfile -t banzami/api-gateway:latest . 2>&1" \
    | grep -E "^(#[0-9]+ DONE|#[0-9]+ ERROR|error|Step|Successfully)" || true
  ok "Image built"

  info "Recreating container..."
  ssh "$REMOTE" "cd $REMOTE_COMPOSE_DIR && docker compose up -d api-gateway 2>&1"
  _wait_healthy "banzami-api-gateway-1"
}

deploy_sandbox_operator() {
  step "sandbox-operator" "BANZA L0 sandbox operator (manifest + health at sandbox-operator.banzami.com)"

  info "Syncing source to server..."
  rsync -az --delete \
    --exclude='.git' --exclude='.env' --exclude='.env.*' \
    "$REPO_ROOT/services/sandbox-operator/" \
    "$REMOTE:/srv/banzami/sandbox-operator-build/"
  ok "Sync complete"

  info "Building Docker image on server..."
  ssh "$REMOTE" "cd /srv/banzami/sandbox-operator-build && docker build $NO_CACHE $LABEL_ARGS -t banzami/sandbox-operator:latest . 2>&1" \
    | grep -E "^(#[0-9]+ DONE|#[0-9]+ ERROR|error|Step|Successfully)" || true
  ok "Image built"

  info "Recreating container..."
  ssh "$REMOTE" "cd $REMOTE_COMPOSE_DIR && docker compose up -d sandbox-operator 2>&1"
  _wait_healthy "banzami-sandbox-operator-1"
}

deploy_developer_api() {
  step "developer-api" "Go Developer Platform API (sandbox: developer-api.banzami.com)"

  info "Syncing source to server..."
  # Build context contains common/ + developer-api/ as siblings for the shared
  # modules (replace ../common/obs and ../common/email).
  ssh "$REMOTE" "mkdir -p /srv/banzami/developer-api-build/common /srv/banzami/developer-api-build/developer-api"
  rsync -az --delete --exclude='.git' --exclude='.env' --exclude='.env.*' --exclude='node_modules' \
    "$REPO_ROOT/services/common/" \
    "$REMOTE:/srv/banzami/developer-api-build/common/"
  rsync -az --delete --exclude='.git' --exclude='.env' --exclude='.env.*' \
    "$REPO_ROOT/services/developer-api/" \
    "$REMOTE:/srv/banzami/developer-api-build/developer-api/"
  ok "Sync complete"

  info "Building Docker image on server..."
  ssh "$REMOTE" "cd /srv/banzami/developer-api-build && docker build $NO_CACHE $LABEL_ARGS -f developer-api/Dockerfile -t banzami/developer-api:latest . 2>&1" \
    | grep -E "^(#[0-9]+ DONE|#[0-9]+ ERROR|error|Step|Successfully)" || true
  ok "Image built"

  info "Recreating container (sandbox-only: banzami_staging + isolated Redis)..."
  ssh "$REMOTE" "cd $REMOTE_COMPOSE_DIR && docker compose up -d developer-api 2>&1"
  _wait_healthy "banzami-developer-api-1"
  _reload_nginx
}

deploy_public_api() {
  step "public-api" "Go public REST API"

  info "Syncing source to server..."
  # Build context contains common/ + public-api/ as siblings for the shared
  # Document Engine module (replace ../common/documents).
  rsync -az --delete --exclude='.git' --exclude='.env' --exclude='.env.*' \
    "$REPO_ROOT/services/common/" \
    "$REMOTE:/srv/banzami/public-api-build/common/"
  rsync -az --delete --exclude='.git' --exclude='.env' --exclude='.env.*' \
    "$REPO_ROOT/services/public-api/" \
    "$REMOTE:/srv/banzami/public-api-build/public-api/"
  ok "Sync complete"

  info "Building Docker image on server..."
  ssh "$REMOTE" "cd /srv/banzami/public-api-build && docker build $NO_CACHE $LABEL_ARGS -f public-api/Dockerfile -t banzami/public-api:latest . 2>&1" \
    | grep -E "^(#[0-9]+ DONE|#[0-9]+ ERROR|error|Step|Successfully)" || true
  ok "Image built"

  info "Recreating container..."
  ssh "$REMOTE" "cd $REMOTE_COMPOSE_DIR && docker compose up -d public-api 2>&1"
  _wait_healthy "banzami-public-api-1"
  _reload_nginx
}

# Recreating a public-api container gives it a new IP; nginx resolves upstream
# names once at start and would keep routing to the stale IP. Reload after every
# recreate so api.banzami.com / sandbox-api.banzami.com re-resolve correctly.
_reload_nginx() {
  info "Reloading nginx (re-resolve upstream IPs)..."
  ssh "$REMOTE" "docker exec banzami-nginx-1 nginx -s reload 2>&1 || true"
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
  step "pay-frontend" "Next.js pay page (pay.banzami.com)"
  _deploy_frontend "pay" "pay-frontend" "banzami/pay-frontend:latest" "banzami-pay-frontend-1"
}

deploy_checkout_frontend() {
  step "checkout-frontend" "Next.js checkout page"
  _deploy_frontend "checkout" "checkout-frontend" "banzami/checkout-frontend:latest" "banzami-checkout-frontend-1"
}

deploy_website_frontend() {
  step "website-frontend" "Next.js official website (banzami.com)"
  _deploy_frontend "website" "website-frontend" "banzami/website-frontend:latest" "banzami-website-frontend-1"
}

# Shared frontend deploy (Next.js apps all follow the same pattern)
_deploy_frontend() {
  local app_name="$1"       # e.g. "admin"
  local compose_svc="$2"    # e.g. "admin-frontend"
  local image_tag="$3"      # e.g. "banzami/admin-frontend:latest"
  local container="$4"      # e.g. "banzami-admin-frontend-1"

  info "Syncing source to server..."
  rsync -az --delete \
    --exclude='.git' --exclude='.env' --exclude='.env.*' \
    --exclude='node_modules/' \
    --exclude='.next/' \
    "$REPO_ROOT/apps/$app_name/" \
    "$REMOTE:/srv/banzami/src/apps/$app_name/"
  ok "Sync complete"

  info "Building Docker image on server..."
  ssh "$REMOTE" "cd /srv/banzami/src/apps/$app_name && docker build $NO_CACHE $LABEL_ARGS -t $image_tag . 2>&1" \
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

deploy_staging() {
  step "staging" "Staging sandbox (core-api-staging + public-api-staging)"

  # Financial-core rollout gate — the staging stack IS the sandbox financial core.
  _rollout_gate "banzami_staging"

  # Ensure env vars added to services since initial server setup are present.
  # Idempotent: grep exits 0 if already there, insert after LOG_LEVEL if missing.
  info "Checking server compose env vars..."
  ssh "$REMOTE" "
    if ! grep -q 'FIREBASE_CREDENTIALS_JSON' /srv/banzami/docker-compose.yml; then
      awk '/public-api-staging:/,/depends_on:/{if(/LOG_LEVEL/){print; print \"      FIREBASE_CREDENTIALS_JSON: \${FIREBASE_CREDENTIALS_JSON:-}\"; next}}1' \
        /srv/banzami/docker-compose.yml > /tmp/dc.yml && mv /tmp/dc.yml /srv/banzami/docker-compose.yml
    fi
  "
  # The sandbox stack pins core-api to the :adr021-staging tag (not :latest), so
  # a bare recreate would resurrect a stale image. Retag the freshly-built
  # :latest onto :adr021-staging first so staging actually runs current code.
  info "Retagging core-api:latest -> :adr021-staging for the sandbox stack..."
  ssh "$REMOTE" "docker tag banzami/core-api:latest banzami/core-api:adr021-staging 2>&1"
  info "Recreating staging containers..."
  ssh "$REMOTE" "cd $REMOTE_COMPOSE_DIR && docker compose up -d --force-recreate core-api-staging public-api-staging 2>&1"
  _wait_healthy "banzami-core-api-staging-1"
  _wait_healthy "banzami-public-api-staging-1"
  _reload_nginx
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
    sandbox-operator)   deploy_sandbox_operator ;;
    developer-api)      deploy_developer_api ;;
    admin-frontend)     deploy_admin_frontend ;;
    dashboard-frontend) deploy_dashboard_frontend ;;
    pay-frontend)       deploy_pay_frontend ;;
    checkout-frontend)  deploy_checkout_frontend ;;
    website-frontend)   deploy_website_frontend ;;
    staging)            deploy_staging ;;
  esac
done

END=$(date +%s)
ELAPSED=$((END - START))

printf "\n${GREEN}${BOLD}Deploy complete${NC} — %dm%ds\n\n" $((ELAPSED / 60)) $((ELAPSED % 60))
