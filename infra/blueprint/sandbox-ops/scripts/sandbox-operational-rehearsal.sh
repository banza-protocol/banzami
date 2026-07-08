#!/usr/bin/env bash
# Banzami Environment Blueprint — full local operational rehearsal (adapter E).
#
# LOCAL · SYNTHETIC · DISPOSABLE · non-deploying-to-VM. Runs the complete operational chain
# against a disposable local Sandbox whose test database is named banzami_staging (test data
# only — NOT the VM database, NOT a real Sandbox, NOT LIVE): release package → bootstrap →
# controlled migration (authorisation/receipt/advisory-lock) → provenance-first deployment of
# the four approved services → health/ownership/secret/isolation verification → guarded
# teardown → zero-residue proof. Never contacts the VM; no global prune.
#
# Subcommands: build | run | verify | clean | residue | full
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RP="$SCRIPT_DIR/sandbox-release-package.sh"
BOOT="$SCRIPT_DIR/sandbox-bootstrap.sh"
MIG="$SCRIPT_DIR/sandbox-migration.sh"
DEP="$SCRIPT_DIR/sandbox-deploy.sh"
run() { echo "+ $*"; "$@"; }

do_build()  { echo "== E: build + verify release package =="; bash "$RP" build && bash "$RP" verify; }
do_run()    {
  echo "== E: bootstrap isolated Sandbox (banzami_staging test db) =="; bash "$BOOT" apply
  echo "== E: controlled operational migration =="; bash "$MIG" apply
  echo "== E: provenance-first deployment (4 services, one at a time) =="; bash "$DEP" apply
}
do_verify() {
  local rc=0
  echo "== E: migration verification =="; bash "$MIG" verify || rc=1
  echo "== E: deployment verification (health/non-root/secret/port/identity) =="; bash "$DEP" verify || rc=1
  echo "== E: bootstrap isolation verification =="; bash "$BOOT" verify || rc=1
  echo "REHEARSAL_VERIFY_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"; return "$rc"
}
do_clean()  {
  echo "== E: guarded teardown =="
  bash "$DEP" clean  >/dev/null 2>&1 || true
  bash "$MIG" clean  >/dev/null 2>&1 || true
  bash "$BOOT" clean >/dev/null 2>&1 || true
  bash "$RP" clean   >/dev/null 2>&1 || true
  echo "sandbox-operational-rehearsal: teardown done"
}
do_residue() {
  local bad=0 L c i n v
  for L in com.banzami.blueprint.sandbox com.banzami.blueprint.sandbox-migration com.banzami.blueprint.sandbox-deploy com.banzami.blueprint.sandbox-executor; do
    c="$(docker ps -aq --filter "label=$L" 2>/dev/null | grep -c . || true)"
    i="$(docker image ls -aq --filter "label=$L" 2>/dev/null | grep -c . || true)"
    n="$(docker network ls -q --filter "label=$L" 2>/dev/null | grep -c . || true)"
    v="$(docker volume ls -q --filter "label=$L" 2>/dev/null | grep -c . || true)"
    [ "$c" = 0 ] && [ "$i" = 0 ] && [ "$n" = 0 ] && [ "$v" = 0 ] || { echo "  RESIDUE $L c=$c i=$i n=$n v=$v"; bad=1; }
  done
  local b; b="$(docker buildx ls 2>/dev/null | grep -c 'bzrelease-\|bzrunnerlab-' || true)"; [ "$b" = 0 ] || { echo "  RESIDUE builders=$b"; bad=1; }
  # temp roots (sandbox + release) + loaded service images
  local base roots=0
  for base in banzami-blueprint-sandbox banzami-blueprint-release; do
    local dd="${TMPDIR:-/tmp}/$base"; [ -d "$dd" ] && roots=$((roots + $(find "$dd" -maxdepth 1 -type d \( -name 'root-*' -o -name 'pkg-*' \) 2>/dev/null | wc -l | tr -d ' ')))
  done
  [ "$roots" = 0 ] || { echo "  RESIDUE temp roots=$roots"; bad=1; }
  local svc; svc="$(docker image ls -q --filter 'label=com.banzami.blueprint.service-lab' 2>/dev/null | grep -c . || true)"; [ "$svc" = 0 ] || { echo "  RESIDUE service images=$svc"; bad=1; }
  [ "$bad" = 0 ] && echo "REHEARSAL_RESIDUE: PASS" || { echo "REHEARSAL_RESIDUE: FAIL"; return 1; }
}
do_full() {
  local rc=0
  trap 'do_clean >/dev/null 2>&1 || true' EXIT
  do_build || rc=1
  do_run || rc=1
  do_verify || rc=1
  do_clean
  trap - EXIT
  do_residue || rc=1
  echo "SANDBOX_OPERATIONAL_REHEARSAL_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"; return "$rc"
}

case "${1:-full}" in
  build) do_build ;; run) do_run ;; verify) do_verify ;; clean) do_clean ;; residue) do_residue ;; full) do_full ;;
  *) echo "usage: sandbox-operational-rehearsal.sh {build|run|verify|clean|residue|full}" >&2; exit 2 ;;
esac
