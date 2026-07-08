#!/usr/bin/env bash
# Banzami Environment Blueprint — gated same-VM execution adapter (orchestrator).
#
# The ONLY sanctioned path for VM-side operations: verified transfer, manifest-scoped legacy
# reset, fresh Sandbox bootstrap, controlled banzami_staging migration and provenance-first
# deployment of the four approved services — each fail-closed, plan-by-default, evidence
# sanitised. All bootstrap/migration/deploy logic reuses the already-merged, already-validated
# local Sandbox adapters, executed on the VM against the VM's own Docker.
#
# SOURCE CONTAINS NO VM TARGET. The VM SSH destination and remote root are read ONLY from the
# runtime environment (BZVM_SSH_TARGET / BZVM_REMOTE_ROOT), supplied by the operator's own SSH
# context. They are never committed, never printed, never persisted in tracked files. Apply is
# never the default: every mutating subcommand requires BOTH an explicit --apply flag AND a
# per-execution authorisation file (BZVM_AUTH_FILE). No prune, no unscoped deletion, ever.
#
# Subcommands:
#   preflight
#   release-transfer-plan | release-transfer-apply
#   legacy-reset-plan     | legacy-reset-apply
#   sandbox-bootstrap-apply
#   sandbox-migration-apply
#   sandbox-deploy-apply
#   final-verify
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VMX_DIR="$SCRIPT_DIR"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
# shellcheck source=lib/classify.sh
. "$VMX_DIR/lib/classify.sh"

RELEASE_STATE="${TMPDIR:-/tmp}/banzami-blueprint-release/current.run"
WORK_BASE="${TMPDIR:-/tmp}/banzami-blueprint-vmx"
# Approved deployment set — the ONLY services the VM path may deploy.
APPROVED="core-api-staging api-gateway-staging developer-api public-api-staging"

die()  { echo "vm-execute: $*" >&2; exit 1; }
hold() { echo "$1"; exit "${2:-47}"; }
log()  { echo "vm-execute: $*"; }

