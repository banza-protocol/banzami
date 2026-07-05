#!/usr/bin/env bash
# =============================================================================
# RT04E Sandbox rollback subsystem — REVIEWED TEMPLATE, NOT AUTO-RUN
# =============================================================================
#   Application image rollback restores only the prior Sandbox image set.
#   Database migrations remain forward-only and are never automatically reversed.
#
# Capture creates a RETAINED, prune-proof rollback tag pinning each pre-state image
# id. Restore re-points the exact Compose-declared immutable reference to the
# captured image id and replaces only the matching service with full isolation, then
# verifies the restored running image id. NO image/container/dangling prune is ever
# performed by RT04E.
#
#   capture <svc...>  pin pre-state images + write manifest OUTSIDE the repo.
#   restore           re-point + isolated replace + verify (operator-confirmed).
#   verify            confirm restored running image ids match the manifest.
# -----------------------------------------------------------------------------
set -euo pipefail
set +x
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/rt04e-sandbox-lib.sh"

CMD="${1:?usage: rt04e-sandbox-rollback.sh <capture|restore|verify> [svc...]}"; shift || true
STATE_DIR="/root/banzami-forensics/rt04e-rollback"    # outside repo + runtime app dirs
die() { printf 'rollback: FAILED — %s\n' "$1" >&2; exit "${2:-1}"; }
running_image_id() { docker inspect --format '{{.Image}}' "$(docker ps --filter "name=$1" --format '{{.Names}}' | head -1)" 2>/dev/null | sed 's/sha256://'; }

case "$CMD" in
  capture)
    : "${RT04E_RELEASE_REV:?RT04E_RELEASE_REV required}"; rt04e_valid_rev "$RT04E_RELEASE_REV" || die "invalid release revision" 1
    mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"
    ts="$(date -u +%Y%m%dT%H%M%SZ)"; man="$STATE_DIR/pre-state-$ts.tsv"
    printf 'release\tservice\tdeclared_ref\tprestate_tag\timage_id\trevision\tcaptured_utc\n' > "$man"
    for s in "$@"; do
      rt04e_refuse_bad "$s" && die "service '$s' not rollback-eligible — refusing" 2
      rt04e_in_allow "$s" || die "service '$s' not in allowlist — refusing" 2
      cid="$(running_image_id "$s")"; [ -n "$cid" ] || die "missing running image id for $s — fail closed" 3
      declared="$(rt04e_release_ref "$s" "$RT04E_RELEASE_REV")"; [ -n "$declared" ] || die "cannot derive declared ref for $s" 3
      ptag="$(rt04e_prestate_tag "$s" "$RT04E_RELEASE_REV")"; [ -n "$ptag" ] || die "cannot derive prestate tag for $s" 3
      # PIN the pre-state image against pruning with the retained rollback tag.
      docker tag "$cid" "$ptag" || die "cannot create retained pre-state tag for $s — fail closed" 3
      rev="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$(docker ps --filter "name=$s" --format '{{.Names}}' | head -1)" 2>/dev/null)"
      printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$RT04E_RELEASE_REV" "$s" "$declared" "$ptag" "$cid" "${rev:-<none>}" "$ts" >> "$man"
    done
    chmod 600 "$man"; chown -R root:root "$STATE_DIR" 2>/dev/null || true
    printf '  pre-state pinned (retained tag + immutable id) for [%s]\n' "$*"
    ;;
  restore)
    [ "${RT04E_ROLLBACK_CONFIRMED:-}" = "yes" ] || die "rollback requires explicit operator confirmation (RT04E_ROLLBACK_CONFIRMED=yes)" 3
    : "${RT04E_OVERRIDE:?RT04E_OVERRIDE required for isolated restore}"; [ -f "$RT04E_OVERRIDE" ] || die "override missing" 3
    man="$(ls -1t "$STATE_DIR"/pre-state-*.tsv 2>/dev/null | head -1)"
    [ -n "$man" ] && [ -f "$man" ] || die "no pre-state manifest — fail closed (no blind rollback)" 3
    while IFS=$'\t' read -r rel s declared ptag cid rev ts; do
      [ "$s" = service ] && continue
      rt04e_refuse_bad "$s" && die "manifest service '$s' not eligible — refusing" 2
      rt04e_in_allow "$s" || die "manifest service '$s' not in allowlist — refusing" 2
      # manifest must match the current RT04E contract
      [ "$declared" = "$(rt04e_release_ref "$s" "$rel")" ] || die "declared ref for $s changed since capture — refusing" 3
      [ -n "$cid" ] && [ "$cid" != "<none>" ] || die "missing pre-state image id for $s — fail closed" 3
      # retained tag must still resolve to the captured image id
      pin="$(docker inspect --format '{{.Id}}' "$ptag" 2>/dev/null | sed 's/sha256://')"
      [ "$pin" = "$cid" ] || die "retained pre-state tag for $s no longer resolves to the captured image id — refusing" 3
      # Re-point the EXACT declared reference to the captured image id, then isolated up.
      docker tag "$cid" "$declared"
      ( cd "$RT04E_COMPOSE_DIR" && docker compose $(rt04e_compose_file_args "$RT04E_OVERRIDE") $RT04E_UP_FLAGS "$s" )
      now="$(running_image_id "$s")"
      [ "$now" = "$cid" ] || die "restored image id for $s ($now) != captured ($cid) — rollback verification FAILED" 3
      printf '  restored %s to pre-state image %s\n' "$s" "${cid:0:12}"
    done < "$man"
    printf '  sandbox images restored from pinned pre-state (migrations NOT reversed — forward-only)\n'
    ;;
  verify)
    man="$(ls -1t "$STATE_DIR"/pre-state-*.tsv 2>/dev/null | head -1)"; [ -n "$man" ] || die "no manifest to verify" 3
    while IFS=$'\t' read -r rel s declared ptag cid rev ts; do
      [ "$s" = service ] && continue
      now="$(running_image_id "$s")"
      printf '  %s: %s\n' "$s" "$([ "$now" = "$cid" ] && echo PASS || echo FAIL)"
    done < "$man"
    ;;
  *) die "unknown subcommand '$CMD'" 2 ;;
esac
# NOTE: RT04E performs NO docker image prune / cleanup. Retained pre-state tags are
# kept until the approved rollback window closes and evidence is accepted (manual).
