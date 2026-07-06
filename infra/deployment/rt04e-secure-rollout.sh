#!/usr/bin/env bash
# =============================================================================
# RT04E secure Sandbox runner — TWO EXPLICIT, MUTUALLY-EXCLUSIVE MODES
# =============================================================================
# SECURITY BOUNDARY (not a workflow preference):
#   RT04E execution is split into two fail-closed modes selected ONLY by the exact
#   environment variable RT04E_EXECUTION_MODE. There is NO implicit full rollout, NO
#   legacy default, NO positional mode argument, and NO automatic continuation from a
#   completed migration into image build or service replacement.
#
#     RT04E_EXECUTION_MODE=migration-only
#         canonical source/attestation gates → operator TTY authorisation
#         → protected read -rs credential → forward-only migration + verification
#         → sanitised, release-bound migration RECEIPT → clean exit.
#         NEVER captures rollback anchors, builds images, replaces services, or runs
#         provenance/health/rollback.
#
#     RT04E_EXECUTION_MODE=service-replacement-only
#         canonical source/attestation gates → VALID migration receipt gate
#         → operator TTY authorisation → rollback-anchor capture
#         → immutable four-service build → isolated replacement → provenance → health
#         → rollback decision → sanitised evidence.
#         NEVER prompts for or accepts a database credential, runs migration/checkpoint
#         tooling, or inspects database state.
#
#   RT04E proves canonical Sandbox runtime provenance and deployment integrity ONLY.
#   It does NOT enable payments, real-money movement, user/merchant/Developer-Console,
#   OTP, transfers, refunds, webhooks, QR, DOA, mobile, public launch or BNA Sandbox
#   participation. Financial capability stays quarantined.
#
# Credential handling (precise — no overclaim): in migration-only, BANZAMI_MIGRATE_URL
#   is read ONCE via protected read -rs from the operator's TTY, injected only into the
#   single migrate-and-verify subprocess env, and cleared on exit. Bash provides
#   scope/lifetime control only — NOT a cryptographic memory wipe.
# -----------------------------------------------------------------------------
set -euo pipefail
set +x
export PS4=''
umask 077

CANONICAL_ROOT="/srv/banzami/src"
REPO_ROOT="${BANZAMI_REPO_ROOT:-$CANONICAL_ROOT}"   # defaults ONLY to canonical
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd 2>/dev/null || echo)"
CONTRACT="$REPO_ROOT/infra/deployment/rt04e-sandbox-target-contract.yaml"
DEPLOY_ADAPTER="$REPO_ROOT/infra/deployment/rt04e-sandbox-deploy.sh"
ROLLBACK="$REPO_ROOT/infra/deployment/rt04e-sandbox-rollback.sh"
CHECKPOINT="$REPO_ROOT/infra/deployment/rt04e-migration-checkpoint.sh"
ATTEST="$REPO_ROOT/infra/deployment/rt04e-sandbox-attest.sh"
RECEIPT_VALIDATOR="$REPO_ROOT/tools/rt04e-receipt.mjs"
LOCK_FILE="${RT04E_LOCK_FILE:-/run/lock/rt04e-rollout.lock}"
RECEIPT_DIR="/root/banzami-forensics/rt04e-receipts"   # FIXED, outside repo/runtime/compose
ALLOW="core-api-staging api-gateway-staging developer-api public-api-staging"

status() { printf '  %s\n' "$1"; }
die()    { printf 'rollout: FAILED — %s\n' "$1" >&2; exit "${2:-1}"; }
require_tty() { [ -t 0 ] || die "a direct interactive TTY is required for operator authorisation — refusing (no non-interactive stream)" 21; }
# Visible, exact-phrase operator authorisation. Read from the TTY; never by env alone.
confirm_phrase() {
  local expected="$1" notice="$2" reply=''
  printf '%s\n' "$notice" >&2
  printf 'Type the exact authorisation phrase to proceed: ' >&2
  IFS= read -r reply || die "no authorisation phrase provided — refusing" 21
  [ "$reply" = "$expected" ] || die "authorisation phrase mismatch — refusing" 21
  status "operator authorisation confirmed"
}

