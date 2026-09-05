#!/usr/bin/env bash
# deploy.sh — Build and deploy Banzami services to production
#
# SERVICE AUTHORITY (see docs/infra/BANZAMI_SERVICE_AUTHORITY_MATRIX.md):
# after the Stage C architecture decisions, only two deploy paths are approved:
#
#   ./deploy.sh website-frontend           # institutional website (banzami.com) — approved
#   ./deploy.sh developer-api              # ┐ authoritative rt04e sandbox flow
#   ./deploy.sh core-api-staging           # │ (staging / Developer Platform runtime);
#   ./deploy.sh api-gateway-staging        # │ routed to the sandbox source-deploy
#   ./deploy.sh public-api-staging         # ┘ script — invoke these ALONE
#
# Every other service name is recognised but FAILS CLOSED: live core-api /
# api-gateway / public-api (payment rails), pay/checkout (payment surfaces),
# admin/dashboard (Stage D), sandbox-operator (pending Stage C execution
# approval), the legacy `staging` compose path and the legacy compose-based
# developer-api path are NOT approved for restore/deploy in the current
# architecture. Stage C will use the rt04e project + a dedicated sandbox-edge
# in a separately approved PR. Live rails, pay/checkout, admin/API restore and
# external providers require explicit operator approval and their own runbook.
#
# Flags: --no-cache (approved services only), BANZAMI_ASSURANCE_ONLY=1
# (evaluate gates then stop), BANZAMI_SKIP_ASSURANCE=1 (break-glass only).

set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────────

REMOTE="root@217.160.9.248"
REMOTE_COMPOSE_DIR="/srv/banzami"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

# Stamp every image with the source commit so "what commit is live?" is
# answerable from `docker inspect` instead of guessed from build timestamps.
GIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
LABEL_ARGS="--label org.opencontainers.image.revision=$GIT_SHA"

# ─── Single source-of-truth preflight guard ───────────────────────────────────
# The only authorised local Banzami working directory is /Users/fm65/banzami.
# Refuse to run from a duplicate checkout (e.g. banzami-canonical) or from any repo
# whose remote is not banza-protocol/banzami. Runs before any routing/action below.
# See docs/infra/BANZAMI_SINGLE_SOURCE_OF_TRUTH.md.
_ssot_die(){
  printf '\n\033[0;31m✗ ERROR: Wrong Banzami working directory. Use the single authorised local repository: /Users/fm65/banzami. Do not use banzami-canonical or any duplicate checkout.\033[0m\n\n' >&2
  exit 1
}
_ssot_root="$(git -C "$REPO_ROOT" rev-parse --show-toplevel 2>/dev/null || echo "$REPO_ROOT")"
case "$_ssot_root" in *banzami-canonical*) _ssot_die ;; esac        # explicitly reject the duplicate checkout
[ "$(basename "$_ssot_root")" = "banzami" ] || _ssot_die            # worktree root basename must be exactly "banzami"
case "$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null || true)" in
  *banza-protocol/banzami|*banza-protocol/banzami.git) : ;;         # remote must be banza-protocol/banzami
  *) _ssot_die ;;
esac

ALL_SERVICES=(core-api admin-api api-gateway public-api sandbox-operator developer-api admin-frontend dashboard-frontend pay-frontend website-frontend staging)

# ─── Colour helpers ───────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

step()    { printf "\n${BOLD}${CYAN}[%s]${NC} %s\n" "$1" "$2"; }
ok()      { printf "  ${GREEN}✓${NC} %s\n" "$*"; }
warn()    { printf "  ${YELLOW}⚠${NC}  %s\n" "$*"; }
die()     { printf "\n  ${RED}✗ %s${NC}\n\n" "$*"; exit 1; }
info()    { printf "  %s\n" "$*"; }

