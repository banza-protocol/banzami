#!/usr/bin/env bash
# =============================================================================
# RT04E secure Sandbox provenance rollout runner — REVIEWED TEMPLATE, NOT AUTO-RUN
# =============================================================================
# SCOPE (repaired):
#   RT04E proves canonical Sandbox runtime provenance and deployment integrity ONLY.
#   It does NOT prove feature release, authentication, developer-console access,
#   payment, transfer, refund, webhook, QR, mobile or financial E2E behaviour.
#   NO financial/E2E step runs here.
#
# It builds ONLY from canonical source (/srv/banzami/src @ RT04E_RELEASE_REV),
# deploys ONLY the four allowlisted Sandbox services from the target contract,
# captures pre-state images for rollback, and verifies every replaced image
# carries the canonical revision label before concluding health success.
#
# Credential memory handling (precise — no overclaim):
#   BANZAMI_MIGRATE_URL is handed off ONCE via protected stdin, injected only into
#   the single migrate-and-verify subprocess env, and unset on exit. Bash provides
#   scope/lifetime control only — NOT a cryptographic memory wipe.
#
# Invoke (operator, from the secure credential environment):
#   RT04E_RELEASE_REV=<approved-sha> BANZAMI_DB_TARGET=banzami_staging \
#   RT04E_CHECKPOINT_CONFIRMED=yes RT04E_BACKUP_CONFIRMED=yes \
#     /root/rt04e-secure-rollout.sh < <(operator-secret-get banzami/staging/migrate_url)
# -----------------------------------------------------------------------------
set -euo pipefail
set +x
export PS4=''
umask 077

# ── R5: canonical source root only (no /srv/banzami/repo, no legacy, no arbitrary) ─
CANONICAL_ROOT="/srv/banzami/src"
REPO_ROOT="${BANZAMI_REPO_ROOT:-$CANONICAL_ROOT}"   # defaults ONLY to canonical
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd 2>/dev/null || echo)"
CONTRACT="$REPO_ROOT/infra/deployment/rt04e-sandbox-target-contract.yaml"
DEPLOY_ADAPTER="$REPO_ROOT/infra/deployment/rt04e-sandbox-deploy.sh"
ROLLBACK="$REPO_ROOT/infra/deployment/rt04e-sandbox-rollback.sh"
CHECKPOINT="$REPO_ROOT/infra/deployment/rt04e-migration-checkpoint.sh"
ATTEST="$REPO_ROOT/infra/deployment/rt04e-sandbox-attest.sh"
LOCK_FILE="${RT04E_LOCK_FILE:-/run/lock/rt04e-rollout.lock}"

status() { printf '  %s\n' "$1"; }
die()    { printf 'rollout: FAILED — %s\n' "$1" >&2; exit "${2:-1}"; }

# reject legacy / non-canonical source roots
case "$REPO_ROOT" in
  "$CANONICAL_ROOT") : ;;
  *legacy-src-retired*|*banzami-forensics*|*/srv/banzami/repo*|*banzami/banzami*)
    die "source root references a legacy/non-canonical path — refusing" 11 ;;
  *) die "REPO_ROOT must resolve exactly to $CANONICAL_ROOT — refusing" 11 ;;
esac

# ── 0. Refuse argv secrets, Production/Live, wrong DB target ──────────────────
[ "$#" -eq 0 ] || die "the migration credential must NOT be passed as an argument" 2
: "${BANZAMI_DB_TARGET:?set BANZAMI_DB_TARGET (must be banzami_staging)}"
case "$BANZAMI_DB_TARGET" in
  banzami_staging) : ;;
  *prod*|*production*|*live*|banzami) die "target '$BANZAMI_DB_TARGET' is Production/Live — refusing" 3 ;;
  *) die "unrecognised target '$BANZAMI_DB_TARGET' — refusing" 3 ;;
esac
[ "${I_ACK_PRODUCTION_TARGET:-}" = "" ] || die "production acknowledgement flag must NOT be set — refusing" 3

# ── 1. Exclusive lock (fail closed on contention) ────────────────────────────
{ exec 9>"$LOCK_FILE"; } 2>/dev/null || die "cannot acquire rollout lock — refusing" 10
flock -n 9 || die "another rollout is already in progress — refusing" 10

# ── 2. Pin revision, clean worktree, expected branch, NO remotes ─────────────
: "${RT04E_RELEASE_REV:?set RT04E_RELEASE_REV (the approved immutable release revision)}"
cd "$REPO_ROOT" || die "canonical checkout not found — refusing" 11
[ -z "$(git status --porcelain 2>/dev/null)" ] || die "worktree is dirty — refusing" 11
[ "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" = "main" ] || die "not on branch main — refusing" 11
[ -z "$(git remote 2>/dev/null)" ] || die "canonical checkout must have NO git remotes — refusing" 11
_head="$(git rev-parse HEAD 2>/dev/null || true)"
[ -n "$_head" ] && [ "$_head" = "$RT04E_RELEASE_REV" ] || die "checked-out revision does not match RT04E_RELEASE_REV — refusing" 11
# the runner performs NO git state change (no pull/reset/clean/checkout/commit/push).
status "revision pinned (${RT04E_RELEASE_REV:0:12}) · branch main · worktree clean · no remotes"