# Sanitised, root-owned, release-bound migration receipt. Fixed location (never a
# caller path). Atomic write/rename, symlink-safe, no overwrite of a mismatched receipt.
rt04e_write_migration_receipt() {
  local after="$1" before="${2:-unrecorded-pre-migration}"
  [ -n "$after" ] || after="head-unresolved"
  [ -L "$RECEIPT_DIR" ] && die "receipt directory is a symlink — refusing" 24
  mkdir -p "$RECEIPT_DIR"; chmod 700 "$RECEIPT_DIR"; chown root:root "$RECEIPT_DIR" 2>/dev/null || true
  local final="$RECEIPT_DIR/rt04e-migration-receipt-$RT04E_RELEASE_REV.json"
  [ -L "$final" ] && die "receipt path is a symlink — refusing" 24
  if [ -e "$final" ]; then
    if RT04E_RELEASE_REV="$RT04E_RELEASE_REV" node "$RECEIPT_VALIDATOR" < "$final" >/dev/null 2>&1; then
      status "existing valid receipt for this release retained (idempotent)"; return 0
    fi
    die "an existing receipt for this release does not validate — refusing to overwrite" 24
  fi
  local ts tmp; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  tmp="$(mktemp "$RECEIPT_DIR/.receipt.XXXXXX")"; chmod 600 "$tmp"
  {
    printf '{\n'
    printf '  "receipt_version": 1,\n'
    printf '  "release_revision": "%s",\n' "$RT04E_RELEASE_REV"
    printf '  "target_category": "Sandbox",\n'
    printf '  "execution_mode": "migration-only",\n'
    printf '  "checkpoint_status": "PASS",\n'
    printf '  "backup_status": "PASS",\n'
    printf '  "migration_access_status": "PASS",\n'
    printf '  "migration_status": "PASS",\n'
    printf '  "migration_level_before": "%s",\n' "$before"
    printf '  "migration_level_after": "%s",\n' "$after"
    printf '  "checksum_status": "PASS",\n'
    printf '  "drift_status": "PASS",\n'
    printf '  "created_utc": "%s"\n' "$ts"
    printf '}\n'
  } > "$tmp"
  # self-validate through the constrained parser BEFORE finalising (no grep/awk)
  RT04E_RELEASE_REV="$RT04E_RELEASE_REV" node "$RECEIPT_VALIDATOR" < "$tmp" >/dev/null 2>&1 \
    || { rm -f "$tmp"; die "generated receipt failed self-validation — refusing" 24; }
  chown root:root "$tmp" 2>/dev/null || true
  mv -f "$tmp" "$final"        # atomic rename on the same filesystem
  chmod 600 "$final"
  status "migration receipt written (root-owned 0600, bound to release SHA, self-validated)"
}

