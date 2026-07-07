#!/usr/bin/env bash
# Banzami Environment Blueprint — Increment 2F unified local completion lab.
#
# LOCAL · SYNTHETIC · DISPOSABLE · non-deploying · non-VM. Orchestrates every validated
# local Blueprint phase in order, fail-closed, from clean state, then proves host-wide
# zero residue across all lab categories. Preserves and reuses each standalone target;
# does not weaken any earlier validator. Never invokes the VM or deploys services.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

LABELS=(com.banzami.blueprint.lab com.banzami.blueprint.runner-lab com.banzami.blueprint.migration-lab com.banzami.blueprint.migration-identity com.banzami.blueprint.migration-control)
TMPBASES=(banzami-blueprint-lab banzami-blueprint-runner-lab banzami-blueprint-migration-lab banzami-blueprint-migration-identity banzami-blueprint-migration-control)

phase() { echo ""; echo "########## $1 ##########"; }
run() { echo "+ $*"; "$@"; }

residue_zero() { # prove host-wide zero residue across ALL categories
  local bad=0 L b
  for L in "${LABELS[@]}"; do
    local c i n v
    c="$(docker ps -aq --filter "label=$L" 2>/dev/null | grep -c . || true)"
    i="$(docker image ls -aq --filter "label=$L" 2>/dev/null | grep -c . || true)"
    n="$(docker network ls -q --filter "label=$L" 2>/dev/null | grep -c . || true)"
    v="$(docker volume ls -q --filter "label=$L" 2>/dev/null | grep -c . || true)"
    [ "$c" = 0 ] && [ "$i" = 0 ] && [ "$n" = 0 ] && [ "$v" = 0 ] || { echo "  RESIDUE in $L: c=$c i=$i n=$n v=$v"; bad=1; }
  done
  b="$(docker buildx ls 2>/dev/null | grep -c 'bzrunnerlab-\|bzmigrationidentity-\|bzmigrationcontrol-' || true)"
  [ "$b" = 0 ] || { echo "  RESIDUE builders=$b"; bad=1; }
  local base roots=0
  for base in "${TMPBASES[@]}"; do
    local d="${TMPDIR:-/tmp}/$base"
    [ -d "$d" ] && roots=$((roots + $(find "$d" -maxdepth 1 -type d \( -name 'artifacts-*' -o -name 'secrets-*' -o -name 'state-*' \) 2>/dev/null | wc -l | tr -d ' ')))
  done
  [ "$roots" = 0 ] || { echo "  RESIDUE temp roots=$roots"; bad=1; }
  [ "$bad" = 0 ] && echo "RESIDUE_ZERO: PASS" || { echo "RESIDUE_ZERO: FAIL"; return 1; }
}

do_full() {
  local rc=0
  echo "complete-lab: static gates"
  for g in check-blueprint check-blueprint-lab check-blueprint-runner-build check-blueprint-migration-lab check-blueprint-migration-identity check-blueprint-migration-control; do
    make "$g" >/dev/null 2>&1 || { echo "  static gate $g FAILED"; rc=1; }
  done
  echo "  static gates: $([ "$rc" = 0 ] && echo PASS || echo FAIL)"

  phase "2A role/bootstrap lab";            bash infra/blueprint/lab/scripts/lab.sh full >/tmp/2a.$$ 2>&1 && grep -q 'LAB_FULL_RESULT: PASS' /tmp/2a.$$ && echo "2A: PASS" || { echo "2A: FAIL"; tail -3 /tmp/2a.$$; rc=1; }; rm -f /tmp/2a.$$
  phase "2C canonical migration db lab";    bash infra/blueprint/migration-lab/scripts/migration-lab.sh full >/tmp/2c.$$ 2>&1 && grep -q 'MIGRATION_LAB_FULL_RESULT: PASS' /tmp/2c.$$ && echo "2C: PASS" || { echo "2C: FAIL"; tail -3 /tmp/2c.$$; rc=1; }; rm -f /tmp/2c.$$
  phase "2D derived attestation + short-lived login"; bash infra/blueprint/migration-identity/scripts/migration-identity.sh full >/tmp/2d.$$ 2>&1 && grep -q 'MIGRATION_IDENTITY_FULL_RESULT: PASS' /tmp/2d.$$ && echo "2D: PASS" || { echo "2D: FAIL"; tail -3 /tmp/2d.$$; rc=1; }; rm -f /tmp/2d.$$
  phase "2E authorisation/receipt/lock/file-only"; bash infra/blueprint/migration-control/scripts/migration-control.sh full >/tmp/2e.$$ 2>&1 && grep -q 'MIGRATION_CONTROL_FULL_RESULT: PASS' /tmp/2e.$$ && echo "2E: PASS" || { echo "2E: FAIL"; tail -8 /tmp/2e.$$; rc=1; }; rm -f /tmp/2e.$$
  # (2B is exercised as the attested runner handoff inside 2D and 2E.)

  phase "host-wide zero-residue"; residue_zero || rc=1
  echo ""; echo "COMPLETE_LAB_RESULT: $([ "$rc" = 0 ] && echo PASS || echo FAIL)"; return "$rc"
}

case "${1:-full}" in
  full) do_full ;;
  residue) residue_zero ;;
  *) echo "usage: complete-lab.sh {full|residue}" >&2; exit 2 ;;
esac