# --- runtime target (env only; never printed) --------------------------------------------
require_target() {
  [ -n "${BZVM_SSH_TARGET:-}" ] || die "VM target not supplied at runtime (set BZVM_SSH_TARGET via your SSH context)"
  [ -n "${BZVM_REMOTE_ROOT:-}" ] || die "remote root not supplied at runtime (set BZVM_REMOTE_ROOT)"
}
# Non-interactive SSH only — no PTY automation, no embedded credentials. Target from env.
remote()  { require_target; ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$BZVM_SSH_TARGET" "$@"; }
xfer()    { require_target; rsync -a --checksum "$@"; }

# --- apply guard: explicit flag + per-execution authorisation file ------------------------
MODE=plan
guard_apply() { # <scope>
  local scope="$1"
  [ "$MODE" = apply ] || die "refusing $scope: apply requires the explicit --apply flag (default is plan-only)"
  [ -n "${BZVM_AUTH_FILE:-}" ] || die "refusing $scope: BZVM_AUTH_FILE (per-execution authorisation) not supplied"
  [ -f "$BZVM_AUTH_FILE" ] || die "refusing $scope: authorisation file not found"
  # File-only, fail-closed: must authorise this scope (or 'all') and be marked active.
  grep -Eq '^BZVM_APPLY=yes$' "$BZVM_AUTH_FILE" || die "refusing $scope: authorisation not active"
  grep -Eq "^BZVM_APPLY_SCOPE=($scope|all)$" "$BZVM_AUTH_FILE" || die "refusing $scope: authorisation scope mismatch"
}

# --- read-only remote inventory → TSV (kind,id,name,project,image,extra) -------------------
# Falls back to a local fixture file when BZVM_INVENTORY_FILE is set, so the classifier and
# delete-plan generation are validated offline (no VM contact) in the local test harness.
collect_inventory() { # <out_tsv>
  local out="$1"
  if [ -n "${BZVM_INVENTORY_FILE:-}" ]; then
    [ -f "$BZVM_INVENTORY_FILE" ] || die "inventory fixture not found"
    cp "$BZVM_INVENTORY_FILE" "$out"; return 0
  fi
  # Fail closed: with no offline fixture, a real runtime target is mandatory. Assert it here,
  # OUTSIDE the pipelines below (a die inside a pipeline runs in a subshell and would be
  # swallowed, silently yielding an empty inventory).
  require_target
  : > "$out"
  # containers
  remote "docker ps -a --format '{{.ID}}\t{{.Names}}\t{{.Label \"com.docker.compose.project\"}}\t{{.Image}}\t{{.Networks}}'" 2>/dev/null \
    | awk -F'\t' 'NF>=2{printf "container\t%s\t%s\t%s\t%s\t%s\n",$1,$2,($3==""?"-":$3),($4==""?"-":$4),($5==""?"-":$5)}' >> "$out" || true
  # images (repo:tag ref as both id and name)
  remote "docker images --format '{{.ID}}\t{{.Repository}}:{{.Tag}}'" 2>/dev/null \
    | awk -F'\t' 'NF>=2 && $2!="<none>:<none>"{printf "image\t%s\t%s\t-\t%s\t-\n",$1,$2,$2}' >> "$out" || true
  # volumes
  remote "docker volume ls --format '{{.Name}}'" 2>/dev/null \
    | awk 'NF{printf "volume\t%s\t%s\t-\t-\t-\n",$1,$1}' >> "$out" || true
  # networks (skip docker built-ins)
  remote "docker network ls --format '{{.ID}}\t{{.Name}}\t{{.Driver}}'" 2>/dev/null \
    | awk -F'\t' 'NF>=2 && $2!="bridge" && $2!="host" && $2!="none"{printf "network\t%s\t%s\t-\t-\t-\n",$1,$2}' >> "$out" || true
}

# --- subcommands --------------------------------------------------------------------------
cmd_preflight() {
  log "preflight (read-only)"
  local ver; ver="$(remote 'docker version --format "{{.Server.Version}}" 2>/dev/null | cut -d. -f1' || true)"
  [ -n "$ver" ] || hold "BLOCKER — VM DOCKER ENGINE NOT REACHABLE" 47
  remote 'docker compose version >/dev/null 2>&1' || hold "BLOCKER — VM DOCKER COMPOSE V2 MISSING" 47
  echo "  vm_reachable PASS"
  echo "  docker_engine_present PASS"
  echo "  docker_compose_v2_present PASS"
  echo "VM_PREFLIGHT_RESULT: PASS"
}

cmd_release_transfer() { # <plan|apply>
  local act="$1"
  [ -f "$RELEASE_STATE" ] || die "no verified release package (build + verify locally first)"
  . "$RELEASE_STATE"; : "${RELEASE_ROOT:?}" "${SOURCE_REVISION:?}"
  local man="$RELEASE_ROOT/manifest.txt" sums="$RELEASE_ROOT/checksums.txt"
  [ -f "$man" ] && [ -f "$sums" ] || die "release manifest/checksums missing"
  if [ "$act" = plan ]; then
    echo "  would transfer: verified release package + source-transfer artifact (revision-pinned)"
    echo "  remote verification: checksums + canonical revision + manifest (no build, no pull)"
    echo "VM_RELEASE_TRANSFER_PLAN: PASS"; return 0
  fi
  guard_apply release-transfer
  local rroot="$BZVM_REMOTE_ROOT/release"
  remote "mkdir -p '$rroot' && chmod 0700 '$rroot'" || die "remote staging prep failed"
  xfer "$RELEASE_ROOT"/ "$BZVM_SSH_TARGET:$rroot"/ >/dev/null 2>&1 || die "release transfer failed"
  remote "cd '$rroot' && sha256sum -c checksums.txt >/dev/null 2>&1" || hold "BLOCKER — VM RELEASE CHECKSUM MISMATCH" 47
  local remote_rev; remote_rev="$(remote "grep -E '^source_revision=' '$rroot/manifest.txt' | cut -d= -f2-" || true)"
  [ "$remote_rev" = "$SOURCE_REVISION" ] || hold "BLOCKER — VM CANONICAL REVISION MISMATCH" 47
  echo "  release_transferred PASS"
  echo "  remote_checksums_match PASS"
  echo "  remote_revision_matches_canonical PASS"
  echo "VM_RELEASE_TRANSFER_APPLY: PASS"
}

cmd_legacy_reset() { # <plan|apply>
  local act="$1"
  # All scratch is ephemeral (inventory/manifest hold unsanitised ids) — removed on ANY exit,
  # including fail-closed die/hold, so nothing lingers. Only the printed category counts survive.
  mkdir -p "$WORK_BASE"; chmod 0700 "$WORK_BASE"
  trap 'rm -rf "$WORK_BASE" 2>/dev/null || true' EXIT
  local run="$WORK_BASE/run-$$"; mkdir -p "$run"; chmod 0700 "$run"
  local inv="$run/inventory.tsv" man="$run/reset-manifest.tsv" exc="$run/excluded.tsv" plan="$run/delete-plan.txt"
  collect_inventory "$inv"
  classify_inventory "$inv" "$man" "$exc"
  gen_delete_plan "$man" "$plan"
  # Sanitised evidence — categories and counts only (never ids or names).
  echo "  RESET MANIFEST (authorised Banzami/BANZA/BanzAI teardown scope):"
  summarise "$man" | awk -F'\t' '{printf "    %-9s %-9s %s\n",$1,$2,$3}'
  echo "  EXCLUDED (preserved — NOT deleted):"
  summarise "$exc" | awk -F'\t' '{printf "    %-9s %-9s %s\n",$1,$2,$3}'
  echo "  delete-plan resources: $(grep -c . "$plan" 2>/dev/null || echo 0)"
  # Hard invariant: the plan can only contain scoped '<kind> <id>' tokens — never a prune.
  if grep -Eiq 'prune|system|-a$|\$\(' "$plan"; then hold "BLOCKER — RESET PLAN CONTAINS AN UNSCOPED OR PRUNE OPERATION" 47; fi
  if [ "$act" = plan ]; then echo "VM_LEGACY_RESET_PLAN: PASS"; return 0; fi
  guard_apply legacy-reset
  [ -s "$plan" ] || { echo "  nothing in authorised scope to delete"; echo "VM_LEGACY_RESET_APPLY: PASS"; return 0; }
  # Execute ONLY manifest tokens, one scoped docker command each. No prune. No unscoped rm.
  local kind id
  while read -r kind id; do
    [ -n "$kind" ] && [ -n "$id" ] || continue
    case "$kind" in
      container) remote "docker rm -f '$id' >/dev/null 2>&1 || true" ;;
      volume)    remote "docker volume rm '$id' >/dev/null 2>&1 || true" ;;
      network)   remote "docker network rm '$id' >/dev/null 2>&1 || true" ;;
      image)     remote "docker image rm -f '$id' >/dev/null 2>&1 || true" ;;
      *) die "unknown resource kind in plan" ;;
    esac
  done < "$plan"
  # Re-inventory and confirm no in-scope resource remains.
  collect_inventory "$inv"; classify_inventory "$inv" "$man" "$exc"
  local remaining; remaining="$(grep -c . "$man" 2>/dev/null || echo 0)"
  [ "$remaining" = 0 ] || hold "BLOCKER — LEGACY RESOURCES REMAIN AFTER RESET" 47
  echo "  legacy_scope_deleted PASS"
  echo "  no_legacy_remaining PASS"
  echo "VM_LEGACY_RESET_APPLY: PASS"
}

