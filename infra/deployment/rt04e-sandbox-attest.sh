#!/usr/bin/env bash
# =============================================================================
# RT04E pre-mutation Compose structural attestation — REVIEWED TEMPLATE
# =============================================================================
# Runs BEFORE any migration, image build or service replacement. Verifies, from
# the declared server-side Compose files + approved overlay relationship, that the
# four allowlisted services resolve exactly as the contract expects. Reports only
# PASS/FAIL categories — never Compose content, image values, paths, ports, hosts,
# URLs, env values, volumes or secrets. Fails closed on any anomaly.
#
# Usage: rt04e-sandbox-attest.sh   (exit 0 = attestation passed)
# -----------------------------------------------------------------------------
set -euo pipefail
set +x
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/rt04e-sandbox-lib.sh"

fail=0
row() { printf '  %-20s mapping=%s image-continuity=%s overlay=%s\n' "$1" "$2" "$3" "$4"; }
service_present() { # service $1 present in file $2 (structural)
  grep -qE "^  $1:" "$RT04E_COMPOSE_DIR/$2"
}

for s in $RT04E_ALLOW; do
  # 3. prohibited/live target must never be in the resolved set
  if rt04e_refuse_bad "$s"; then row "$s" FAIL - -; fail=1; continue; fi

  cf="$(rt04e_compose_file "$s")"
  # 1. exists in the exact declared compose file
  if service_present "$s" "$cf"; then mapping=PASS; else mapping=FAIL; fi

  # 5. Compose-declared image repo == the repo the adapter will build (continuity)
  ref="$(rt04e_compose_image_ref "$s")"
  if [ -n "$ref" ] && [ "$(rt04e_ref_repo "$ref")" = "$(rt04e_build_repo "$s")" ]; then cont=PASS; else cont=FAIL; fi

  # 2. api-gateway-staging resolves ONLY through the overlay (absent from base)
  ov=NOT_APPLICABLE
  if rt04e_is_overlay "$s"; then
    if service_present "$s" docker-compose.yml; then ov=FAIL      # must NOT be in base
    elif service_present "$s" "$cf"; then ov=PASS; else ov=FAIL; fi
  fi

  # 4. unambiguous mapping: the service must appear in exactly one selected file
  # (base OR overlay, per contract) — a duplicate across the selected set fails.
  n=0; service_present "$s" docker-compose.yml && n=$((n+1)); [ "$cf" != docker-compose.yml ] && service_present "$s" "$cf" && n=$((n+1)) || true
  [ "$mapping" = PASS ] && [ "$ov" != FAIL ] || mapping=FAIL

  row "$s" "$mapping" "$cont" "$ov"
  { [ "$mapping" = PASS ] && [ "$cont" = PASS ] && [ "$ov" != FAIL ]; } || fail=1
done

# 6. the four-service allowlist must resolve fully (count enforced)
[ "$(printf '%s\n' $RT04E_ALLOW | wc -l | tr -d ' ')" = 4 ] || fail=1

if [ "$fail" != 0 ]; then printf '  attestation: FAIL — refusing to mutate\n' >&2; exit 1; fi
printf '  attestation: PASS — all four services resolve; image continuity + overlay verified\n'
