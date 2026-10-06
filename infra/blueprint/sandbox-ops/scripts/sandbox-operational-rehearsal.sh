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

# The zero-residue proof is RUN-SCOPED, by baseline diff: it asserts the rehearsal
# left nothing behind, not that the host is pristine. During a blue/green rebuild
# the OLD Sandbox stack stays alive (a different RUNID, intentionally), and the host
# may carry unrelated pre-existing blueprint cruft (old builders, old package roots).
# Those are captured in the baseline at the start of the run and ignored; only a
# resource the rehearsal ADDED and did not clean up fails the check.
BASELINE_FILE="${TMPDIR:-/tmp}/banzami-blueprint-rehearsal.baseline"
_bp_fingerprint() {
  local L
  for L in com.banzami.blueprint.sandbox com.banzami.blueprint.sandbox-migration com.banzami.blueprint.sandbox-deploy com.banzami.blueprint.sandbox-executor; do
    docker ps -a --filter "label=$L" --format "container $L {{.Names}}" 2>/dev/null || true
    docker volume ls --filter "label=$L" --format "volume $L {{.Name}}" 2>/dev/null || true
    docker network ls --filter "label=$L" --format "network $L {{.Name}}" 2>/dev/null || true
  done
  docker buildx ls 2>/dev/null | awk '/bzrelease-|bzrunnerlab-/{gsub(/\*/,"",$1); print "builder "$1}' || true
  docker image ls --filter 'label=com.banzami.blueprint.service-lab' --format "image {{.Repository}}:{{.Tag}}@{{.ID}}" 2>/dev/null || true
  local base dd
  for base in banzami-blueprint-sandbox banzami-blueprint-release; do
    dd="${TMPDIR:-/tmp}/$base"
    [ -d "$dd" ] && find "$dd" -maxdepth 1 -type d \( -name 'root-*' -o -name 'pkg-*' \) 2>/dev/null | sed 's/^/root /' || true
  done
  return 0
}
_capture_baseline() { _bp_fingerprint | sort -u > "$BASELINE_FILE"; _BASELINE_CAPTURED=1; }

do_build()  { echo "== E: build + verify release package =="; bash "$RP" build && bash "$RP" verify; }
do_run()    {
  # Capture the pre-run baseline (OLD stack + any pre-existing cruft) so the
  # residue proof is scoped to what THIS run adds. Fresh per `run` process; skipped
  # only when do_full already captured it before do_build.
  [ -n "${_BASELINE_CAPTURED:-}" ] || _capture_baseline
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
  if [ -f "$BASELINE_FILE" ]; then
    # Run-scoped: fail only on blueprint resources this run added and did not clean
    # up (present now, absent at the baseline). The OLD live stack and any
    # pre-existing cruft are in the baseline and ignored.
    local cur new
    cur="$(_bp_fingerprint | sort -u)"
    new="$(comm -13 "$BASELINE_FILE" <(printf '%s\n' "$cur") | sed '/^$/d')"
    rm -f "$BASELINE_FILE" 2>/dev/null || true
    if [ -z "$new" ]; then echo "REHEARSAL_RESIDUE: PASS (run-scoped; pre-existing stacks/cruft ignored)"; return 0; fi
    printf '%s\n' "$new" | sed 's/^/  RESIDUE (added by this run, not cleaned) /'
    echo "REHEARSAL_RESIDUE: FAIL"; return 1
  fi
  # Fallback (no baseline, e.g. `residue` called standalone on a clean host): the
  # strict host-wide zero-residue check.
  local bad=0 L c i n v
  for L in com.banzami.blueprint.sandbox com.banzami.blueprint.sandbox-migration com.banzami.blueprint.sandbox-deploy com.banzami.blueprint.sandbox-executor; do
    c="$(docker ps -aq --filter "label=$L" 2>/dev/null | grep -c . || true)"
    i="$(docker image ls -aq --filter "label=$L" 2>/dev/null | grep -c . || true)"
    n="$(docker network ls -q --filter "label=$L" 2>/dev/null | grep -c . || true)"
    v="$(docker volume ls -q --filter "label=$L" 2>/dev/null | grep -c . || true)"
    [ "$c" = 0 ] && [ "$i" = 0 ] && [ "$n" = 0 ] && [ "$v" = 0 ] || { echo "  RESIDUE $L c=$c i=$i n=$n v=$v"; bad=1; }
  done
  local b; b="$(docker buildx ls 2>/dev/null | grep -c 'bzrelease-\|bzrunnerlab-' || true)"; [ "$b" = 0 ] || { echo "  RESIDUE builders=$b"; bad=1; }
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
  _capture_baseline   # baseline BEFORE do_build, so build artifacts are in scope too
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
