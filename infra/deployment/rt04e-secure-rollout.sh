#!/usr/bin/env bash
# =============================================================================
# RT04E secure one-shot operator rollout runner  —  REVIEWED TEMPLATE, NOT AUTO-RUN
# =============================================================================
# Purpose
#   Execute the sanctioned RT04E Sandbox payment-binding rollout while the
#   sanctioned migration credential (BANZAMI_MIGRATE_URL) is handed off ONCE,
#   ephemerally, through protected stdin — never as an argv, never persisted,
#   never printed, never placed in a shared .env / Docker Compose runtime env /
#   shell profile / repo file / log / evidence, and never exposed to the general
#   Claude/Bash execution context.
#
#   The credential is required by exactly ONE subprocess (tools/migrate-and-verify.sh,
#   which reads DATABASE_URL). It is held in a shell variable in THIS process only,
#   injected into that single subprocess's environment for the minimum time, and
#   cleared immediately afterwards. The subsequent deploy / fixture / E2E / release
#   phases use ordinary runtime configuration and do NOT receive this credential.
#
# Install (operator, on the approved Sandbox deploy host):
#   install -o root -g root -m 0700 rt04e-secure-rollout.sh /root/rt04e-secure-rollout.sh
#
# Invoke (operator, from the secure credential environment — see the runbook):
#   # from an approved secret manager (no echo, no history, no argv):
#   BANZAMI_DB_TARGET=banzami_staging /root/rt04e-secure-rollout.sh < <(operator-secret-get banzami/staging/migrate_url)
#   # or interactively (input hidden):
#   BANZAMI_DB_TARGET=banzami_staging /root/rt04e-secure-rollout.sh
#
# Output: sanitised status lines only. Exit non-zero = fail closed, nothing released.
# -----------------------------------------------------------------------------
set -euo pipefail
set +x                   # NEVER trace — tracing would echo the credential
export PS4=''            # belt-and-braces if xtrace is ever forced on
umask 077                # any transient file is owner-only

REPO_ROOT="${BANZAMI_REPO_ROOT:-/srv/banzami/repo}"   # operator-configured checkout

status()  { printf '  %s\n' "$1"; }                    # sanitised only
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

# ── 1. Protected, ephemeral credential handoff (stdin ONLY) ───────────────────
if [ -t 0 ]; then
  printf 'Paste sanctioned Sandbox migration credential (input hidden): ' >&2
  IFS= read -rs BANZAMI_MIGRATE_URL || die "no credential provided" 2
  printf '\n' >&2
else
  IFS= read -rs BANZAMI_MIGRATE_URL || die "no credential on protected stdin" 2
fi
[ -n "${BANZAMI_MIGRATE_URL:-}" ] || die "credential absent — cannot proceed (fail closed)" 2

# Guarantee the credential is cleared on ANY exit path (success, error, signal).
_clear() { BANZAMI_MIGRATE_URL='x'; unset BANZAMI_MIGRATE_URL 2>/dev/null || true; }
trap _clear EXIT INT TERM HUP

# ── 2. Validate the credential WITHOUT printing it ───────────────────────────
# Pure bash parameter expansion — the value is never passed to echo/printf and
# never rendered to a terminal, file or log. sandbox-only: the database name (the
# last path segment, minus any ?query) must be exactly banzami_staging.
_tail="${BANZAMI_MIGRATE_URL##*/}"        # everything after the final '/'
_db="${_tail%%\?*}"                        # strip a trailing ?query, if any
[ "$_db" = "banzami_staging" ] || die "credential does not target banzami_staging — refusing" 3
# Contamination scan via a here-string (fed to grep's stdin, never printed).
if grep -qiE 'prod|banzami_live|(^|[^a-z])live([^a-z]|$)' <<<"$BANZAMI_MIGRATE_URL"; then
  die "credential references a live/prod marker — refusing" 3
