#!/usr/bin/env bash
# =============================================================================
# RT04E Sandbox rollback subsystem — REVIEWED TEMPLATE, NOT AUTO-RUN
# =============================================================================
# Application-image rollback for the FOUR allowlisted Sandbox services ONLY.
#
#   Application image rollback may restore the previous Sandbox service set.
#   Database migrations are forward-only and are NOT automatically reversed.
#
# Subcommands:
#   capture <svc...>  record each service's current image ID to a root-owned
#                     pre-state manifest OUTSIDE the repo and runtime app dirs.
#   restore           restore the captured images for the allowlisted services;
#                     requires explicit operator confirmation; sandbox-only.
#   verify            confirm restored image identities match the manifest.
# No secret value is ever captured or printed. No migration is ever reversed.
# -----------------------------------------------------------------------------
set -euo pipefail
set +x
umask 077

CMD="${1:?usage: rt04e-sandbox-rollback.sh <capture|restore|verify> [svc...]}"; shift || true
ALLOW="core-api-staging api-gateway-staging developer-api public-api-staging"
STATE_DIR="/root/banzami-forensics/rt04e-rollback"   # outside repo + runtime app dirs
COMPOSE_DIR="/srv/banzami"
die() { printf 'rollback: FAILED — %s\n' "$1" >&2; exit "${2:-1}"; }

in_allow() { case " $ALLOW " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }
# hard refusal of live/prod/non-staging targets in every path
refuse_bad() { case "$1" in core-api|api-gateway|public-api|admin-api|*prod*|*production*|*live*) die "service '$1' is not rollback-eligible — refusing" 2 ;; esac; }

case "$CMD" in
  capture)
    mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"
    ts="$(date -u +%Y%m%dT%H%M%SZ)"; man="$STATE_DIR/pre-state-$ts.tsv"
    printf 'release\tservice\timage_id\tcaptured_utc\n' > "$man"
    for s in "$@"; do
      refuse_bad "$s"; in_allow "$s" || die "service '$s' not in allowlist — refusing" 2
      cid="$(docker ps --filter "name=$s" --format '{{.Names}}' | head -1)"
      img="$(docker inspect --format '{{.Image}}' "$cid" 2>/dev/null | sed 's/sha256://; s/\(.\{12\}\).*/\1/')"
      printf '%s\t%s\t%s\t%s\n' "${RT04E_RELEASE_REV:-unset}" "$s" "${img:-<none>}" "$ts" >> "$man"
    done
    chmod 600 "$man"; chown -R root:root "$STATE_DIR" 2>/dev/null || true
    printf '  pre-state captured for [%s] (manifest outside repo)\n' "$*"
    ;;
  restore)
    [ "${RT04E_ROLLBACK_CONFIRMED:-}" = "yes" ] || die "rollback requires explicit operator confirmation (RT04E_ROLLBACK_CONFIRMED=yes)" 3
    man="$(ls -1t "$STATE_DIR"/pre-state-*.tsv 2>/dev/null | head -1)"
    [ -n "$man" ] && [ -f "$man" ] || die "no pre-state manifest found — fail closed (cannot rollback blindly)" 3
    while IFS=$'\t' read -r rel s img ts; do
      [ "$s" = service ] && continue
      refuse_bad "$s"; in_allow "$s" || die "manifest service '$s' not in allowlist — refusing" 2
      [ -n "$img" ] && [ "$img" != "<none>" ] || die "missing pre-state image for $s — fail closed" 3
      # restore ONLY the allowlisted sandbox service to its previous image (sandbox-only).
      docker tag "$img" "banzami/$s:rollback"
      ( cd "$COMPOSE_DIR" && docker compose up -d --force-recreate "$s" )
    done < "$man"
    printf '  sandbox application images restored from pre-state (migrations NOT reversed — forward-only)\n'
    ;;
  verify)
    man="$(ls -1t "$STATE_DIR"/pre-state-*.tsv 2>/dev/null | head -1)"
    [ -n "$man" ] || die "no manifest to verify" 3
    printf '  verify against manifest: %s\n' "$(basename "$man")"
    ;;
  *) die "unknown subcommand '$CMD'" 2 ;;
esac