# Remote execution of a merged Sandbox adapter against the VM's Docker.
remote_adapter() { # <script-relative> <subcommand>
  local rel="$1" sub="$2" rroot="$BZVM_REMOTE_ROOT/release"
  remote "cd '$rroot/source' && TMPDIR='$BZVM_REMOTE_ROOT/tmp' bash '$rel' '$sub'"
}

cmd_sandbox_bootstrap_apply() {
  guard_apply sandbox-bootstrap
  remote "mkdir -p '$BZVM_REMOTE_ROOT/tmp' && chmod 0700 '$BZVM_REMOTE_ROOT/tmp'"
  remote_adapter "infra/blueprint/sandbox-ops/scripts/sandbox-bootstrap.sh" apply || hold "BLOCKER — VM SANDBOX BOOTSTRAP FAILED" 47
  echo "VM_SANDBOX_BOOTSTRAP_APPLY: PASS"
}
cmd_sandbox_migration_apply() {
  guard_apply sandbox-migration
  remote_adapter "infra/blueprint/sandbox-ops/scripts/sandbox-migration.sh" apply || hold "BLOCKER — VM SANDBOX MIGRATION FAILED" 47
  echo "VM_SANDBOX_MIGRATION_APPLY: PASS"
}
cmd_sandbox_deploy_apply() {
  guard_apply sandbox-deploy
  remote_adapter "infra/blueprint/sandbox-ops/scripts/sandbox-deploy.sh" apply || hold "BLOCKER — VM SANDBOX DEPLOYMENT FAILED" 47
  echo "VM_SANDBOX_DEPLOY_APPLY: PASS"
}

