#!/usr/bin/env bash
# =============================================================================
# RT04E canonical Sandbox deploy adapter — REVIEWED TEMPLATE, NOT AUTO-RUN
# =============================================================================
# Deploys EXACTLY ONE allowlisted Sandbox service, built ONLY from canonical
# source, tagged ONLY with the IMMUTABLE RT04E release reference
# banzami/<repo>:rt04e-<rev> (never latest/adr021-staging), and brought up with
# full isolation: --no-build --pull never --force-recreate --no-deps, over the
# FIXED base+overlay+RT04E-override file set (never caller-supplied).
#
# Usage: RT04E_RELEASE_REV=<rev> REPO_ROOT=/srv/banzami/src RT04E_OVERRIDE=<override> \
#          rt04e-sandbox-deploy.sh <allowlisted-service>
# -----------------------------------------------------------------------------
set -euo pipefail
set +x
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/rt04e-sandbox-lib.sh"

SVC="${1:?usage: rt04e-sandbox-deploy.sh <allowlisted-sandbox-service>}"
CANONICAL_ROOT="/srv/banzami/src"
REPO_ROOT="${REPO_ROOT:-$CANONICAL_ROOT}"
: "${RT04E_RELEASE_REV:?RT04E_RELEASE_REV required}"
: "${RT04E_OVERRIDE:?RT04E_OVERRIDE (generated immutable-image override) required}"
die() { printf 'deploy-adapter: FAILED — %s\n' "$1" >&2; exit "${2:-1}"; }

[ "$REPO_ROOT" = "$CANONICAL_ROOT" ] || die "build source must be $CANONICAL_ROOT" 1
rt04e_valid_rev "$RT04E_RELEASE_REV" || die "RT04E_RELEASE_REV not a valid git revision" 1
rt04e_refuse_bad "$SVC" && die "service '$SVC' is prohibited (live/non-staging) — refusing" 2
rt04e_in_allow "$SVC" || die "service '$SVC' is not in the RT04E allowlist — refusing" 2
[ -f "$RT04E_OVERRIDE" ] || die "generated RT04E override missing — refusing" 1

REPO="$(rt04e_build_repo "$SVC")"
CTX="$REPO_ROOT/$(rt04e_build_context "$SVC")"
REF="$(rt04e_release_ref "$SVC" "$RT04E_RELEASE_REV")"     # IMMUTABLE banzami/<repo>:rt04e-<rev>
[ -e "$CTX" ] || die "canonical build context missing for $SVC — refusing" 2

# Build THIS service's own image, labelled with the canonical revision, then tag it
# ONLY with the immutable RT04E release reference (no latest/adr021-staging).
docker build --label "org.opencontainers.image.revision=${RT04E_RELEASE_REV}" \
  -f "$CTX/Dockerfile" -t "$REF" "$CTX"

# Replace ONLY this service with full isolation, fixed file set (base+overlay+override),
# no build, no pull, forced recreation of just this service, no dependency mutation.
( cd "$RT04E_COMPOSE_DIR" && docker compose $(rt04e_compose_file_args "$RT04E_OVERRIDE") \
    $RT04E_UP_FLAGS "$SVC" )
printf '  deployed %s → %s (immutable RT04E release tag, isolated: no-build/no-pull/no-deps)\n' "$SVC" "$REPO"
