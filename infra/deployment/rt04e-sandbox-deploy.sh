#!/usr/bin/env bash
# =============================================================================
# RT04E canonical Sandbox deploy adapter — REVIEWED TEMPLATE, NOT AUTO-RUN
# =============================================================================
# Deploys EXACTLY ONE allowlisted Sandbox service, built ONLY from canonical
# source (REPO_ROOT=/srv/banzami/src) with the immutable revision label
#   org.opencontainers.image.revision=<RT04E_RELEASE_REV>
# It makes the source-to-runtime mapping explicit and reviewable (R1/R7) and
# refuses any service not in the allowlist, and any prod/production/live or
# non-staging core/gateway/public target. It never selects a service merely
# because the caller supplies its name.
#
# Usage: RT04E_RELEASE_REV=<sha> REPO_ROOT=/srv/banzami/src \
#          rt04e-sandbox-deploy.sh <core-api-staging|api-gateway-staging|developer-api|public-api-staging>
# -----------------------------------------------------------------------------
set -euo pipefail
set +x
umask 077

SVC="${1:?usage: rt04e-sandbox-deploy.sh <allowlisted-sandbox-service>}"
CANONICAL_ROOT="/srv/banzami/src"
REPO_ROOT="${REPO_ROOT:-$CANONICAL_ROOT}"
: "${RT04E_RELEASE_REV:?RT04E_RELEASE_REV required}"
COMPOSE_DIR="/srv/banzami"                       # server compose location (base + overlay)
BASE_COMPOSE="docker-compose.yml"
SANDBOX_OVERLAY="docker-compose.sandbox-gateway.yml"
LABEL="--label org.opencontainers.image.revision=${RT04E_RELEASE_REV}"

die() { printf 'deploy-adapter: FAILED — %s\n' "$1" >&2; exit "${2:-1}"; }
[ "$REPO_ROOT" = "$CANONICAL_ROOT" ] || die "build source must be $CANONICAL_ROOT (not '$REPO_ROOT')" 1

# ── allowlist + prohibition gate (fail closed) ───────────────────────────────
case "$SVC" in
  core-api-staging|api-gateway-staging|developer-api|public-api-staging) : ;;
  core-api|api-gateway|public-api|admin-api|admin-api-staging) die "service '$SVC' is out of RT04E scope — refusing" 2 ;;
  *prod*|*production*|*live*) die "service '$SVC' matches a prohibited pattern — refusing" 2 ;;
  *) die "service '$SVC' is not in the RT04E allowlist — refusing" 2 ;;
esac

# Every build below uses ONLY canonical source paths and carries the revision LABEL.
# (Templates: the actual `docker build`/`compose up` lines are the sanctioned deploy
#  operations; this adapter is not executed by the audit.)
case "$SVC" in
  core-api-staging|public-api-staging)
    # Build core (+public-api) from canonical source with the revision label, retag
    # to the sandbox tag, and bring up ONLY the staging services.
    docker build $LABEL -f "$CANONICAL_ROOT/core/Dockerfile" -t banzami/core-api:latest "$CANONICAL_ROOT/core"
    docker tag banzami/core-api:latest banzami/core-api:adr021-staging
    ( cd "$COMPOSE_DIR" && docker compose -f "$BASE_COMPOSE" up -d --force-recreate "$SVC" )
    ;;
  developer-api)
    docker build $LABEL -f "$CANONICAL_ROOT/services/developer-api/Dockerfile" -t banzami/developer-api:latest "$CANONICAL_ROOT/services/developer-api"
    ( cd "$COMPOSE_DIR" && docker compose -f "$BASE_COMPOSE" up -d --force-recreate developer-api )
    ;;
  api-gateway-staging)
    # Sandbox gateway is defined ONLY in the canonical sandbox overlay.
    docker build $LABEL -f "$CANONICAL_ROOT/services/api-gateway/Dockerfile" -t banzami/api-gateway:latest "$CANONICAL_ROOT/services/api-gateway"
    ( cd "$COMPOSE_DIR" && docker compose -f "$BASE_COMPOSE" -f "$SANDBOX_OVERLAY" up -d --force-recreate api-gateway-staging )
    ;;
esac
printf '  deployed sandbox service %s from canonical source with revision label %s\n' "$SVC" "${RT04E_RELEASE_REV:0:12}"