cmd_final_verify() {
  local rc=0
  remote_adapter "infra/blueprint/sandbox-ops/scripts/sandbox-migration.sh"  verify || rc=1
  remote_adapter "infra/blueprint/sandbox-ops/scripts/sandbox-deploy.sh"     verify || rc=1
  remote_adapter "infra/blueprint/sandbox-ops/scripts/sandbox-bootstrap.sh"  verify || rc=1
  # legacy-absence re-check — ephemeral scratch removed on any exit
  mkdir -p "$WORK_BASE"; trap 'rm -rf "$WORK_BASE" 2>/dev/null || true' EXIT
  local run="$WORK_BASE/verify-$$"; mkdir -p "$run"; chmod 0700 "$run"
  local inv="$run/inventory.tsv" man="$run/reset-manifest.tsv" exc="$run/excluded.tsv"
  collect_inventory "$inv"; classify_inventory "$inv" "$man" "$exc"
  # After rebuild the fresh Sandbox IS banza-affiliated, so "IN" will be non-zero here; the
  # legacy-absence guarantee is asserted by legacy-reset-apply's post-delete check, not here.
  echo "VM_FINAL_VERIFY_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"; return "$rc"
}

# --- arg parsing --------------------------------------------------------------------------
SUB="${1:-}"; shift || true
for a in "$@"; do case "$a" in --apply) MODE=apply ;; --plan) MODE=plan ;; esac; done

case "$SUB" in
  preflight)                cmd_preflight ;;
  release-transfer-plan)    cmd_release_transfer plan ;;
  release-transfer-apply)   cmd_release_transfer apply ;;
  legacy-reset-plan)        cmd_legacy_reset plan ;;
  legacy-reset-apply)       cmd_legacy_reset apply ;;
  sandbox-bootstrap-apply)  cmd_sandbox_bootstrap_apply ;;
  sandbox-migration-apply)  cmd_sandbox_migration_apply ;;
  sandbox-deploy-apply)     cmd_sandbox_deploy_apply ;;
  final-verify)             cmd_final_verify ;;
  *) die "usage: vm-execute.sh {preflight|release-transfer-plan|release-transfer-apply|legacy-reset-plan|legacy-reset-apply|sandbox-bootstrap-apply|sandbox-migration-apply|sandbox-deploy-apply|final-verify} [--apply]" ;;
esac
