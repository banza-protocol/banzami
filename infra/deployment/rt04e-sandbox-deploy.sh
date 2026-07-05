#!/usr/bin/env bash
# =============================================================================
# RT04E canonical Sandbox deploy adapter — REVIEWED TEMPLATE, NOT AUTO-RUN
# =============================================================================
# Deploys EXACTLY ONE allowlisted Sandbox service, built ONLY from canonical
# source with the revision label, tagged to the EXACT Compose-declared image
# reference (derived structurally — never inferred from the service name).
# Fixes build-to-runtime continuity: each service builds ITS OWN image repository
# and refuses to proceed if the built repo != the Compose-declared repo.
#
# Usage: RT04E_RELEASE_REV=<sha> REPO_ROOT=/srv/banzami/src \
#          rt04e-sandbox-deploy.sh <core-api-staging|api-gateway-staging|developer-api|public-api-staging>
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
LABEL="--label org.opencontainers.image.revision=${RT04E_RELEASE_REV}"
die() { printf 'deploy-adapter: FAILED — %s\n' "$1" >&2; exit "${2:-1}"; }

[ "$REPO_ROOT" = "$CANONICAL_ROOT" ] || die "build source must be $CANONICAL_ROOT" 1
rt04e_refuse_bad "$SVC" && die "service '$SVC' is prohibited (live/non-staging) — refusing" 2
rt04e_in_allow "$SVC" || die "service '$SVC' is not in the RT04E allowlist — refusing" 2

# Derive the EXACT Compose-declared image reference + the expected build repo.
REF="$(rt04e_compose_image_ref "$SVC")"; [ -n "$REF" ] || die "cannot resolve Compose-declared image for $SVC — refusing" 2
REPO="$(rt04e_build_repo "$SVC")"
CTX="$REPO_ROOT/$(rt04e_build_context "$SVC")"
CF="$(rt04e_compose_file "$SVC")"
# Continuity guard: the Compose-declared repo MUST equal the repo we build.
[ "$(rt04e_ref_repo "$REF")" = "$REPO" ] || die "Compose image repo != build repo for $SVC (declared=$(rt04e_ref_repo "$REF"), build=$REPO) — refusing" 2
[ -e "$CTX" ] || die "canonical build context missing for $SVC — refusing" 2

# Build THIS service's own image (public-api builds public-api, NOT core-api),
# labelled with the canonical revision, then tag to the exact declared ref.
docker build $LABEL -f "$CTX/Dockerfile" -t "$REPO:latest" "$CTX"
docker tag "$REPO:latest" "$REF"                      # exact Compose-declared reference

# Bring up ONLY this service, via base compose or the sandbox overlay.
if rt04e_is_overlay "$SVC"; then
  ( cd "$RT04E_COMPOSE_DIR" && docker compose -f docker-compose.yml -f "$CF" up -d --force-recreate "$SVC" )
else
  ( cd "$RT04E_COMPOSE_DIR" && docker compose -f "$CF" up -d --force-recreate "$SVC" )
fi
printf '  deployed %s from canonical %s → image repo %s (revision %s)\n' "$SVC" "$(rt04e_build_context "$SVC")" "$REPO" "${RT04E_RELEASE_REV:0:12}"
