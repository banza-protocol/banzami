#!/usr/bin/env bash
# =============================================================================
# RT04E secure one-shot operator rollout runner  —  REVIEWED TEMPLATE, NOT AUTO-RUN
# =============================================================================
# Purpose
#   Execute the sanctioned RT04E Sandbox payment-binding rollout while the
#   sanctioned migration credential (BANZAMI_MIGRATE_URL) is handed off ONCE,
#   ephemerally, through protected stdin — never as an argv, never persisted to
#   disk, never placed in a shared .env / Docker Compose runtime env / shell
#   profile / repo file / log / evidence, never propagated to an application
#   container, and never exposed to the general Claude/Bash execution context.
#
# Credential memory handling (precise — no overclaim)
#   The credential is required by exactly ONE subprocess (tools/migrate-and-verify.sh,
#   which reads DATABASE_URL). It is held ONLY TRANSIENTLY, in a shell variable in
#   THIS runner process, and is injected into that single subprocess's environment
#   for the minimum time. On exit (success, error, or signal) an EXIT/INT/TERM/HUP
#   trap unsets the variable, removing it from the runner environment. This is a
#   scope/lifetime control: Bash CANNOT provide a cryptographic guarantee of
#   physical memory zeroization, and this runner does not claim to. It guarantees
#   only that the value is not persisted to disk, runtime config, logs, arguments
#   or shared environment, and does not outlive the process.
#
# Install (operator, on the approved Sandbox deploy host):
#   install -o root -g root -m 0700 rt04e-secure-rollout.sh /root/rt04e-secure-rollout.sh
#
# Invoke (operator, from the secure credential environment — see the runbook):
#   RT04E_RELEASE_REV=<approved-git-sha> BANZAMI_DB_TARGET=banzami_staging \
#     /root/rt04e-secure-rollout.sh < <(operator-secret-get banzami/staging/migrate_url)
#   # or interactively (input hidden):
#   RT04E_RELEASE_REV=<approved-git-sha> BANZAMI_DB_TARGET=banzami_staging \
#     /root/rt04e-secure-rollout.sh
#
# Output: sanitised status lines only. Exit non-zero = fail closed, nothing released.
# -----------------------------------------------------------------------------
set -euo pipefail
set +x                   # NEVER trace — tracing would render the credential
export PS4=''            # belt-and-braces if xtrace is ever forced on
umask 077                # any transient file is owner-only

REPO_ROOT="${BANZAMI_REPO_ROOT:-/srv/banzami/repo}"        # operator-configured checkout
LOCK_FILE="${RT04E_LOCK_FILE:-/run/lock/rt04e-rollout.lock}" # override only for isolated tests

status()  { printf '  %s\n' "$1"; }                         # sanitised only
die()     { printf 'rollout: FAILED — %s\n' "$1" >&2; exit "${2:-1}"; }

# ── 0. Refuse argv secrets, Production/Live, wrong target ─────────────────────
[ "$#" -eq 0 ] || die "the migration credential must NOT be passed as an argument" 2
: "${BANZAMI_DB_TARGET:?set BANZAMI_DB_TARGET (must be the canonical sandbox db label)}"
case "$BANZAMI_DB_TARGET" in
  banzami_staging) : ;;                                   # the only permitted target
  *prod*|*live*|banzami) die "target '$BANZAMI_DB_TARGET' is Production/Live — refusing" 3 ;;
  *) die "unrecognised target '$BANZAMI_DB_TARGET' — refusing" 3 ;;
esac
[ "${I_ACK_PRODUCTION_TARGET:-}" = "" ] || die "production acknowledgement flag must NOT be set for this sandbox runner" 3

# ── 1. Exclusive rollout lock (fail closed on contention) ─────────────────────
# One rollout at a time. The lock is held for the whole run and auto-released when
# fd 9 closes at process exit. The public message reveals no host path.
# The stderr redirection is SCOPED to the group so it never permanently silences
# die() (a bare `exec … 2>/dev/null` would redirect stderr for the whole script).
{ exec 9>"$LOCK_FILE"; } 2>/dev/null || die "cannot acquire rollout lock — refusing" 10
flock -n 9 || die "another rollout is already in progress — refusing" 10

# ── 2. Pin the deployment revision (non-secret, immutable, approved) ──────────
: "${RT04E_RELEASE_REV:?set RT04E_RELEASE_REV (the approved immutable release revision)}"
cd "$REPO_ROOT" || die "repo checkout not found — refusing" 11
[ -z "$(git status --porcelain 2>/dev/null)" ] || die "worktree is dirty — refusing (deploy only a clean approved revision)" 11
_head="$(git rev-parse HEAD 2>/dev/null || true)"
[ -n "$_head" ] || die "cannot resolve HEAD revision — refusing" 11
[ "$_head" = "$RT04E_RELEASE_REV" ] || die "checked-out revision does not match the approved release revision — refusing" 11
# NB: the runner performs NO unbounded repository update of any kind — the operator
# checks out the approved revision beforehand; the runner only verifies it matches.
status "release revision: pinned (${RT04E_RELEASE_REV:0:12}) · worktree=clean · Core/Dev-API/Gateway/Checkout from one reviewed set"

# ── 3. Protected, ephemeral credential handoff (stdin ONLY) ───────────────────
if [ -t 0 ]; then
  printf 'Paste sanctioned Sandbox migration credential (input hidden): ' >&2
  IFS= read -rs BANZAMI_MIGRATE_URL || die "no credential provided" 2
  printf '\n' >&2