# ── 2b. Generate the IMMUTABLE RT04E image override (root-owned, OUTSIDE repo) ──
# Substitutes the strictly-validated hex revision literally (sed, never shell eval)
# into the source-controlled template. This override pins each service image to
# banzami/<repo>:rt04e-<rev> and is the FINAL Compose layer — no mutable tag is ever
# the deployed reference. Removed on exit (or retained only as sanitised evidence).
. "$REPO_ROOT/infra/deployment/rt04e-sandbox-lib.sh"
rt04e_valid_rev "$RT04E_RELEASE_REV" || die "RT04E_RELEASE_REV is not a valid git revision — refusing" 11
OVERRIDE_TEMPLATE="$REPO_ROOT/infra/deployment/rt04e-sandbox-images.override.template.yml"
[ -f "$OVERRIDE_TEMPLATE" ] || die "RT04E image override template missing — refusing" 12
RT04E_OVERRIDE="$(mktemp "${TMPDIR:-/run}/rt04e-override.XXXXXX.yml" 2>/dev/null || mktemp)"
chmod 600 "$RT04E_OVERRIDE"; export RT04E_OVERRIDE
sed "s/{{RT04E_RELEASE_REV}}/${RT04E_RELEASE_REV}/g" "$OVERRIDE_TEMPLATE" > "$RT04E_OVERRIDE"
grep -q '{{RT04E_RELEASE_REV}}' "$RT04E_OVERRIDE" && die "override still has an unresolved placeholder — refusing" 12
_cleanup_override() { rm -f "$RT04E_OVERRIDE" 2>/dev/null || true; }
_clear() { :; }   # redefined at credential handoff; referenced by the combined trap
trap '_cleanup_override; _clear' EXIT INT TERM HUP
status "generated immutable RT04E image override (rt04e-${RT04E_RELEASE_REV:0:12}, outside repo)"

# ── 3. Load + validate the Sandbox target contract (R1/R7) ───────────────────
[ -f "$CONTRACT" ] || die "sandbox target contract missing — refusing" 12
grep -q 'permitted_environment: sandbox' "$CONTRACT" || die "contract environment is not sandbox — refusing" 12
ALLOW="core-api-staging api-gateway-staging developer-api public-api-staging"
for s in $ALLOW; do grep -qE "^\s*-\s*$s\s*$" "$CONTRACT" || die "contract missing allowlisted service $s — refusing" 12; done
# refuse if any prohibited/non-staging/live name is in our target set (defence-in-depth)
for s in $ALLOW; do
  case "$s" in
    core-api|api-gateway|public-api|admin-api|*prod*|*production*|*live*) die "prohibited service '$s' in target set — refusing" 12 ;;
  esac
done
[ -x "$DEPLOY_ADAPTER" ] || [ -f "$DEPLOY_ADAPTER" ] || die "sandbox deploy adapter missing — refusing" 12
[ -f "$ROLLBACK" ] || die "rollback subsystem missing — refusing" 12
[ -f "$CHECKPOINT" ] || die "migration checkpoint gate missing — refusing" 12
[ -f "$ATTEST" ] || die "compose attestation stage missing — refusing" 12
status "target contract loaded · allowlist=[$ALLOW] · no prohibited/live target"

# ── 3b. Pre-mutation Compose structural attestation (HIGH-2) — BEFORE any ─────
#      migration, image build or service replacement. Fail closed on any anomaly.
status "stage: pre-mutation semantic compose attestation (docker compose config)"
RT04E_COMPOSE_DIR="/srv/banzami" RT04E_OVERRIDE="$RT04E_OVERRIDE" RT04E_RELEASE_REV="$RT04E_RELEASE_REV" \
  bash "$ATTEST" || die "semantic compose attestation failed — refusing to mutate" 12

# ── 4. Protected, ephemeral migration credential handoff (stdin ONLY) ────────
if [ -t 0 ]; then
  printf 'Paste sanctioned Sandbox migration credential (input hidden): ' >&2
  IFS= read -rs BANZAMI_MIGRATE_URL || die "no credential provided" 2; printf '\n' >&2
else
  IFS= read -rs BANZAMI_MIGRATE_URL || die "no credential on protected stdin" 2
fi
[ -n "${BANZAMI_MIGRATE_URL:-}" ] || die "credential absent — fail closed" 2
# redefine _clear (the combined trap set in §2b references it by name at fire time)
_clear() { BANZAMI_MIGRATE_URL=''; unset BANZAMI_MIGRATE_URL 2>/dev/null || true; }
# validate WITHOUT rendering (pure bash + here-string; never echo/printf the value)
_tail="${BANZAMI_MIGRATE_URL##*/}"; _db="${_tail%%\?*}"
[ "$_db" = "banzami_staging" ] || die "target invalid — credential does not target banzami_staging" 3
grep -qiE 'prod|production|banzami_live|(^|[^a-z])live([^a-z]|$)' <<<"$BANZAMI_MIGRATE_URL" && die "target invalid — live/prod marker" 3
status "migration credential: present · target=banzami_staging · runtime-exposure=absent"

