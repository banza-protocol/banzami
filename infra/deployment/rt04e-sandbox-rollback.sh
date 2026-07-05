#!/usr/bin/env bash
# =============================================================================
# RT04E Sandbox rollback subsystem — REVIEWED TEMPLATE, NOT AUTO-RUN
# =============================================================================
#   Application image rollback restores only the prior Sandbox image set.
#   Database migrations remain forward-only and are never automatically reversed.
#
# Rollback restores the EXACT Compose-declared image reference (per service) to the
# captured immutable image ID — image-ID retagging of the declared reference IS
# sufficient for this tag-based compose model, so this is what we do; if a captured
# image ID is missing we FAIL CLOSED (no blind rollback).
#
# Subcommands:
#   capture <svc...>  record {service, compose_declared_ref, image_id, revision,
#                     timestamp, release} to a root-owned manifest OUTSIDE the repo.
#   restore           re-point each declared ref to the captured image ID; up; verify.
#   verify            confirm restored running image IDs match the manifest.
# No secret/URL/env value is ever captured or printed.
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
    mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"
    ts="$(date -u +%Y%m%dT%H%M%SZ)"; man="$STATE_DIR/pre-state-$ts.tsv"
    printf 'release\tservice\tcompose_declared_ref\timage_id\trevision\tcaptured_utc\n' > "$man"
    for s in "$@"; do
      rt04e_refuse_bad "$s" && die "service '$s' not rollback-eligible — refusing" 2
      rt04e_in_allow "$s" || die "service '$s' not in allowlist — refusing" 2
      ref="$(rt04e_compose_image_ref "$s")"; [ -n "$ref" ] || die "cannot resolve declared image for $s — refusing" 2
      cid="$(running_image_id "$s")"
      rev="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$(docker ps --filter "name=$s" --format '{{.Names}}' | head -1)" 2>/dev/null)"
      printf '%s\t%s\t%s\t%s\t%s\t%s\n' "${RT04E_RELEASE_REV:-unset}" "$s" "$ref" "${cid:-<none>}" "${rev:-<none>}" "$ts" >> "$man"
    done
    chmod 600 "$man"; chown -R root:root "$STATE_DIR" 2>/dev/null || true
    printf '  pre-state captured (declared ref + immutable image id) for [%s]\n' "$*"
    ;;
  restore)
    [ "${RT04E_ROLLBACK_CONFIRMED:-}" = "yes" ] || die "rollback requires explicit operator confirmation (RT04E_ROLLBACK_CONFIRMED=yes)" 3
    man="$(ls -1t "$STATE_DIR"/pre-state-*.tsv 2>/dev/null | head -1)"
    [ -n "$man" ] && [ -f "$man" ] || die "no pre-state manifest — fail closed (no blind rollback)" 3
    while IFS=$'\t' read -r rel s ref cid rev ts; do
      [ "$s" = service ] && continue
      rt04e_refuse_bad "$s" && die "manifest service '$s' not eligible — refusing" 2
      rt04e_in_allow "$s" || die "manifest service '$s' not in allowlist — refusing" 2
      # attestation continuity: the captured declared ref must still match the live contract.
      [ "$ref" = "$(rt04e_compose_image_ref "$s")" ] || die "declared image ref for $s changed since capture — refusing" 3
      [ -n "$cid" ] && [ "$cid" != "<none>" ] || die "missing pre-state image id for $s — fail closed" 3
      # Re-point the EXACT Compose-declared reference to the captured image id, then up.
      docker tag "$cid" "$ref"
      if rt04e_is_overlay "$s"; then ( cd "$RT04E_COMPOSE_DIR" && docker compose -f docker-compose.yml -f "$(rt04e_compose_file "$s")" up -d --force-recreate "$s" )
      else ( cd "$RT04E_COMPOSE_DIR" && docker compose -f "$(rt04e_compose_file "$s")" up -d --force-recreate "$s" ); fi
      # Verify the restored running image id equals the captured id.
      now="$(running_image_id "$s")"
      [ "$now" = "$cid" ] || die "restored image id for $s ($now) != captured ($cid) — rollback verification FAILED" 3
      printf '  restored %s to prior image id %s (declared ref %s)\n' "$s" "${cid:0:12}" "$ref"
    done < "$man"
    printf '  sandbox images restored from pre-state (migrations NOT reversed — forward-only)\n'
    ;;
  verify)
    man="$(ls -1t "$STATE_DIR"/pre-state-*.tsv 2>/dev/null | head -1)"; [ -n "$man" ] || die "no manifest to verify" 3
    while IFS=$'\t' read -r rel s ref cid rev ts; do
      [ "$s" = service ] && continue
      now="$(running_image_id "$s")"
      printf '  %s: restored=%s expected=%s -> %s\n' "$s" "${now:0:12}" "${cid:0:12}" "$([ "$now" = "$cid" ] && echo PASS || echo FAIL)"
    done < "$man"
    ;;
  *) die "unknown subcommand '$CMD'" 2 ;;
esac
