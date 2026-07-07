#!/usr/bin/env bash
# =============================================================================
# Reproducible base-image digest resolver/verifier for the migration-runner.
# =============================================================================
# Resolves each tag in ./digests.lock to its content-addressed manifest digest via
# the Docker Hub registry v2 API (anonymous pull token) and compares. Requires only
# curl — no global Docker/hadolint/host tooling install, no secrets, no VM access.
#
#   ./resolve-digests.sh          verify locked digests still match (exit 1 on drift)
#   ./resolve-digests.sh --print  print freshly-resolved <role> <tag> <digest>
# -----------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCK="$HERE/digests.lock"
MODE="${1:-verify}"

registry_repo() { case "$1" in */*) printf '%s' "$1";; *) printf 'library/%s' "$1";; esac; }

resolve() { # $1=image (rust / debian / ns/img)  $2=tag  -> sha256:...
  local repo tok
  repo="$(registry_repo "$1")"
  tok="$(curl -fsS "https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull" | sed -E 's/.*"token":"([^"]+)".*/\1/')"
  [ -n "$tok" ] || return 2
  curl -fsSI -H "Authorization: Bearer $tok" \
       -H "Accept: application/vnd.oci.image.index.v1+json" \
       -H "Accept: application/vnd.docker.distribution.manifest.list.v2+json" \
       "https://registry-1.docker.io/v2/${repo}/manifests/${2}" \
    | tr -d '\r' | awk 'tolower($1)=="docker-content-digest:"{print $2}'
}

rc=0
while read -r role ref locked || [ -n "$role" ]; do
  case "$role" in ''|\#*) continue;; sqlx_cli) continue;; esac
  img="${ref%%:*}"; tag="${ref#*:}"
  cur="$(resolve "$img" "$tag" || echo RESOLVE_FAIL)"
  if [ "$MODE" = "--print" ]; then
    printf '%s %s %s\n' "$role" "$ref" "$cur"
  else
    if [ "$cur" = "$locked" ]; then printf '  ok   %s %s\n' "$role" "$ref"
    else printf '  DRIFT %s %s (locked=%s current=%s)\n' "$role" "$ref" "${locked:0:16}" "${cur:0:16}"; rc=1; fi
  fi
done < "$LOCK"
exit "$rc"