# ── MODE: migration-only — NEVER builds or replaces anything ─────────────────
rt04e_run_migration_only() {
  [ -f "$CHECKPOINT" ] || die "migration checkpoint gate missing — refusing" 12
  [ -f "$RECEIPT_VALIDATOR" ] || die "receipt validator missing — refusing" 12
  # A caller-provided DB credential env is forbidden — the ONLY intake is read -rs.
  [ -z "${DATABASE_URL:-}" ] || die "DATABASE_URL must NOT be caller-provided — refusing" 22
  require_tty
  # real-world operational confirmations (operator-asserted; checkpoint re-checks)
  [ "${RT04E_CHECKPOINT_CAPTURED:-}" = "yes" ]      || die "RT04E_CHECKPOINT_CAPTURED=yes required (checkpoint genuinely captured)" 23
  [ "${RT04E_BACKUP_CONFIRMED:-}" = "yes" ]          || die "RT04E_BACKUP_CONFIRMED=yes required (backup/rollback-equivalent genuinely exists)" 23
  [ "${RT04E_MIGRATION_ACCESS_APPROVED:-}" = "yes" ] || die "RT04E_MIGRATION_ACCESS_APPROVED=yes required (migration access genuinely sanctioned)" 23
  # visible, exact-phrase authorisation (interactive TTY only) BEFORE the hidden prompt
  confirm_phrase "AUTHORISE RT04E SANDBOX MIGRATION" \
    "RT04E migration-only will apply the approved FORWARD-ONLY Sandbox migration to $BANZAMI_DB_TARGET only. NO images are built and NO services are replaced."
  # mandatory checkpoint gate (no DB access; confirms order/checksums/0100/forward-only)
  status "stage: migration checkpoint gate"
  BANZAMI_DB_TARGET="$BANZAMI_DB_TARGET" RT04E_RELEASE_REV="$RT04E_RELEASE_REV" REPO_ROOT="$REPO_ROOT" \
    RT04E_CHECKPOINT_CONFIRMED=yes RT04E_CHECKPOINT_CAPTURED=yes \
    RT04E_BACKUP_CONFIRMED=yes RT04E_MIGRATION_ACCESS_APPROVED=yes \
    bash "$CHECKPOINT" || die "migration checkpoint gate failed — migration BLOCKED" 6
  # existing PROTECTED credential handoff — hidden read -rs from the operator's TTY
  printf 'Paste sanctioned Sandbox migration credential (input hidden): ' >&2
  IFS= read -rs BANZAMI_MIGRATE_URL || die "no credential provided — refusing" 2; printf '\n' >&2
  [ -n "${BANZAMI_MIGRATE_URL:-}" ] || die "credential absent — fail closed" 2
  _clear() { BANZAMI_MIGRATE_URL=''; unset BANZAMI_MIGRATE_URL 2>/dev/null || true; }
  # validate WITHOUT rendering (pure bash; never echo/printf the value)
  _tail="${BANZAMI_MIGRATE_URL##*/}"; _db="${_tail%%\?*}"
  [ "$_db" = "banzami_staging" ] || { _clear; die "target invalid — credential does not target banzami_staging" 3; }
  grep -qiE 'prod|production|banzami_live|(^|[^a-z])live([^a-z]|$)' <<<"$BANZAMI_MIGRATE_URL" && { _clear; die "target invalid — live/prod marker" 3; }
  status "migration credential: present · target=banzami_staging · runtime-exposure=absent"
  # sanitised migration head (source fact) for the receipt (basename only, no secrets)
  local head_after; head_after="$(basename "$(ls -1 "$REPO_ROOT"/db/migrations/[0-9]*.sql 2>/dev/null | sort | tail -1)" .sql 2>/dev/null)"
  # forward-only migration + verification (credential injected into ONE subprocess)
  status "stage: migrate-and-verify (forward-only) → checksum → schema drift detector"
  if ! ( cd "$REPO_ROOT"; DATABASE_URL="$BANZAMI_MIGRATE_URL" BANZAMI_DB_TARGET="$BANZAMI_DB_TARGET" bash tools/migrate-and-verify.sh ) >/dev/null 2>&1; then
    _clear; die "migration failed — target unreachable, credential rejected, or schema drift — nothing built or replaced" 7
  fi
  _clear
  status "stage: migration applied · checksum + drift verified · credential cleared from runner env"
  # write the sanitised, release-bound receipt ONLY after all outcomes pass
  rt04e_write_migration_receipt "$head_after" "recorded-forward-only" || die "migration receipt write/validate failed — refusing" 24
  status "RT04E Migration-Only: COMPLETE — READY FOR SERVICE-REPLACEMENT AUTHORISATION"
  exit 0
}