# ── 5. MANDATORY migration checkpoint gate BEFORE any migration (R6) ─────────
# The runner cannot reach migrate-and-verify without a passing checkpoint gate:
# operator confirmation, sandbox target checks, captured checkpoint, backup-equiv
# confirmed, ordered-migration + checksum preflight (incl. 0100). No DB access here.
status "stage: migration checkpoint gate"
BANZAMI_DB_TARGET="$BANZAMI_DB_TARGET" RT04E_RELEASE_REV="$RT04E_RELEASE_REV" REPO_ROOT="$REPO_ROOT" \
  bash "$CHECKPOINT" || die "migration checkpoint gate failed — migration BLOCKED (no checkpoint/approval/order)" 6

# ── 6. Migration (forward-only), credential injected into ONE subprocess only ─
status "stage: migrate-and-verify (0100) → schema drift detector"
if ! ( cd "$REPO_ROOT"; DATABASE_URL="$BANZAMI_MIGRATE_URL" BANZAMI_DB_TARGET="$BANZAMI_DB_TARGET" bash tools/migrate-and-verify.sh ) >/dev/null 2>&1; then
  die "migration failed — target unreachable, credential rejected, or schema drift — nothing deployed" 7
fi
_clear
status "stage: migration applied · checksum + drift verified · credential removed from runner env"

# ── 7. Pre-state image capture for rollback (R3) BEFORE any replacement ───────
status "stage: pre-state image capture (rollback references)"
RT04E_RELEASE_REV="$RT04E_RELEASE_REV" bash "$ROLLBACK" capture $ALLOW || die "pre-state capture failed — refusing to replace services" 8

# ── 8. Deploy ONLY the four allowlisted Sandbox services via the adapter (R1) ─
for s in $ALLOW; do
  status "stage: deploy sandbox service '$s' (canonical, revision-labelled, quarantined)"
  RT04E_RELEASE_REV="$RT04E_RELEASE_REV" REPO_ROOT="$REPO_ROOT" RT04E_OVERRIDE="$RT04E_OVERRIDE" \
    bash "$DEPLOY_ADAPTER" "$s" \
    || { status "deploy failed for $s — entering rollback decision"; break; }
done

# ── 9. Post-deploy revision-provenance gate (R2) — before any health success ─
prov_ok=1
for s in $ALLOW; do
  cid="$(docker ps --filter "name=$s" --format '{{.Names}}' | head -1)"
  [ -n "$cid" ] || { status "provenance FAIL: $s not running"; prov_ok=0; continue; }
  rev="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$cid" 2>/dev/null)"
  imgid="$(docker inspect --format '{{.Image}}' "$cid" 2>/dev/null | sed 's/sha256://; s/\(.\{12\}\).*/\1/')"
  if [ "$rev" = "$RT04E_RELEASE_REV" ]; then
    status "provenance OK: $s image=$imgid revision=${rev:0:12}"
  else
    status "provenance FAIL: $s image=$imgid revision=${rev:-<none>} (expected ${RT04E_RELEASE_REV:0:12})"; prov_ok=0
  fi
done

# ── 10. Unauthenticated local liveness (HIGH-1) — real check, AFTER provenance ─
# Uses each container's Docker HEALTHCHECK status (the container's own /health probe
# per the contract's unauthenticated_local_liveness category). Non-authenticated,
# non-mutating, no business/financial endpoint, no external redirect, no URL/port/
# host in output. Fails closed on any non-healthy/unknown status.
health_ok=1
if [ "$prov_ok" = 1 ]; then
  for s in $ALLOW; do
    cid="$(docker ps --filter "name=$s" --format '{{.Names}}' | head -1)"
    hs="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null)"
    if [ "$hs" = "healthy" ]; then status "health PASS: $s (status=healthy)"
    else status "health FAIL: $s (status=${hs:-unknown})"; health_ok=0; fi
  done
else
  health_ok=0
fi

# ── 11. Rollback decision gate (R3) ──────────────────────────────────────────
if [ "$prov_ok" != 1 ] || [ "$health_ok" != 1 ]; then
  status "ROLLBACK DECISION: provenance/health failed — Sandbox application rollback available"
  status "  (requires explicit operator confirmation; migrations are forward-only and NOT reversed)"
  die "RT04E provenance/health gate failed — run: $ROLLBACK restore  (operator-confirmed, sandbox-only)" 9
fi

# ── 12. Evidence + scope statement ───────────────────────────────────────────
status "stage: evidence capture (deployed revisions + provenance + health) — written outside $CANONICAL_ROOT"
status "RT04E COMPLETE — canonical Sandbox runtime provenance + deployment integrity verified."
status "This proves ONLY provenance/integrity. Capability release + financial E2E are SEPARATE follow-on gates."
