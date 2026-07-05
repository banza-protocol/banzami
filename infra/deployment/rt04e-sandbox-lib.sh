#!/usr/bin/env bash
# =============================================================================
# RT04E sandbox shared library — SOURCED by runner/adapter/rollback/attest.
# NOT executed on its own. No mutation, no secrets, no Compose interpolation.
# =============================================================================
# Single source of truth for the RT04E sandbox service mapping and the IMMUTABLE
# release-tag / rollback-tag derivation. RT04E never uses mutable tags (latest,
# adr021-staging) as the deployed reference — it uses banzami/<repo>:rt04e-<rev>.

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
# service -> the image REPOSITORY the adapter builds (continuity anchor).
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
rt04e_refuse_bad() {
  case "$1" in
    core-api|api-gateway|public-api|admin-api|admin-api-staging|*prod*|*production*|*live*) return 0 ;;
    *) return 1 ;;
  esac
}

# Strict git-revision validation — hex, 7..40 chars, nothing else. Never eval'd.
rt04e_valid_rev() { case "$1" in ""|*[!0-9a-f]*) return 1 ;; esac; [ "${#1}" -ge 7 ] && [ "${#1}" -le 40 ]; }

# IMMUTABLE RT04E release reference for a service: banzami/<repo>:rt04e-<rev>.
rt04e_release_ref() {
  rt04e_valid_rev "$2" || return 1
  printf '%s:rt04e-%s' "$(rt04e_build_repo "$1")" "$2"
}
# Retained pre-state rollback tag (prune-proof): banzami/<repo>:rt04e-prestate-<release>-<service>.
rt04e_prestate_tag() {
  rt04e_valid_rev "$2" || return 1
  printf '%s:rt04e-prestate-%s-%s' "$(rt04e_build_repo "$1")" "$2" "$1"
}

# Fixed, approved Compose file set (base + sandbox overlay + generated RT04E override).
# $1 = path to the generated RT04E image override. Order is FIXED — never caller input.
rt04e_compose_file_args() {
  printf -- '-f docker-compose.yml -f docker-compose.sandbox-gateway.yml -f %s' "$1"
}
# Mandatory isolation flags for every deploy/rollback replacement.
RT04E_UP_FLAGS="up -d --no-build --pull never --force-recreate --no-deps"