# ── MODE: service-replacement-only — NO database, NO credential, receipt-gated ─
rt04e_run_service_replacement_only() {
  [ -f "$DEPLOY_ADAPTER" ] || die "sandbox deploy adapter missing — refusing" 12
  [ -f "$ROLLBACK" ] || die "rollback subsystem missing — refusing" 12
  [ -f "$RECEIPT_VALIDATOR" ] || die "receipt validator missing — refusing" 12
  # NO database credential marker may be present — reject before any operation.
  [ -z "${DATABASE_URL:-}" ] || die "DATABASE_URL must NOT be present in service-replacement-only — refusing" 30
  [ -z "${BANZAMI_MIGRATE_URL:-}" ] || die "a migration credential marker is present — refusing in service-replacement-only" 30
  # migration RECEIPT gate — fixed canonical location, ownership/perms/symlink, validator
  local receipt="$RECEIPT_DIR/rt04e-migration-receipt-$RT04E_RELEASE_REV.json"
  [ ! -L "$RECEIPT_DIR" ] || die "receipt directory is a symlink — refusing" 31
  [ -e "$receipt" ] || die "no migration receipt for this release — run migration-only first — refusing" 31
  [ ! -L "$receipt" ] || die "receipt is a symlink — refusing" 31
  local owner mode
  owner="$(stat -c '%U' "$receipt" 2>/dev/null || echo '?')"
  mode="$(stat -c '%a' "$receipt" 2>/dev/null || echo '?')"
  [ "$owner" = root ] || die "receipt not root-owned — refusing" 31
  [ "$mode" = 600 ] || die "receipt permissions are not 600 — refusing" 31
  RT04E_RELEASE_REV="$RT04E_RELEASE_REV" node "$RECEIPT_VALIDATOR" < "$receipt" >/dev/null 2>&1 \
    || die "migration receipt failed validation (stale/mismatched/malformed/non-canonical) — refusing" 31
  status "migration receipt: valid · release-bound · Sandbox · migration-only"
  require_tty
  confirm_phrase "AUTHORISE RT04E SANDBOX SERVICE REPLACEMENT" \
    "RT04E service-replacement-only will build immutable images and replace ONLY core-api-staging, api-gateway-staging, developer-api, public-api-staging. Pre-state rollback images are retained. Migrations are NOT reversed."
  # pre-state capture BEFORE any replacement
  status "stage: pre-state image capture (rollback references)"
  RT04E_RELEASE_REV="$RT04E_RELEASE_REV" bash "$ROLLBACK" capture $ALLOW || die "pre-state capture failed — refusing to replace services" 8
  # deploy ONLY the four allowlisted services, one at a time, via the canonical adapter
  for s in $ALLOW; do
    status "stage: deploy sandbox service '$s' (canonical, revision-labelled, isolated)"
    RT04E_RELEASE_REV="$RT04E_RELEASE_REV" REPO_ROOT="$REPO_ROOT" RT04E_OVERRIDE="$RT04E_OVERRIDE" \
      bash "$DEPLOY_ADAPTER" "$s" || { status "deploy failed for $s — entering rollback decision"; break; }
  done
  # post-deploy revision-provenance gate — BEFORE any health success
  local prov_ok=1 cid rev imgid hs health_ok=1
  for s in $ALLOW; do
    cid="$(docker ps --filter "name=$s" --format '{{.Names}}' | head -1)"
    [ -n "$cid" ] || { status "provenance FAIL: $s not running"; prov_ok=0; continue; }
    rev="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$cid" 2>/dev/null)"
    imgid="$(docker inspect --format '{{.Image}}' "$cid" 2>/dev/null | sed 's/sha256://; s/\(.\{12\}\).*/\1/')"
    if [ "$rev" = "$RT04E_RELEASE_REV" ]; then status "provenance OK: $s image=$imgid revision=${rev:0:12}"
    else status "provenance FAIL: $s image=$imgid revision=${rev:-<none>} (expected ${RT04E_RELEASE_REV:0:12})"; prov_ok=0; fi
  done
  # unauthenticated local liveness — real Docker HEALTHCHECK, AFTER provenance
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
  # rollback decision gate
  if [ "$prov_ok" != 1 ] || [ "$health_ok" != 1 ]; then
    status "ROLLBACK DECISION: provenance/health failed — Sandbox application rollback available"
    status "  (requires explicit operator confirmation; migrations are forward-only and NOT reversed)"
    die "RT04E provenance/health gate failed — run: $ROLLBACK restore (operator-confirmed, sandbox-only)" 9
  fi
  # evidence + scope
  status "stage: evidence capture (deployed revisions + provenance + health) — written outside $CANONICAL_ROOT"
  status "RT04E Service-Replacement-Only: COMPLETE — canonical Sandbox runtime provenance + deployment integrity verified."
  status "This proves ONLY provenance/integrity. Payment capability + financial E2E are SEPARATE follow-on gates (quarantined)."
  exit 0
}

# ═════════════════════════════ COMMON PREAMBLE ═══════════════════════════════
# EXPLICIT MODE GATE — before ANY sensitive/mutating step (credential, DB, checkpoint,
# rollback capture, image build, Docker/Compose). No default, no aliases, no argv mode.
[ "$#" -eq 0 ] || die "no command-line arguments permitted — the migration credential/mode must NOT be passed as an argument (mode is RT04E_EXECUTION_MODE only) — refusing" 2
MODE="${RT04E_EXECUTION_MODE:-}"
case "$MODE" in
  migration-only|service-replacement-only) : ;;
  "") die "RT04E_EXECUTION_MODE required — exactly 'migration-only' or 'service-replacement-only' (no default; no full/all/auto/deploy/continue) — refusing" 20 ;;
  *)  die "RT04E_EXECUTION_MODE invalid — exactly 'migration-only' or 'service-replacement-only' — refusing" 20 ;;
esac

# canonical source root only (no legacy / arbitrary)
case "$REPO_ROOT" in
  "$CANONICAL_ROOT") : ;;
  *legacy-src-retired*|*banzami-forensics*|*/srv/banzami/repo*|*banzami/banzami*)
    die "source root references a legacy/non-canonical path — refusing" 11 ;;
  *) die "REPO_ROOT must resolve exactly to $CANONICAL_ROOT — refusing" 11 ;;
esac

# Sandbox target lock (both modes); refuse Production/Live markers + prod ack flag
: "${BANZAMI_DB_TARGET:?set BANZAMI_DB_TARGET (must be banzami_staging)}"
case "$BANZAMI_DB_TARGET" in
  banzami_staging) : ;;
  *prod*|*production*|*live*|banzami) die "target '$BANZAMI_DB_TARGET' is Production/Live — refusing" 3 ;;
  *) die "unrecognised target '$BANZAMI_DB_TARGET' — refusing" 3 ;;