fi
# reachability (no value emitted)
PGCONNECT_TIMEOUT=5 psql "$BANZAMI_MIGRATE_URL" -tAc 'SELECT 1' >/dev/null 2>&1 \
  || die "cannot reach the sandbox database with the supplied credential — refusing" 4
status "authorized rollout credential: present · target=banzami_staging · reachable · runtime-exposure=absent"

# ── 3. Pre-release quarantine gate (refuse if already released) ───────────────
# Checked against the deployed Developer API runtime state, NOT by reading a secret.
if [ "${RT04E_ASSERT_QUARANTINED:-1}" = "1" ]; then
  # Operator hook: must return non-zero if PAYMENT_CAPABILITY_RELEASED is already true.
  if command -v rt04e_release_state >/dev/null 2>&1 && rt04e_release_state | grep -qi '^released$'; then
    die "PAYMENT_CAPABILITY_RELEASED already true before the E2E release decision — refusing" 5
  fi
fi

# ── 4. Refuse destructive / down migrations ──────────────────────────────────
if grep -rilE 'DROP +TABLE|DROP +COLUMN|TRUNCATE +|DROP +SCHEMA|ALTER +TABLE .* DROP' \
     "$REPO_ROOT/db/migrations/0100_dev_project_sandbox_binding.sql" >/dev/null 2>&1; then
  die "migration 0100 contains destructive DDL — refusing" 6
fi
if ls "$REPO_ROOT"/db/migrations/*down*.sql "$REPO_ROOT"/db/migrations/*.down.sql >/dev/null 2>&1; then
  die "down migrations present in db/migrations — refusing (forward-only)" 6
fi

# ── 5. Step 1 — migrate + verify (credential injected into THIS subprocess only) ─
status "step 1/6: migrate-and-verify (0100) → schema drift detector"
(
  cd "$REPO_ROOT"
  DATABASE_URL="$BANZAMI_MIGRATE_URL" BANZAMI_DB_TARGET="$BANZAMI_DB_TARGET" \
    bash tools/migrate-and-verify.sh
) >/tmp/.rt04e-migrate.$$ 2>&1 || { rm -f /tmp/.rt04e-migrate.$$; die "migrate-and-verify failed (migration error or schema drift) — BLOCKED" 7; }
rm -f /tmp/.rt04e-migrate.$$   # the gate's own log may embed the URL — never surface it
status "step 1/6: migration 0100 applied · checksum + all-schema drift verified"

# ── 6. Credential no longer required — clear it BEFORE any deploy ─────────────
_clear
trap - EXIT INT TERM HUP
status "migration credential cleared from memory (deploy phase requires no migration secret)"

# ── 7. Steps 2–6 — deploys use runtime config only (NO migration credential) ──
# These call the standard deploy path; each service reads its own runtime env.
# CORE_PAYEE_VALIDATION_KEY + CORE_API_URL come from per-service runtime config,
# NOT from this runner. PAYMENT_CAPABILITY_RELEASED stays false until step 6.
run() { status "step $1"; ( cd "$REPO_ROOT" && shift && "$@" ) || die "step failed: $*" 8; }

run "2/6: deploy Sandbox Core (dedicated payee-validation boundary)"      ./deploy.sh core-api
run "3/6: deploy Sandbox Developer API (immutable binding authority)"     ./deploy.sh developer-api
run "4/6: deploy Sandbox Gateway (payment authz — externally quarantined)" ./deploy.sh api-gateway

# ── 8. Deployed E2E (fixture-only) — release ONLY if every item passes ────────
status "step 5/6: deployed 58-item payment E2E (fixture-only, quarantined)"
( cd "$REPO_ROOT" && bash tools/e2e/dev-console/rt04e-payment-e2e.sh ) \
  || die "deployed payment E2E FAILED — keeping PAYMENT_CAPABILITY_RELEASED=false, revoking fixtures" 9

status "step 6/6: all E2E green — the payment-release control may now be enabled"
status "         (release is a SEPARATE approved operator action; this runner never enables it)"
status "RT04E rollout runner: migration + deploy + E2E complete — see gate outputs before release"
