#!/usr/bin/env bash
# =============================================================================
# RT04E sandbox shared library — SOURCED by the runner/adapter/rollback/attest.
# NOT executed on its own. No mutation, no secrets, no Docker Compose interpolation.
# =============================================================================
# Single source of truth for the RT04E sandbox service mapping. Image references
# are DERIVED from the declared Compose file structurally (never inferred from the
# service name), so build, rollback and attestation all use the exact same ref.

RT04E_ALLOW="core-api-staging api-gateway-staging developer-api public-api-staging"
RT04E_COMPOSE_DIR="${RT04E_COMPOSE_DIR:-/srv/banzami}"

# service -> declared Compose file (base or sandbox overlay)
rt04e_compose_file() {
  case "$1" in
    core-api-staging|public-api-staging|developer-api) echo "docker-compose.yml" ;;
    api-gateway-staging) echo "docker-compose.sandbox-gateway.yml" ;;   # overlay-only
    *) return 1 ;;
  esac
}
# service -> the image REPOSITORY the adapter must build (canonical continuity anchor)
rt04e_build_repo() {
  case "$1" in
    core-api-staging)    echo "banzami/core-api" ;;
    public-api-staging)  echo "banzami/public-api" ;;
    developer-api)       echo "banzami/developer-api" ;;
    api-gateway-staging) echo "banzami/api-gateway" ;;
    *) return 1 ;;
  esac
}
# service -> canonical build context (relative to REPO_ROOT=/srv/banzami/src)
rt04e_build_context() {
  case "$1" in
    core-api-staging)    echo "core" ;;
    public-api-staging)  echo "services/public-api" ;;
    developer-api)       echo "services/developer-api" ;;
    api-gateway-staging) echo "services/api-gateway" ;;
    *) return 1 ;;
  esac
}
rt04e_is_overlay() { [ "$1" = "api-gateway-staging" ]; }

rt04e_in_allow() { case " $RT04E_ALLOW " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }
# hard refusal of live/prod/non-staging targets — used in EVERY path
rt04e_refuse_bad() {
  case "$1" in
    core-api|api-gateway|public-api|admin-api|admin-api-staging|*prod*|*production*|*live*) return 0 ;;
    *) return 1 ;;
  esac
}

# Safe structural parse of the Compose-declared image reference (repo:tag). Reads
# only the service's `image:` line; performs NO env interpolation and prints no
# other field. Empty on failure (caller fails closed).
rt04e_compose_image_ref() {
  local svc="$1" f
  f="$RT04E_COMPOSE_DIR/$(rt04e_compose_file "$svc")" || return 1
  awk -v s="$svc" '
    $0 ~ "^  "s":" {inb=1; next}
    inb && /^  [a-zA-Z]/ {inb=0}
    inb && /^[[:space:]]*image:/ { gsub(/^[[:space:]]*image:[[:space:]]*/,""); print; exit }
  ' "$f" 2>/dev/null
}
# repo portion (strip :tag) of an image reference.
rt04e_ref_repo() { printf '%s' "${1%%:*}"; }