else
  IFS= read -rs BANZAMI_MIGRATE_URL || die "no credential on protected stdin" 2
fi
[ -n "${BANZAMI_MIGRATE_URL:-}" ] || die "credential absent — cannot proceed (fail closed)" 2
# Reject an obviously argv-smuggled / already-set secret: it MUST come from stdin.
# (If it were exported into the environment, `read` above would still overwrite it;
#  this guard documents intent and rejects an empty read.)

# Best-effort scope/lifetime control — NOT a memory wipe (see header). Clears the
# variable from the runner environment on any exit path.
_clear() { BANZAMI_MIGRATE_URL=''; unset BANZAMI_MIGRATE_URL 2>/dev/null || true; }
trap _clear EXIT INT TERM HUP

# ── 4. Validate the credential WITHOUT rendering it ──────────────────────────
# Pure bash parameter expansion — the value is never passed to echo/printf and
# never rendered to a terminal, file or log. sandbox-only: the database name (the
# last path segment, minus any ?query) must be exactly banzami_staging.
_tail="${BANZAMI_MIGRATE_URL##*/}"        # everything after the final '/'
_db="${_tail%%\?*}"                        # strip a trailing ?query, if any
[ "$_db" = "banzami_staging" ] || die "target invalid — credential does not target banzami_staging" 3
# Contamination scan via a here-string (fed to grep's stdin, never printed).
if grep -qiE 'prod|banzami_live|(^|[^a-z])live([^a-z]|$)' <<<"$BANZAMI_MIGRATE_URL"; then
  die "target invalid — credential references a live/prod marker" 3
fi
# NB: the runner performs NO separate psql reachability probe — passing the URL to
# psql would place the credential in a process argv (ps-visible). The migration
# gate below opens the only connection; an unreachable target or a rejected
# credential is surfaced there as the sanitised category "migration failed".
status "authorized rollout credential: present · target=banzami_staging · runtime-exposure=absent"

# ── 5. Pre-release quarantine gate (refuse if already released) ───────────────
if [ "${RT04E_ASSERT_QUARANTINED:-1}" = "1" ]; then
  if command -v rt04e_release_state >/dev/null 2>&1 && rt04e_release_state | grep -qi '^released$'; then
    die "PAYMENT_CAPABILITY_RELEASED already true before the E2E release decision — refusing" 5
  fi
fi

# ── 6. Refuse destructive / down migrations (forward-only) ───────────────────
if grep -rilE 'DROP +TABLE|DROP +COLUMN|TRUNCATE +|DROP +SCHEMA|ALTER +TABLE .* DROP' \
     "$REPO_ROOT/db/migrations/0100_dev_project_sandbox_binding.sql" >/dev/null 2>&1; then
  die "migration 0100 contains destructive DDL — refusing" 6
fi
if ls "$REPO_ROOT"/db/migrations/*down*.sql "$REPO_ROOT"/db/migrations/*.down.sql >/dev/null 2>&1; then
  die "down migrations present in db/migrations — refusing (forward-only)" 6
fi

# ── 7. Step 1 — migrate + verify (credential injected into THIS subprocess only) ─
# Output is DISCARDED (not written to a temp file): the gate's own log may embed a
# redacted URL; the runner surfaces only a sanitised category on failure.
status "step 1/6: migrate-and-verify (0100) → schema drift detector"
if ! (
  cd "$REPO_ROOT"
  DATABASE_URL="$BANZAMI_MIGRATE_URL" BANZAMI_DB_TARGET="$BANZAMI_DB_TARGET" \
    bash tools/migrate-and-verify.sh
) >/dev/null 2>&1; then
  die "migration failed — target unreachable, credential rejected, or schema drift — BLOCKED, nothing deployed" 7
fi
status "step 1/6: migration 0100 applied · checksum + all-schema drift verified"

# ── 8. Credential no longer required — clear it BEFORE any deploy ─────────────
_clear
status "migration credential removed from the runner environment (deploy phase needs no migration secret)"

# ── 9. Steps 2–4 — deploys use runtime config only (NO migration credential) ──
# Each service reads its own per-service runtime env. CORE_PAYEE_VALIDATION_KEY +
# CORE_API_URL come from per-service runtime config, NOT this runner.
# PAYMENT_CAPABILITY_RELEASED stays false throughout.
run() { status "step $1"; ( cd "$REPO_ROOT" && shift && "$@" ) || die "step failed" 8; }

run "2/6: deploy Sandbox Core (dedicated payee-validation boundary)"      ./deploy.sh core-api
run "3/6: deploy Sandbox Developer API (immutable binding authority)"     ./deploy.sh developer-api
run "4/6: deploy Sandbox Gateway (payment authz — externally quarantined)" ./deploy.sh api-gateway

# ── 10. Deployed E2E (fixture-only) — release ONLY if every item passes ───────
status "step 5/6: deployed 58-item payment E2E (fixture-only, quarantined)"
( cd "$REPO_ROOT" && bash tools/e2e/dev-console/rt04e-payment-e2e.sh ) \
  || die "deployed payment E2E FAILED — keeping PAYMENT_CAPABILITY_RELEASED=false, revoking fixtures" 9

status "step 6/6: all E2E green — the payment-release control may now be enabled"
status "         (release is a SEPARATE approved operator action; this runner never enables it)"
status "RT04E rollout runner: migration + deploy + E2E complete — see gate outputs before release"
