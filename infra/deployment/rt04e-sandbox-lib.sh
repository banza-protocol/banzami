#!/usr/bin/env bash
# =============================================================================
# RT04E sandbox shared library — SOURCED by runner/adapter/rollback/attest.
# NOT executed on its own. No mutation, no secrets, no Compose interpolation.
# =============================================================================
# Single source of truth for the RT04E sandbox service mapping and the IMMUTABLE
# release-tag / rollback-tag derivation. RT04E never uses mutable tags (latest,
# adr021-staging) as the deployed reference — it uses banzami/<repo>:rt04e-<rev>.

RT04E_ALLOW="core-api-staging api-gateway-staging developer-api public-api-staging"

# FIXED, non-overridable Compose scope (hermeticity). Never taken from a caller,
# never from an inherited COMPOSE_* variable.
RT04E_PROJECT_NAME="rt04e-sandbox"
RT04E_PROJECT_DIR="/srv/banzami"

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

# Strict git-revision validation — the FULL immutable SHA only: exactly 40 lowercase
# hex chars (sha1 object length), nothing else. Abbreviated revisions, branch names,
# tags and symbolic refs are rejected. Never eval'd.
rt04e_valid_rev() { case "$1" in ""|*[!0-9a-f]*) return 1 ;; esac; [ "${#1}" -eq 40 ]; }

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

# Mandatory isolation flags for every deploy/rollback replacement.
RT04E_UP_FLAGS="up -d --no-build --pull never --force-recreate --no-deps"

# Compose-environment hermeticity guard. Fail closed if ANY inherited COMPOSE_*
# variable that could influence file selection, project selection, profile
# activation, path separation or orphan behaviour is set and non-empty. Reads only
# presence via printenv — never prints a value.
RT04E_COMPOSE_ENV_VARS="COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_PATH_SEPARATOR COMPOSE_IGNORE_ORPHANS COMPOSE_ENV_FILES COMPOSE_PROJECT_DIR COMPOSE_DISABLE_ENV_FILE COMPOSE_CONVERT_WINDOWS_PATHS"
rt04e_assert_clean_compose_env() {
  local v val
  for v in $RT04E_COMPOSE_ENV_VARS; do
    val="$(printenv "$v" 2>/dev/null || true)"
    [ -z "$val" ] || return 1
  done
  return 0
}

# Central, hermetic Compose invocation — the ONLY place RT04E runs `docker compose`
# with the real file set. Never accepts a caller-supplied Compose file path, project
# name, profile, service, env file, source root, image repo, tag or revision: the
# file set, order, project name and project directory are FIXED literals here.
#
#   rt04e_compose <base|full> <override-path> <config…|up…>
#     base : approved base ONLY (proves api-gateway-staging is overlay-only).
#     full : approved base → gateway overlay → generated RT04E immutable override.
#
# Profiles are never activated (no --profile; COMPOSE_PROFILES rejected above), so
# only unconditional services resolve. No --remove-orphans is ever passed.
rt04e_compose() {
  local projection="$1" override="$2"; shift 2 || return 2
  rt04e_assert_clean_compose_env || return 4
  local -a files
  case "$projection" in
    base) files=(-f docker-compose.yml) ;;
    full)
      [ -n "$override" ] && [ -f "$override" ] || return 3
      files=(-f docker-compose.yml -f docker-compose.sandbox-gateway.yml -f "$override") ;;
    *) return 6 ;;
  esac
  ( cd "$RT04E_PROJECT_DIR" 2>/dev/null || exit 5
    # Controlled unsetting of relevant Compose controls for the child (belt + braces).
    unset $RT04E_COMPOSE_ENV_VARS 2>/dev/null || true
    docker compose \
      --project-name "$RT04E_PROJECT_NAME" \
      --project-directory "$RT04E_PROJECT_DIR" \
      "${files[@]}" "$@"
  )
}