# ─── Service authority gate (fail-closed) ─────────────────────────────────────
# After the Stage C architecture decisions (rt04e sandbox project = authoritative
# staging/Developer Platform runtime; future Stage C = dedicated sandbox-edge;
# website-edge stays website-only), the legacy compose/live deploy paths were
# retired from this script. Recognised-but-unapproved services fail closed HERE,
# before any gate, build, transfer or deploy step. See
# docs/infra/BANZAMI_SERVICE_AUTHORITY_MATRIX.md and
# evidence/ops/COMPOSE_DEPLOY_DRIFT_RESOLUTION.md.
_deny_unapproved() {
  local svc="$1" reason="$2"
  die "'$svc' is NOT approved for restore/deploy in the current architecture ($reason).
  Approved paths: './deploy.sh website-frontend' (banzami.com) and the rt04e sandbox flow
  ('./deploy.sh developer-api|core-api-staging|api-gateway-staging|public-api-staging', invoked alone).
  Stage C will use the rt04e project + a dedicated sandbox-edge in a separately approved PR.
  Live rails, pay/checkout, admin/API restore and external providers require explicit operator
  approval and their own runbook. See docs/infra/BANZAMI_SERVICE_AUTHORITY_MATRIX.md."
}

_authority_gate() {
  local svc
  for svc in "$@"; do
    case "$svc" in
      website-frontend) : ;;  # approved — institutional website only
      core-api|api-gateway|public-api)
        _deny_unapproved "$svc" "live payment-rail service: not defined server-side; requires Stage E+ approval, rotated secrets and the ADR-034 rollout gate" ;;
      pay-frontend)
        # STAGE F APPROVED 2026-09-05 — SANDBOX SCOPE ONLY (Banzami ADR-052).
        # The owner approved this surface by name in the external-Sandbox-launch
        # brief. The approval is bounded and the boundary is enforced elsewhere,
        # not here: the surface serves whichever stack Platform Mode selects, and
        # the platform is SANDBOX. Nothing about this line approves a LIVE
        # payment surface — core-api/api-gateway/public-api below still fail
        # closed, and external provider rails remain Stage G.
        : ;;
      admin-api|admin-frontend|dashboard-frontend)
        _deny_unapproved "$svc" "admin/merchant surface: requires Stage D approval and an approved runbook" ;;
      sandbox-operator)
        _deny_unapproved "$svc" "rebuild pending explicit Stage C execution approval (Decision 5)" ;;
      developer-api)
        _deny_unapproved "$svc" "legacy compose-based path retired: invoke './deploy.sh developer-api' ALONE so it routes to the authoritative rt04e sandbox flow (Decision 1)" ;;
      staging)
        _deny_unapproved "$svc" "legacy staging deploy path retired: the rt04e sandbox project is the authoritative staging runtime (Decision 1)" ;;
      *)
        _deny_unapproved "$svc" "not part of the approved service authority matrix" ;;
    esac
  done
}

# ─── Sandbox source-bundle native-build routing ───────────────────────────────
# The internal Sandbox services deploy via the fast source-bundle native-build flow:
# ./deploy.sh <sandbox-service> creates a source bundle from the exact commit, transfers
# only the bundle+manifest+checksum, and the amd64 server builds + deploys the selected
# service natively. Local Mac linux/amd64 QEMU builds are unsupported (no fallback).
# Sandbox services and the new flags (--all, --allow-dirty, --dry-run, --build-only,
# --deploy-only-from-existing-build, --run-e2e) route here; all other (production)
# invocations are unchanged. See infra/blueprint/sandbox-ops/scripts/sandbox-source-deploy.sh.
_SANDBOX_SVCS="developer-api core-api-staging api-gateway-staging public-api-staging"
_route_sandbox() {
  local a s ok hasflag=0 hassvc=0 nonsandbox=0
  for a in "$@"; do case "$a" in
    --all|--allow-dirty|--dry-run|--build-only|--deploy-only-from-existing-build|--run-e2e) hasflag=1 ;;
    --local-amd64-build-fallback|--local-amd64*|--qemu*|--local-build*) hasflag=1 ;;  # route to Sandbox flow → refused (unsupported)
    --*) ;;  # other flags (e.g. --no-cache) belong to the production path
    *) ok=0; for s in $_SANDBOX_SVCS; do [ "$s" = "$a" ] && ok=1; done
       if [ "$ok" = 1 ]; then hassvc=1; else nonsandbox=1; fi ;;
  esac; done
  { [ "$hasflag" = 1 ] || { [ "$hassvc" = 1 ] && [ "$nonsandbox" = 0 ]; }; }
}
if _route_sandbox "$@"; then
  exec bash "$REPO_ROOT/infra/blueprint/sandbox-ops/scripts/sandbox-source-deploy.sh" "$@"