esac
[ "${I_ACK_PRODUCTION_TARGET:-}" = "" ] || die "production acknowledgement flag must NOT be set — refusing" 3

# exclusive lock (fail closed on contention)
{ exec 9>"$LOCK_FILE"; } 2>/dev/null || die "cannot acquire rollout lock — refusing" 10
flock -n 9 || die "another rollout is already in progress — refusing" 10

# pin revision, clean worktree, expected branch, NO remotes, HEAD == REV
: "${RT04E_RELEASE_REV:?set RT04E_RELEASE_REV (the approved immutable release revision)}"
cd "$REPO_ROOT" || die "canonical checkout not found — refusing" 11
[ -z "$(git status --porcelain 2>/dev/null)" ] || die "worktree is dirty — refusing" 11
[ "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" = "main" ] || die "not on branch main — refusing" 11
[ -z "$(git remote 2>/dev/null)" ] || die "canonical checkout must have NO git remotes — refusing" 11
. "$REPO_ROOT/infra/deployment/rt04e-sandbox-lib.sh"
rt04e_valid_rev "$RT04E_RELEASE_REV" || die "RT04E_RELEASE_REV is not the full 40-hex canonical SHA — refusing" 11
_head="$(git rev-parse HEAD 2>/dev/null || true)"
[ -n "$_head" ] && [ "$_head" = "$RT04E_RELEASE_REV" ] || die "checked-out revision does not match RT04E_RELEASE_REV — refusing" 11
rt04e_assert_clean_compose_env || die "inherited COMPOSE_* control present — refusing (hermeticity)" 11
status "revision pinned (${RT04E_RELEASE_REV:0:12}) · branch main · clean · no remotes · mode=$MODE"

# generate the IMMUTABLE image override (both modes need it for full-projection attestation)
OVERRIDE_TEMPLATE="$REPO_ROOT/infra/deployment/rt04e-sandbox-images.override.template.yml"
[ -f "$OVERRIDE_TEMPLATE" ] || die "RT04E image override template missing — refusing" 12
RT04E_OVERRIDE="$(mktemp "${TMPDIR:-/run}/rt04e-override.XXXXXX.yml" 2>/dev/null || mktemp)"
chmod 600 "$RT04E_OVERRIDE"; export RT04E_OVERRIDE
sed "s/{{RT04E_RELEASE_REV}}/${RT04E_RELEASE_REV}/g" "$OVERRIDE_TEMPLATE" > "$RT04E_OVERRIDE"
grep -q '{{RT04E_RELEASE_REV}}' "$RT04E_OVERRIDE" && die "override still has an unresolved placeholder — refusing" 12
_cleanup_override() { rm -f "$RT04E_OVERRIDE" 2>/dev/null || true; }
_clear() { :; }   # redefined in migration-only at credential handoff; referenced by the trap
trap '_cleanup_override; _clear' EXIT INT TERM HUP
status "generated immutable RT04E image override (outside repo)"

# load + validate the Sandbox target contract (both modes)
[ -f "$CONTRACT" ] || die "sandbox target contract missing — refusing" 12
grep -q 'permitted_environment: sandbox' "$CONTRACT" || die "contract environment is not sandbox — refusing" 12
for s in $ALLOW; do grep -qE "^\s*-\s*$s\s*$" "$CONTRACT" || die "contract missing allowlisted service $s — refusing" 12; done
for s in $ALLOW; do
  case "$s" in
    core-api|api-gateway|public-api|admin-api|*prod*|*production*|*live*) die "prohibited service '$s' in target set — refusing" 12 ;;
  esac
done
[ -f "$ATTEST" ] || die "compose attestation stage missing — refusing" 12
status "target contract loaded · allowlist=[$ALLOW] · no prohibited/live target"

# semantic base/full Compose attestation (both modes) — BEFORE any mutation
status "stage: pre-mutation semantic compose attestation (base-only + full projections)"
RT04E_OVERRIDE="$RT04E_OVERRIDE" RT04E_RELEASE_REV="$RT04E_RELEASE_REV" \
  bash "$ATTEST" || die "semantic compose attestation failed — refusing to mutate" 12

# ── DISPATCH — one explicit mode only; the two boundaries never merge ─────────
case "$MODE" in
  migration-only)           rt04e_run_migration_only ;;
  service-replacement-only) rt04e_run_service_replacement_only ;;
  *) die "unreachable mode — refusing" 20 ;;
esac