fi

# ─── Argument parsing ─────────────────────────────────────────────────────────

NO_CACHE=""
SERVICES=()

for arg in "$@"; do
  case "$arg" in
    --no-cache) NO_CACHE="--no-cache" ;;
    --*)        die "Unknown flag: $arg" ;;
    *)          SERVICES+=("$arg") ;;
  esac
done

if [ ${#SERVICES[@]} -eq 0 ]; then
  die "No service given. 'Deploy all' is retired (fail-closed): only './deploy.sh website-frontend' and the rt04e sandbox flow ('./deploy.sh developer-api|core-api-staging|api-gateway-staging|public-api-staging', invoked alone) are approved. See docs/infra/BANZAMI_SERVICE_AUTHORITY_MATRIX.md."
fi

# Validate service names
for svc in "${SERVICES[@]}"; do
  valid=false
  for s in "${ALL_SERVICES[@]}"; do [[ "$s" == "$svc" ]] && valid=true && break; done
  $valid || die "Unknown service: '$svc'. Valid: ${ALL_SERVICES[*]}"
done

# Fail closed on unapproved services BEFORE any banner/gate/build/deploy step.
_authority_gate "${SERVICES[@]}"

# ─── Per-service deploy functions ─────────────────────────────────────────────

deploy_website_frontend() {
  step "website-frontend" "Next.js official website (banzami.com)"
  _deploy_frontend "website" "website-frontend" "banzami/website-frontend:latest" "banzami-website-frontend-1"
}

# Shared frontend deploy (Next.js apps all follow the same pattern)
_deploy_frontend() {
  local app_name="$1"       # e.g. "admin"
  local compose_svc="$2"    # e.g. "admin-frontend"
  local image_tag="$3"      # e.g. "banzami/admin-frontend:latest"
  local container="$4"      # e.g. "banzami-admin-frontend-1"

  info "Syncing source to server..."
  rsync -az --delete \
    --exclude='.git' --exclude='.env' --exclude='.env.*' \
    --exclude='node_modules/' \
    --exclude='.next/' \
    "$REPO_ROOT/apps/$app_name/" \
    "$REMOTE:/srv/banzami/src/apps/$app_name/"
  ok "Sync complete"

  info "Building Docker image on server..."
  # The build's exit status is the one that matters, and piping into grep hides
  # it behind grep's. Without PIPESTATUS this reported "Image built" after a
  # failed build and then started the container on the PREVIOUS image — a
  # deploy that looked green while shipping nothing.
  set -o pipefail
  ssh "$REMOTE" "cd /srv/banzami/src/apps/$app_name && docker build $NO_CACHE $LABEL_ARGS -t $image_tag . 2>&1" \
    | grep -E "^(#[0-9]+ DONE|#[0-9]+ ERROR|error|Type error|Step|Successfully)" || true
  local build_rc=${PIPESTATUS[0]}
  set +o pipefail
  if [[ $build_rc -ne 0 ]]; then
    die "Image build FAILED for $app_name (exit $build_rc) — the running container was left untouched. Re-run the build on the host to read the full error: ssh $REMOTE 'cd /srv/banzami/src/apps/$app_name && docker build -t $image_tag .'"
  fi
  ok "Image built"

  info "Recreating container..."
  # Frontends sometimes have stale container state; force remove before up
  ssh "$REMOTE" "docker rm -f $container 2>/dev/null || true; cd $REMOTE_COMPOSE_DIR && docker compose up -d $compose_svc 2>&1"
  ok "Container started"
}

# ─── Main ─────────────────────────────────────────────────────────────────────

printf "\n${BOLD}Banzami deploy${NC} → ${CYAN}%s${NC}\n" "$REMOTE"
printf "Services: ${BOLD}%s${NC}\n" "${SERVICES[*]}"
[[ -n "$NO_CACHE" ]] && printf "${YELLOW}Mode: --no-cache (full rebuild)${NC}\n"

# ─── Deploy-time assurance gate (scope-aware) ─────────────────────────────────
# Mandatory quality gates run at deploy time on the deploy host, so enforcement
# does not depend on GitHub-hosted Actions (billing-blocked). A failing gate
# ABORTS the deploy.
#
# The gate is SCOPE-AWARE. A website-only deploy (the institutional website
# banzami.com) runs global-safety + website-specific checks only, so an emergency
# website restore does not require an assurance-skip for unrelated payment/
# platform/manifest/SDK checks. A general/full deploy runs the complete, stricter
# set. Global safety that is enforced regardless of scope: the single
# source-of-truth preflight guard at the top of this script (wrong-checkout /
# banzami-canonical rejection) and the no-local-QEMU-fallback routing — neither
# is weakened here. See docs/infra/BANZAMI_WEBSITE_RECOVERY_RUNBOOK.md.
#
# BANZAMI_SKIP_ASSURANCE=1 remains a BREAK-GLASS emergency escape only (recorded
# in the incident/repair log) — it is not the normal website recovery path.
_is_website_only=0
if [ "${#SERVICES[@]}" -eq 1 ] && [ "${SERVICES[0]}" = "website-frontend" ]; then _is_website_only=1; fi

if [ "${BANZAMI_SKIP_ASSURANCE:-0}" != "1" ]; then
  if ! command -v node >/dev/null 2>&1; then
    die "Deploy blocked: node not available for the assurance gate (set BANZAMI_SKIP_ASSURANCE=1 only for a documented emergency)"
  fi
  if [ "$_is_website_only" = 1 ]; then
    printf "\n${BOLD}Deploy-time assurance gate (website scope)${NC}\n"
    # Global structural safety + website-specific prerequisites only.
    node "$REPO_ROOT/tools/check-repository-layout.mjs"           >/dev/null || die "Deploy blocked: repository layout gate failed"
    node "$REPO_ROOT/tools/check-live-fail-closed.mjs"            >/dev/null || die "Deploy blocked: Live fail-closed guard failed"
    node "$REPO_ROOT/tools/check-website-recovery-preflight.mjs"  >/dev/null || die "Deploy blocked: website recovery preflight failed (run: node tools/check-website-recovery-preflight.mjs)"
    ok "Website assurance gate passed (layout · live-fail-closed · website preflight)"
  else
    printf "\n${BOLD}Deploy-time assurance gate${NC}\n"
    node "$REPO_ROOT/tools/check-assurance-manifest.mjs"      >/dev/null || die "Deploy blocked: assurance manifest gate failed (run: node tools/check-assurance-manifest.mjs)"
    node "$REPO_ROOT/tools/check-repository-layout.mjs"       >/dev/null || die "Deploy blocked: repository layout gate failed"
    node "$REPO_ROOT/tools/check-asset-inventory.mjs"         >/dev/null || die "Deploy blocked: asset inventory gate failed"
    node "$REPO_ROOT/tools/check-live-fail-closed.mjs"        >/dev/null || die "Deploy blocked: Live fail-closed guard failed"
    node "$REPO_ROOT/tools/check-docs-claims.mjs"             >/dev/null || die "Deploy blocked: docs↔manifest claim check failed"
    node "$REPO_ROOT/tools/check-sdk-contract.mjs"            >/dev/null || die "Deploy blocked: SDK↔manifest contract check failed"
    ok "Assurance gate passed (manifest · layout · inventory · live-fail-closed)"
  fi
fi

# Gate-only mode: evaluate the assurance gate (and the guards above) then stop
# before any build/transfer/deploy. Safe (no network, no Docker). Used to test the
# scope-aware gate without deploying. See tests/ops/website-assurance-gate.test.sh.
if [ "${BANZAMI_ASSURANCE_ONLY:-0}" = "1" ]; then
  ok "Assurance-only mode: gate evaluated for [${SERVICES[*]}]; no build/deploy performed"
  exit 0
fi

START=$(date +%s)

for svc in "${SERVICES[@]}"; do
  case "$svc" in
    website-frontend) deploy_website_frontend ;;
    # Defense in depth: _authority_gate already denied everything else.
    *) _deny_unapproved "$svc" "unreachable: authority gate must deny this earlier" ;;
  esac
done

END=$(date +%s)
ELAPSED=$((END - START))

printf "\n${GREEN}${BOLD}Deploy complete${NC} — %dm%ds\n\n" $((ELAPSED / 60)) $((ELAPSED % 60))
